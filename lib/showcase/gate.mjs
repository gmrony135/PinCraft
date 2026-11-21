// Server-side action gate. Reading and browsing never call this. Every action that writes, publishes,
// or spends AI quota calls requireTelegramVerified BEFORE any AI request, quota reservation, or publish.
import { AutomationError } from '../automation/errors.mjs';
import { readJoinStatus } from './joins.mjs';
import { TELEGRAM_REQUIRED_CODE, TELEGRAM_REQUIRED_MESSAGE } from './telegram-required.mjs';

export async function requireTelegramVerified(db, uid) {
  const status = await readJoinStatus(db, uid);
  if (!status.telegramJoined) throw new AutomationError(TELEGRAM_REQUIRED_CODE, TELEGRAM_REQUIRED_MESSAGE, { status: 403 });
  return status;
}
