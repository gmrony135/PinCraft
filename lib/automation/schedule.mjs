import { CATEGORY_IDS, CATEGORIES, MAX_PINS_PER_DAY } from '../product.mjs';
export const DEFAULT_POSTING_TIMES = {
  1: ['19:00'], 2: ['11:00', '19:00'], 3: ['09:00', '15:00', '20:00'],
  4: ['09:00', '13:00', '17:00', '21:00'], 5: ['08:00', '11:00', '14:00', '17:00', '20:00'],
  6: ['08:00', '10:30', '13:00', '15:30', '18:00', '20:30'],
};
export function suggestedTimes(count) { return [...(DEFAULT_POSTING_TIMES[count] || DEFAULT_POSTING_TIMES[3])]; }
export function normalizeAutomationSchedule(raw) {
  if (!Number.isInteger(raw.dailyLimit) || raw.dailyLimit < 1 || raw.dailyLimit > MAX_PINS_PER_DAY) throw new Error('Choose 1–6 Pins per day. Six is a hard limit per Pinterest account, not per board.');
  if (typeof raw.timezone !== 'string' || raw.timezone.length > 50) throw new Error('Choose a valid timezone.');
  try { new Intl.DateTimeFormat('en', { timeZone: raw.timezone }).format(); } catch { throw new Error('Choose a valid timezone.'); }
  if (!Array.isArray(raw.categoryIds) || !raw.categoryIds.length || raw.categoryIds.length > CATEGORIES.length || raw.categoryIds.some(id => !CATEGORY_IDS.includes(id)) || new Set(raw.categoryIds).size !== raw.categoryIds.length) throw new Error('Choose at least one of the available content categories.');
  if (!Array.isArray(raw.postingTimes) || raw.postingTimes.length !== raw.dailyLimit || raw.postingTimes.some(time => typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):(?:00|30)$/.test(time)) || new Set(raw.postingTimes).size !== raw.dailyLimit) throw new Error('Choose one unique half-hour time slot for each daily Pin.');
  const times = [...raw.postingTimes].sort(), minutes = times.map(time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3)));
  for (let index = 1; index < minutes.length; index++) if (minutes[index] - minutes[index - 1] < 60) throw new Error('Leave at least one hour between posting slots.');
  if (minutes.length > 1 && 1440 - minutes.at(-1) + minutes[0] < 60) throw new Error('Leave at least one hour between the last and first daily slots.');
  if (!['en', 'bn'].includes(raw.language || 'en')) throw new Error('Choose English or Bengali.');
  return { dailyLimit: raw.dailyLimit, timezone: raw.timezone, categoryIds: [...raw.categoryIds], postingTimes: times, language: raw.language || 'en' };
}
const formatterCache = new Map();
function parts(date, timezone) {
  if (!formatterCache.has(timezone)) formatterCache.set(timezone, new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }));
  return Object.fromEntries(formatterCache.get(timezone).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}
function candidates(date, time, timezone) {
  const [year, month, day] = date.split('-').map(Number), [hour, minute] = time.split(':').map(Number), wall = Date.UTC(year, month - 1, day, hour, minute), offsets = new Set();
  // Sample both sides of timezone transitions. Checking the wall-clock result
  // handles skipped times; a repeated DST slot is selected only once per date.
  for (const delta of [-36, -12, 0, 12, 36]) {
    const instant = wall + delta * 3600000, p = parts(new Date(instant), timezone);
    offsets.add(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - instant);
  }
  return [...offsets].map(offset => wall - offset).filter(value => {
    const p = parts(new Date(value), timezone);
    return `${p.year}-${p.month}-${p.day}` === date && `${p.hour}:${p.minute}` === time;
  }).sort((a, b) => a - b).slice(0, 1);
}
export function nextScheduledAt(after, timezone, postingTimes) {
  const ms = new Date(after).getTime();
  if (!Number.isFinite(ms) || !Array.isArray(postingTimes) || !postingTimes.length) throw new Error('A saved schedule is required.');
  const p = parts(new Date(ms), timezone), midnight = Date.UTC(+p.year, +p.month - 1, +p.day);
  for (let offset = 0; offset < 5; offset++) {
    const date = new Date(midnight + offset * 86400000).toISOString().slice(0, 10);
    const next = postingTimes.flatMap(time => candidates(date, time, timezone)).filter(value => value > ms).sort((a, b) => a - b)[0];
    if (next !== undefined) return new Date(next);
  }
  throw new Error('No valid upcoming posting time was found.');
}
export function scheduleSummary(schedule) { return `${schedule.dailyLimit} Pin${schedule.dailyLimit === 1 ? '' : 's'}/day · ${schedule.postingTimes.join(', ')} · ${schedule.timezone}`; }
