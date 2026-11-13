import { json } from '@/lib/automation/api';
import { publicAIStatus } from '@/lib/ai/config.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET() { return json(publicAIStatus()); }
