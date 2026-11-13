import "server-only";
import { createHash } from "node:crypto";
import { imageOrigin } from "./images.mjs";
import { AutomationError } from "./errors.mjs";
export const PINTEREST_SCOPES = ['pins:read','pins:write','boards:read','boards:write','user_accounts:read'];
export const BLOGGER_SCOPE = 'https://www.googleapis.com/auth/blogger';
export const OAUTH_PROVIDERS = ['pinterest','blogger'];
export const OAUTH_TTL_SECONDS = 600;
export const validProvider = (provider) => OAUTH_PROVIDERS.includes(provider);
export const oauthCookieName = (provider) => `pincraft.oauth.${provider}.v1`;
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const tokenAudience = (userId, provider) => `oauth:v1:${provider}:${userId}`;
export function oauthConfig(provider) {
  if (!validProvider(provider)) throw new AutomationError('invalid_provider','Choose Pinterest or Blogger.');
  const prefix=provider==='pinterest'?'PINTEREST':'BLOGGER';
  const clientId=(process.env[`${prefix}_CLIENT_ID`]||'').trim();
  const clientSecret=process.env[`${prefix}_CLIENT_SECRET`]||'';
  const origin=imageOrigin();
  const configured=Boolean(origin && /^[A-Za-z0-9._-]{3,220}$/.test(clientId) && clientSecret.length>=8 && clientSecret.length<=6000 && !/[\u0000-\u001f\u007f]/.test(clientSecret));
  return {provider,configured,clientId,clientSecret,redirectUri:origin?`${origin}/api/integrations/${provider}/callback`:null};
}
export function requireOAuthConfig(provider) {
  const config=oauthConfig(provider);
  if(!config.configured)throw new AutomationError('oauth_setup_required',`${provider==='pinterest'?'Pinterest':'Blogger'} OAuth needs the server app ID, app secret and registered HTTPS callback URL. No account was simulated.`,{status:503});
  return config;
}
export function authorizationURL(provider,state,challenge=null) {
  const config=requireOAuthConfig(provider);
  const url=new URL(provider==='pinterest'?'https://www.pinterest.com/oauth/':'https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id',config.clientId);
  url.searchParams.set('redirect_uri',config.redirectUri);
  url.searchParams.set('response_type','code');
  url.searchParams.set('scope',provider==='pinterest'?PINTEREST_SCOPES.join(','):BLOGGER_SCOPE);
  url.searchParams.set('state',state);
  if(provider==='blogger'){
    url.searchParams.set('access_type','offline');url.searchParams.set('prompt','consent');url.searchParams.set('include_granted_scopes','false');
    if(challenge){url.searchParams.set('code_challenge',challenge);url.searchParams.set('code_challenge_method','S256');}
  }
  return url.href;
}
export const revocationLink=(provider)=>provider==='pinterest'?'https://www.pinterest.com/settings/security':'https://myaccount.google.com/permissions';
export function publicOAuthConfig(){return Object.fromEntries(OAUTH_PROVIDERS.map(provider=>{const c=oauthConfig(provider);return [provider,{configured:c.configured,redirectUri:c.redirectUri}];}));}
