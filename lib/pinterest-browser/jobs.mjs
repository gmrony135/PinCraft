// Pure rules for uploaded sessions, queued pins, and pacing. No I/O.
import {canPublishAnotherPin} from './policy.mjs';
export const SESSION_MAX_BYTES = 512 * 1024;
export const MIN_SPACING_MS = 120 * 60000; // at least 2 hours between pins
const ALLOWED_TOP_KEYS = ['cookies', 'origins'];

// Accepts only a Playwright storage-state export (cookies and origins). Never a password.
export function validateStorageState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Upload the session export file (JSON), not text.');
  const extra = Object.keys(value).filter(key => !ALLOWED_TOP_KEYS.includes(key));
  if (extra.length) throw new Error('This file contains fields a session export does not have. Export the session again and upload that file only.');
  const cookies = value.cookies;
  if (!Array.isArray(cookies) || cookies.length < 1 || cookies.length > 500) throw new Error('The session export has no usable cookies.');
  for (const cookie of cookies) {
    if (!cookie || typeof cookie !== 'object' || typeof cookie.name !== 'string' || typeof cookie.value !== 'string' || typeof cookie.domain !== 'string') throw new Error('A cookie in the export is malformed.');
    if (cookie.name.length > 200 || cookie.value.length > 4096) throw new Error('A cookie in the export is too large.');
  }
  if (!cookies.some(cookie => /(^|\.)pinterest\.com$/i.test(cookie.domain.replace(/^\./, '')))) throw new Error('The export has no Pinterest cookies. Export the session from pinterest.com.');
  if (value.origins !== undefined && (!Array.isArray(value.origins) || value.origins.length > 200)) throw new Error('The session export origins are malformed.');
  return {cookies, origins: value.origins || []};
}

const https = raw => { try { const u = new URL(raw); return u.protocol === 'https:' ? u.toString() : null; } catch { return null; } };

// Validates the owner's queued pin. Image and link must be https.
export function validateJobInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Send the pin details as a JSON object.');
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  const boardName = typeof raw.boardName === 'string' ? raw.boardName.trim() : '';
  const imageURL = https(raw.imageURL), link = https(raw.link);
  if (!title || title.length > 100) throw new Error('Title is required (up to 100 characters).');
  if (description.length > 500) throw new Error('Description is up to 500 characters.');
  if (!boardName || boardName.length > 100) throw new Error('Board name is required (up to 100 characters).');
  if (!imageURL) throw new Error('Image URL must be https.');
  if (!link) throw new Error('Destination link must be https.');
  return {title, description, boardName, imageURL, link};
}

// Decides whether the runner may post now. Enforces the 6/day ceiling and spacing.
export function nextActionAllowed({postedToday, lastPostAt, now}) {
  if (!canPublishAnotherPin(postedToday)) return {allowed: false, reason: 'daily_limit'};
  if (lastPostAt && now - lastPostAt < MIN_SPACING_MS) return {allowed: false, reason: 'spacing', retryAt: lastPostAt + MIN_SPACING_MS};
  return {allowed: true};
}

// Start of the current day in Asia/Dhaka (UTC+6, no DST), the day the 6/day ceiling resets on.
export function dhakaDayStart(now) {
  const day = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Dhaka'}).format(new Date(now));
  return Date.parse(`${day}T00:00:00+06:00`);
}
