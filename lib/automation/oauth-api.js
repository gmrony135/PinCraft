import 'server-only';
import { cookieOptions } from '@/lib/auth-server';
import { databaseHealth } from './db.mjs';
import { vaultReady } from './vault.mjs';
import { AutomationError } from './errors.mjs';
import { imageOrigin } from './images.mjs';
import { oauthCookieName,OAUTH_TTL_SECONDS,requireOAuthConfig,validProvider,oauthConfig } from './oauth-config.mjs';
export const oauthHeaders={'Cache-Control':'no-store, private',Vary:'Cookie','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
export async function integrationReady(provider){
  if(!validProvider(provider))throw new AutomationError('invalid_provider','Choose Pinterest or Blogger.',{status:404});
  const config=requireOAuthConfig(provider);
  if(!vaultReady()||!(await databaseHealth()).ready)throw new AutomationError('oauth_setup_required','Encrypted cloud OAuth storage is not configured. No account was connected.',{status:503});
  return config;
}
export function oauthCookie(response,request,provider,value){response.cookies.set(oauthCookieName(provider),value,{...cookieOptions(request,value?OAUTH_TTL_SECONDS:0),path:new URL(oauthConfig(provider).redirectUri||`https://invalid.invalid/api/integrations/${provider}/callback`).pathname});return response;}
export function canonicalOAuthRequest(request){
  const configured=imageOrigin();
  const url=new URL(request.url);
  const host=request.headers.get('x-forwarded-host')||request.headers.get('host');
  const proto=request.headers.get('x-forwarded-proto')||url.protocol.slice(0,-1);
  return configured&&(url.origin===configured||`${proto}://${host}`===configured);
}
