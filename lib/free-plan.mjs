// Owner-confirmed product terms. Keep UI and server enforcement together.
export const FREE_PIN_PACKS_PER_DAY = 20;
export const FREE_RESET_TIMEZONE = 'Asia/Dhaka';
export const FREE_PLAN_STATEMENT = 'Free plan: 1 Blogger website, 20 Pin idea packs per day, and articles daily with no significant per-account limit. Resets after midnight Bangladesh time (Asia/Dhaka), the same for every account.';
export const FREE_PLAN_SAFETY = 'Pin artwork is separate. Shared service safety limits, cooldowns and provider availability still apply; generation is not guaranteed unlimited.';
export function freeUsageDay(now = Date.now()) {return new Date(Number(now)+6*60*60*1000).toISOString().slice(0,10);}
export function nextFreeReset(now = Date.now()) {return new Date(Date.parse(`${freeUsageDay(now)}T00:00:00+06:00`)+86400000).toISOString();}
