// Per-user manual pin queue. PinCraft never logs into Pinterest and never posts on the user's behalf.
// The user queues a pin here, opens Pinterest's own pin creator, and marks it posted themselves.
import { AutomationError } from '../automation/errors.mjs';

export const PIN_QUEUE_COLLECTION = 'pin_queue';
export const DAILY_POST_LIMIT = 6;
export const MAX_QUEUE_ITEMS = 300;
export const PINTEREST_PIN_CREATOR_URL = 'https://www.pinterest.com/pin-creation-tool/';
const TIMEZONE = 'Asia/Dhaka';

function text(value, field, { max, required = false }) {
  const out = typeof value === 'string' ? value.trim() : '';
  if (required && !out) throw new AutomationError('invalid_request', `${field} is required.`, { status: 400 });
  if (out.length > max) throw new AutomationError('invalid_request', `${field} must be ${max} characters or fewer.`, { status: 400 });
  return out;
}

function httpsUrl(value, field, { required = false } = {}) {
  const raw = text(value, field, { max: 2000, required });
  if (!raw) return '';
  let url;
  try { url = new URL(raw); } catch { throw new AutomationError('invalid_request', `${field} must be a valid web address.`, { status: 400 }); }
  if (url.protocol !== 'https:') throw new AutomationError('invalid_request', `${field} must start with https://.`, { status: 400 });
  return url.toString();
}

export function validatePin(input = {}) {
  return {
    title: text(input.title, 'Title', { max: 100, required: true }),
    description: text(input.description, 'Description', { max: 500 }),
    link: httpsUrl(input.link, 'Destination link', { required: true }),
    imageUrl: httpsUrl(input.imageUrl, 'Image link', { required: true }),
  };
}

// Calendar day in Dhaka time, used for the per-day cap.
export function dayKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function remainingToday(postedToday) {
  return Math.max(0, DAILY_POST_LIMIT - postedToday);
}

function itemsRef(db, uid) {
  return db.collection(PIN_QUEUE_COLLECTION).doc(uid).collection('items');
}

function postedTodayQuery(db, uid, day) {
  return itemsRef(db, uid).where('postedDay', '==', day);
}

export async function listQueue(db, uid, now = new Date()) {
  const [items, posted] = await Promise.all([
    itemsRef(db, uid).orderBy('createdAt', 'desc').limit(MAX_QUEUE_ITEMS).get(),
    postedTodayQuery(db, uid, dayKey(now)).get(),
  ]);
  const postedToday = posted.size;
  return {
    items: items.docs.map(doc => ({ id: doc.id, ...publicItem(doc.data()) })),
    postedToday,
    dailyLimit: DAILY_POST_LIMIT,
    remaining: remainingToday(postedToday),
    pinterestCreatorUrl: PINTEREST_PIN_CREATOR_URL,
  };
}

function publicItem(data) {
  return {
    title: data.title, description: data.description, link: data.link, imageUrl: data.imageUrl,
    status: data.status, createdAt: data.createdAt?.toDate?.() ?? data.createdAt ?? null,
    postedAt: data.postedAt?.toDate?.() ?? data.postedAt ?? null,
  };
}

export async function addPin(db, uid, input, now = new Date()) {
  const pin = validatePin(input);
  const current = await itemsRef(db, uid).limit(MAX_QUEUE_ITEMS + 1).get();
  if (current.size >= MAX_QUEUE_ITEMS) throw new AutomationError('queue_full', `Your queue holds ${MAX_QUEUE_ITEMS} pins. Remove some before adding more.`, { status: 409 });
  const id = crypto.randomUUID();
  await itemsRef(db, uid).doc(id).set({ ...pin, status: 'queued', createdAt: now });
  return { id };
}

// Marks a pin as posted by the user. Enforces the 6-per-day cap inside a transaction.
export async function markPosted(db, uid, id, now = new Date()) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw new AutomationError('invalid_request', 'Pin not found.', { status: 404 });
  const day = dayKey(now);
  const ref = itemsRef(db, uid).doc(id);
  await db.runTransaction(async tx => {
    const item = await tx.get(ref);
    if (!item.exists) throw new AutomationError('not_found', 'Pin not found.', { status: 404 });
    if (item.data().status === 'posted') return;
    const posted = await tx.get(postedTodayQuery(db, uid, day));
    if (posted.size >= DAILY_POST_LIMIT) throw new AutomationError('daily_limit', `You have reached ${DAILY_POST_LIMIT} posted pins today. Mark more tomorrow.`, { status: 429 });
    tx.update(ref, { status: 'posted', postedAt: now, postedDay: day });
  });
  return { id };
}

export async function removePin(db, uid, id) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw new AutomationError('invalid_request', 'Pin not found.', { status: 404 });
  await itemsRef(db, uid).doc(id).delete();
  return { id };
}
