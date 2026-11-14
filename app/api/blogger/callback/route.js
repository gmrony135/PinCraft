// Both this canonical URL and the legacy callback use the same owner-, state-,
// browser- and revision-bound OAuth implementation. No Worker is involved.
import { GET as completeBloggerOAuth } from '../../integrations/[provider]/callback/route';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(request){return completeBloggerOAuth(request,{params:Promise.resolve({provider:'blogger'})});}
