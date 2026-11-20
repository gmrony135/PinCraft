import { accountRef } from '../automation/firestore.mjs';
import { firebaseAuth } from '../firebase/admin.mjs';
import {
  ADMIN_NOTIFY_EMAIL, EMAIL_LAUNCH_AT, LIMITS, REENGAGE_MAX_LAPSE_MS, REENGAGE_MIN_LAPSE_MS,
  REENGAGE_SPACING_MS, VISIT_WRITE_SPACING_MS, unsubscribeSecret,
} from './config.mjs';
import { enqueue } from './outbox.mjs';
import { unsubscribeUrl } from './token.mjs';
import { adminNewUserEmail, adminPaymentEmail, reengageEmail, weeklyEmail, welcomeEmail } from './templates.mjs';

const DAY = 86400000;
// Asia/Dhaka is UTC+6 with no daylight saving, so a fixed offset is exact.
const dhaka = ms => new Date(ms + 6 * 3600000);
export const dhakaDay = ms => dhaka(ms).toISOString().slice(0, 10);
export const dhakaStamp = ms => new Date(ms).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' });

// Weekly summary goes out on Saturday from 10:00 Dhaka time. Repeated runs are deduplicated by key.
export function isWeeklyWindow(now) {
  const d = dhaka(now);
  return d.getUTCDay() === 6 && d.getUTCHours() >= 10;
}

// Key for the week that started on the most recent Saturday (Dhaka date).
export function weekKey(now) {
  const daysSinceSaturday = (dhaka(now).getUTCDay() - 6 + 7) % 7;
  return dhakaDay(now - daysSinceSaturday * DAY);
}

// Re-engagement rule: no visit for at least 24 hours, lapsed no more than 7 days,
// and at most one such email per 24 hours. Pure function, unit tested.
export function decideReengage({ lastVisitMs, lastReengageMs, now, unsubscribed }) {
  if (unsubscribed) return { send: false, reason: 'unsubscribed' };
  if (!Number.isFinite(lastVisitMs)) return { send: false, reason: 'no_activity_record' };
  const lapse = now - lastVisitMs;
  if (lapse < REENGAGE_MIN_LAPSE_MS) return { send: false, reason: 'visited_within_24h' };
  if (lapse > REENGAGE_MAX_LAPSE_MS) return { send: false, reason: 'lapsed_over_7_days' };
  if (Number.isFinite(lastReengageMs) && now - lastReengageMs < REENGAGE_SPACING_MS) return { send: false, reason: 'sent_within_24h' };
  return { send: true, reason: 'eligible' };
}

// Weekly numbers come only from stored records: AI usage day documents and Pin Queue items marked posted.
// Blogger posts are not included, because no per-user published-post count is stored in a form this summary can read.
export function summarizeWeek({ usageDays, postedAtMs, now }) {
  const weekStart = dhakaDay(now - 6 * DAY);
  const today = dhakaDay(now);
  const inWeek = usageDays.filter(day => day.id >= weekStart && day.id <= today);
  const sum = key => inWeek.reduce((total, day) => total + (Number(day[key]) || 0), 0);
  const todayDoc = usageDays.find(day => day.id === today) || {};
  return {
    stats: {
      pinPacks: sum('pin_packs'),
      text: sum('text'),
      image: sum('image'),
      pinsPosted: postedAtMs.filter(ms => ms >= now - 7 * DAY && ms <= now).length,
    },
    today: { pinPacks: Number(todayDoc.pin_packs) || 0, text: Number(todayDoc.text) || 0, image: Number(todayDoc.image) || 0 },
  };
}

