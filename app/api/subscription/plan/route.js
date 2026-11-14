import { json, apiError } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { planStatus } from '@/lib/billing/repository.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){try{return json(await planStatus(getDatabase()));}catch(issue){return apiError(issue);}}
