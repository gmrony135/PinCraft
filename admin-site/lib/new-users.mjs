// Splits users into "New" (registered less than 24 hours ago) and the regular list.
// A user is in exactly one list. createdAt missing or unreadable means not new.
export const NEW_USER_WINDOW_MS = 24 * 3600000;

export function isNewUser(joined, now = Date.now()) {
  const created = joined ? Date.parse(joined) : NaN;
  if (!Number.isFinite(created)) return false;
  return created <= now && created > now - NEW_USER_WINDOW_MS;
}

export function splitNewUsers(rows, now = Date.now()) {
  const fresh = [], regular = [];
  for (const row of rows) (isNewUser(row.joined, now) ? fresh : regular).push(row);
  // Newest first. Rows arrive already sorted by joined date, but sort again so the order never depends on the caller.
  fresh.sort((a, b) => Date.parse(b.joined) - Date.parse(a.joined));
  return { fresh, regular };
}
