// Trigger-based Vignette frequency control (browser only). Counters live in this browser's
// localStorage and reset at Asia/Dhaka midnight. Pure functions take the state explicitly so
// they can be tested without a browser. Thresholds and the daily cap are deliberately low.
export const VIGNETTE_STATE_KEY = 'pincraft.vignette-frequency.v1';
export const VIGNETTE_GENERATIONS_TRIGGER = 2; // completed pin packs + articles, counted together
export const VIGNETTE_PAGE_VIEWS_TRIGGER = 3; // marketing page views in one Dhaka day (fires once per day)
export const VIGNETTE_DAILY_CAP = 3; // total Vignette triggers per browser per Dhaka day

export function dhakaDay(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now));
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
}

const freshState = day => ({ day, generations: 0, pageViews: 0, pageTriggerUsed: false, queued: null, shows: 0 });
const isCount = value => Number.isInteger(value) && value >= 0 && value < 100000;

export function readVignetteState(storage, now = Date.now()) {
  const today = dhakaDay(now);
  try {
    const saved = JSON.parse(storage.getItem(VIGNETTE_STATE_KEY) || 'null');
    if (
      saved && saved.day === today && isCount(saved.generations) && isCount(saved.pageViews) && isCount(saved.shows) &&
      typeof saved.pageTriggerUsed === 'boolean' && (saved.queued === null || saved.queued === 'generation' || saved.queued === 'page')
    ) return saved;
  } catch {
    // Unreadable storage starts a fresh day-state rather than blocking the page.
  }
  return freshState(today);
}

export function writeVignetteState(storage, state) {
  try {
    storage.setItem(VIGNETTE_STATE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// Queues one show if nothing is already waiting and the daily cap allows it.
function queueShow(state, reason) {
  if (state.queued || state.shows >= VIGNETTE_DAILY_CAP) return { state, queued: null };
  const next = { ...state, queued: reason, shows: state.shows + 1 };
  return { state: next, queued: reason };
}

export function countGeneration(state) {
  const next = { ...state, generations: state.generations + 1 };
  if (next.generations < VIGNETTE_GENERATIONS_TRIGGER) return { state: next, queued: null };
  // Reset at the trigger so the next show needs two more completions.
  return queueShow({ ...next, generations: 0 }, 'generation');
}

export function countPageView(state) {
  const next = { ...state, pageViews: state.pageViews + 1 };
  if (next.pageTriggerUsed || next.pageViews < VIGNETTE_PAGE_VIEWS_TRIGGER) return { state: next, queued: null };
  // Once per day: the page trigger is used up even when the daily cap blocks it.
  return queueShow({ ...next, pageTriggerUsed: true }, 'page');
}

export function consumeQueuedShow(state) {
  if (!state.queued) return { state, show: false };
  return { state: { ...state, queued: null }, show: true };
}

// Browser helpers used by the generators and the ad manager.
export function recordGenerationCompleted(storage = globalThis.localStorage, now = Date.now()) {
  if (!storage) return null;
  const result = countGeneration(readVignetteState(storage, now));
  writeVignetteState(storage, result.state);
  return result.queued;
}

export function recordMarketingPageView(storage = globalThis.localStorage, now = Date.now()) {
  if (!storage) return { show: false };
  const counted = countPageView(readVignetteState(storage, now));
  const consumed = consumeQueuedShow(counted.state);
  writeVignetteState(storage, consumed.state);
  return { show: consumed.show, reason: counted.queued };
}
