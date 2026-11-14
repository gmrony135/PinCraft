import { apiError, json, readBody, sessionUser } from '@/lib/automation/api';
import { authSettings, readSession, SESSION_COOKIE } from '@/lib/auth-server';
import { getDatabase } from '@/lib/automation/db.mjs';
import { infrastructureStatus } from '@/lib/automation/infrastructure.mjs';
import { workspaceStatus, addWebsite, removeWebsite, saveAutomation, toggleAutomation, archiveAutomation } from '@/lib/automation/channels.mjs';
import { AutomationError } from '@/lib/automation/errors.mjs';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic'; export const maxDuration = 90;
export async function GET(request) {
  try { const user = await readSession(request.cookies.get(SESSION_COOKIE)?.value), infrastructure = await infrastructureStatus(authSettings().configured); return json(await workspaceStatus(infrastructure.databaseReady ? getDatabase() : null, user && infrastructure.databaseReady ? user : null, infrastructure)); } catch (issue) { return apiError(issue); }
}
export async function POST(request) {
  try {
    const user = await sessionUser(request, true), body = await readBody(request), db = getDatabase();
    if (body.action === 'add_website') await addWebsite(db, user.id, body);
    else if (body.action === 'remove_website') await removeWebsite(db, user.id, body);
    else if (body.action === 'save_automation') await saveAutomation(db, user.id, body);
    else if (body.action === 'toggle_automation') await toggleAutomation(db, user.id, body, await infrastructureStatus(authSettings().configured));
    else if (body.action === 'archive_automation') await archiveAutomation(db, user.id, body);
    else throw new AutomationError('invalid_action', 'Choose a supported workspace action.');
    return json(await workspaceStatus(db, user, await infrastructureStatus(authSettings().configured)));
  } catch (issue) { return apiError(issue); }
}
