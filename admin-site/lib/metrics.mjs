// Live metrics. Every call reads the data stores fresh: no cache, no stored snapshot.
// Anything PinCraft does not record is returned as null with a plain reason, never estimated.
import { createHash } from 'node:crypto';
import { auth, db } from './firebase.mjs';
import { LIMITS, MONETAG_TAG_URLS, PROVIDERS } from './config.mjs';

const DAY = 86400000;
// Same day boundary as PinCraft's free plan: Asia/Dhaka (UTC+6), midnight reset.
export const dayKey = ms => new Date(ms + 6 * 3600000).toISOString().slice(0, 10);
const keyFor = uid => createHash('sha256').update(uid).digest('hex');
const num = value => Number(value) || 0;

async function listAllUsers() {
  const users = [];
  let pageToken;
  do {
    const page = await auth().listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index]);
    }
  }));
  return out;
}

async function probeTag(url) {
  const started = Date.now();
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(8000) });
    await response.arrayBuffer().catch(() => {});
    return { url, status: response.status, reachable: response.ok, ms: Date.now() - started, checkedAt };
  } catch (error) {
    return { url, status: null, reachable: false, ms: Date.now() - started, checkedAt, error: error?.name === 'TimeoutError' ? 'timeout' : 'unreachable' };
  }
}

async function userRow(user, ctx) {
  const uid = user.uid;
  const key = keyFor(uid);
  const account = ctx.database.collection('pincraft_accounts').doc(key);
  const queue = ctx.database.collection('pin_queue').doc(uid).collection('items');
  const [usageSnap, queueCount, postedCount] = await Promise.all([
    account.collection('aiUsage').get(),
    queue.count().get(),
    queue.where('postedDay', '==', ctx.today).count().get(),
  ]);
  const sub = ctx.subs.get(key), join = ctx.joins.get(uid);

  const days = usageSnap.docs.map(doc => ({ day: doc.id, pinPacks: num(doc.get('pin_packs')), text: num(doc.get('text')), image: num(doc.get('image')) }));
  const today = days.find(day => day.day === ctx.today) || { pinPacks: 0, text: 0, image: 0 };
  const total = days.reduce((sum, day) => ({ pinPacks: sum.pinPacks + day.pinPacks, text: sum.text + day.text, image: sum.image + day.image }), { pinPacks: 0, text: 0, image: 0 });
  const active = days.filter(day => day.pinPacks + day.text + day.image > 0).map(day => day.day).sort();
  const lastActiveDay = active.at(-1) || null;

  return {
    uid,
    name: user.displayName || (user.email ? user.email.split('@')[0] : uid.slice(0, 8)),
    email: user.email || null,
    joined: user.metadata?.creationTime || null,
    lastSignIn: user.metadata?.lastSignInTime || null,
    plan: sub?.get('tier') === 'paid' ? 'Paid' : 'Free',
    telegramVerified: join?.get('telegramJoined') === true,
    usageToday: today,
    usageTotal: total,
    lastActiveDay,
    activeIn7: active.some(day => day >= ctx.day7),
    activeIn30: active.some(day => day >= ctx.day30),
    pinQueueItems: queueCount.data().count,
    pinQueuePostedToday: postedCount.data().count,
  };
}

export async function collectMetrics() {
  const now = Date.now();
  const today = dayKey(now);
  const day7 = dayKey(now - 6 * DAY);
  const day30 = dayKey(now - 29 * DAY);
  const database = db();

  const users = await listAllUsers();
  const keys = users.map(user => keyFor(user.uid));
  const subRefs = keys.map(key => database.collection('pincraft_subscriptions').doc(key));
  const joinRefs = users.map(user => database.collection('showcase_joins').doc(user.uid));
  const [subSnaps, joinSnaps] = await Promise.all([
    subRefs.length ? database.getAll(...subRefs) : [],
    joinRefs.length ? database.getAll(...joinRefs) : [],
  ]);
  const ctx = {
    database, today, day7, day30,
    subs: new Map(subSnaps.map((snap, i) => [keys[i], snap])),
    joins: new Map(joinSnaps.map((snap, i) => [users[i].uid, snap])),
  };

  const rows = await mapLimit(users, 20, user => userRow(user, ctx));
  rows.sort((a, b) => (b.joined || '').localeCompare(a.joined || ''));

  const sum = (fn) => rows.reduce((total, row) => total + fn(row), 0);
  const jobsSnap = await database.collection('pincraft_jobs').select('state').get();
  const jobsByState = {};
  jobsSnap.docs.forEach(doc => { const state = String(doc.get('state') || 'unknown'); jobsByState[state] = (jobsByState[state] || 0) + 1; });

  const tags = await Promise.all(MONETAG_TAG_URLS.map(probeTag));

  return {
    generatedAt: new Date(now).toISOString(),
    today,
    limits: LIMITS,
    summary: {
      totalUsers: rows.length,
      activeUsersToday: rows.filter(row => row.usageToday.pinPacks + row.usageToday.text + row.usageToday.image > 0).length,
      activeUsers7d: rows.filter(row => row.activeIn7).length,
      activeUsers30d: rows.filter(row => row.activeIn30).length,
      pinPacksToday: sum(row => row.usageToday.pinPacks),
      aiRequestsToday: sum(row => row.usageToday.text + row.usageToday.image),
      textRequestsToday: sum(row => row.usageToday.text),
      imageRequestsToday: sum(row => row.usageToday.image),
      pinQueueItems: sum(row => row.pinQueueItems),
      pinQueuePostedToday: sum(row => row.pinQueuePostedToday),
    },
    users: rows.map(({ usageToday, usageTotal, activeIn7, activeIn30, pinQueueItems, pinQueuePostedToday, ...row }) => row),
    usage: rows.map(row => ({ uid: row.uid, name: row.name, email: row.email, usageToday: row.usageToday, usageTotal: row.usageTotal, lastActiveDay: row.lastActiveDay, pinQueueItems: row.pinQueueItems, pinQueuePostedToday: row.pinQueuePostedToday })),
    providers: PROVIDERS.map(provider => ({ ...provider, requests: null, cost: null, note: 'Not recorded per provider by PinCraft. Cost is not available.' })),
    monetag: {
      impressions: { inPagePush: null, vignette: null, classicPush: null, note: 'Not recorded by PinCraft. The site has no server-side ad-impression log.' },
      profit: null,
      cpm: null,
      earningsNote: 'Exact earnings, profit and CPM are only in the Monetag dashboard. No Monetag API is connected here.',
      lastAdRequestResult: null,
      noFill: null,
      adStateNote: 'Not measured on the server. A live check of the tag scripts is shown below; it does not prove ads show to visitors.',
      tags,
    },
    jobs: { total: jobsSnap.size, byState: jobsByState },
    notes: [
      'All figures are read live from Firestore and Firebase Auth on each refresh.',
      `Daily limits shown are the PinCraft defaults: ${LIMITS.pinPacks} pin packs, ${LIMITS.text} text and ${LIMITS.image} image requests per user per day, resetting at midnight Asia/Dhaka.`,
      'Articles are counted inside text requests; PinCraft does not store them as a separate count.',
      'Pin packs are PinCraft pin idea packs. Pin queue items are pins saved to the Pin Queue.',
      'Active users are users with any PinCraft AI usage on the day in question.',
    ],
  };
}