async function listAllAuthUsers() {
  const auth = firebaseAuth();
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

const millis = value => (value?.toDate ? value.toDate().getTime() : Number.isFinite(Date.parse(value)) ? Date.parse(value) : NaN);
const eligibleAccount = user => !user.disabled && Boolean(user.email) && user.emailVerified === true;
const createdMs = user => Date.parse(user.metadata?.creationTime || '');

// Builds the list of emails that should be queued now. Reads only; nothing is written here.
export async function planEmails(db, now = Date.now(), { env = process.env, users: suppliedUsers } = {}) {
  const plan = { welcome: [], admin: [], payments: [], weekly: [], reengage: [], skipped: {} };
  const skip = (reason) => { plan.skipped[reason] = (plan.skipped[reason] || 0) + 1; };
  const users = suppliedUsers || await listAllAuthUsers();
  const secret = unsubscribeSecret(env);
  const weeklyOpen = isWeeklyWindow(now);
  const week = weekKey(now);

  // 1) Admin: a new registration since launch. Registration is recorded even if the email is still unverified.
  for (const user of users) {
    const created = createdMs(user);
    if (!Number.isFinite(created) || created < EMAIL_LAUNCH_AT) continue;
    plan.admin.push({
      key: `admin:newuser:${user.uid}`, to: ADMIN_NOTIFY_EMAIL, uid: null, template: 'admin_new_user',
      ...adminNewUserEmail({ email: user.email || '(no email)', name: user.displayName || '', registeredAt: dhakaStamp(created) }),
    });
  }

  // 2) Admin: payment requests since launch. Read only. The payment record is not modified.
  const paymentSnap = await db.collection('pincraft_payment_requests').where('created_at', '>=', new Date(EMAIL_LAUNCH_AT)).get();
  for (const doc of paymentSnap.docs) {
    const row = doc.data();
    const payer = users.find(user => user.uid === row.user_id);
    const submitted = millis(row.created_at);
    plan.payments.push({
      key: `admin:payment:${doc.id}`, to: ADMIN_NOTIFY_EMAIL, uid: null, template: 'admin_payment',
      ...adminPaymentEmail({
        amount: row.amount_bdt, method: row.method, transactionLast4: row.transaction_suffix || '—',
        payerLast3: row.payer_suffix || '—', email: payer?.email || null, submittedAt: dhakaStamp(submitted),
      }),
    });
  }

  // Per-user checks. Each account is read once.
  for (const user of users) {
    if (user.disabled) { skip('disabled_account'); continue; }
    if (!user.email) { skip('no_email'); continue; }
    if (!eligibleAccount(user)) { skip('not_verified'); continue; }
    const uid = user.uid;
    const created = createdMs(user);

    // Welcome: once per account, only after verification, only for accounts created since launch.
    if (Number.isFinite(created) && created >= EMAIL_LAUNCH_AT) {
      const welcome = welcomeEmail({ name: user.displayName || user.email.split('@')[0] });
      plan.welcome.push({ key: `welcome:${uid}`, to: user.email, uid, template: 'welcome', ...welcome });
    }

    const [stateSnap, activitySnap] = await Promise.all([
      db.collection('email_state').doc(uid).get(),
      db.collection('user_activity').doc(uid).get(),
    ]);
    const state = stateSnap.exists ? stateSnap.data() : {};
    const activity = activitySnap.exists ? activitySnap.data() : {};

    if (!secret) { skip('unsubscribe_secret_missing'); }
    const unsubWeekly = state.unsubscribedWeekly === true, unsubAll = state.unsubscribedAll === true;
    const weeklyUrl = secret ? unsubscribeUrl(uid, 'weekly', secret) : '';
    const allUrl = secret ? unsubscribeUrl(uid, 'all', secret) : '';

    // 3) Weekly summary: Saturday window, skip accounts with no activity that week.
    if (weeklyOpen && secret && !unsubWeekly && !unsubAll) {
      const ref = accountRef(db, uid);
      const [usageSnap, postedSnap] = await Promise.all([
        ref.collection('aiUsage').get(),
        db.collection('pin_queue').doc(uid).collection('items').where('postedAt', '>=', new Date(now - 7 * DAY)).get(),
      ]);
      const usageDays = usageSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const postedAtMs = postedSnap.docs.map(doc => millis(doc.get('postedAt')));
      const { stats, today } = summarizeWeek({ usageDays, postedAtMs, now });
      if (stats.pinPacks + stats.text + stats.image + stats.pinsPosted === 0) skip('weekly_no_activity');
      else {
        const mail = weeklyEmail({ name: user.displayName || user.email.split('@')[0], stats, today, weeklyUrl, allUrl });
        plan.weekly.push({ key: `weekly:${uid}:${week}`, to: user.email, uid, template: 'weekly_summary', ...mail });
      }
    } else if (weeklyOpen && !secret) {
      skip('weekly_blocked_no_secret');
    }

    // 4) Re-engagement: last visit (or first sign-in) between 24 hours and 7 days ago.
    if (!secret) continue;
    // Only a recorded visit counts. A sign-in time is not used, because visit tracking is new and active users would look lapsed.
    const visit = millis(activity.lastVisitAt);
    const decision = decideReengage({
      lastVisitMs: visit, lastReengageMs: millis(state.lastReengageAt), now, unsubscribed: unsubAll || state.unsubscribedReengage === true,
    });
    if (decision.send) {
      const mail = reengageEmail({ name: user.displayName || user.email.split('@')[0], weeklyUrl, allUrl });
      plan.reengage.push({ key: `reengage:${uid}:${dhakaDay(now)}`, to: user.email, uid, template: 'reengage', ...mail });
    } else {
      skip(`reengage_${decision.reason}`);
    }
  }
  return plan;
}

// Queues the planned messages. Duplicates are refused by the outbox key.
export async function applyPlan(db, plan, now = Date.now()) {
  const counts = { queued: 0, duplicate: 0 };
  for (const group of ['welcome', 'admin', 'payments', 'weekly', 'reengage']) {
    for (const item of plan[group]) {
      const result = await enqueue(db, { ...item, now });
      if (result === 'queued') counts.queued++; else counts.duplicate++;
      if (group === 'reengage' && result === 'queued') {
        await db.collection('email_state').doc(item.uid).set({ lastReengageAt: new Date(now) }, { merge: true });
      }
    }
  }
  return counts;
}

// Called after a verified sign-in. Only verified, post-launch accounts get a welcome. Duplicates are refused.
export async function enqueueWelcome(db, uid, now = Date.now()) {
  const user = await firebaseAuth().getUser(uid);
  if (!eligibleAccount(user)) return 'not_verified';
  const created = createdMs(user);
  if (!Number.isFinite(created) || created < EMAIL_LAUNCH_AT) return 'before_launch';
  const welcome = welcomeEmail({ name: user.displayName || user.email.split('@')[0] });
  return enqueue(db, { key: `welcome:${uid}`, to: user.email, uid, template: 'welcome', ...welcome, now });
}

// Records a visit. Writes at most once every 10 minutes per user.
export async function recordVisit(db, uid, now = Date.now()) {
  const ref = db.collection('user_activity').doc(uid);
  const snap = await ref.get();
  const last = snap.exists ? millis(snap.get('lastVisitAt')) : NaN;
  if (Number.isFinite(last) && now - last < VISIT_WRITE_SPACING_MS) return 'recent';
  await ref.set({ lastVisitAt: new Date(now) }, { merge: true });
  return 'recorded';
}

export { LIMITS };
