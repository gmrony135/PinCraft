// TESTS ONLY. Explicit guarded Firebase emulators + synthetic Blogger transport.
// Nothing in app/, components/ or lib/ imports this module.
import { randomUUID } from 'node:crypto';
import { getDatabase } from '../lib/automation/db.mjs';
import { ensureSettings } from '../lib/automation/repository.mjs';
import { emptyConnection, saveOAuthGrant } from '../lib/automation/oauth-store.mjs';
import { connectionRef } from '../lib/automation/firestore.mjs';
import { addWebsite } from '../lib/automation/channels.mjs';
import { BLOGGER_SCOPE } from '../lib/automation/oauth-config.mjs';
import { AutomationError } from '../lib/automation/errors.mjs';
import { isolatedFirebase, firebaseIdentity, grant, BLOG } from './automation-fixtures.mjs';
export { BLOG, grant, isolatedFirebase, firebaseIdentity };
export const POST = '12345678901234';
export const reviewedRequest = (extra = {}) => ({ requestId: randomUUID(), article: { title: 'A small garden with real everyday detail', html: '<h2>Start with one plant</h2><p>A small, carefully chosen garden can be a useful place to slow down. Review sunlight, drainage and space before choosing your next plant.</p>', featuredImageUrl: '' }, pin: { title: 'Make room for a small garden', description: 'Save this thoughtful guide for your next small garden project.', hashtags: ['#SmallGarden', '#HomeIdeas'], imageSource: 'local_download', imageUrl: '', altText: 'A bright small balcony with a few green plants' }, bloggerConnectionId: 'blogger', websiteId: 'blogger_' + BLOG, blogPublishAtUTC: 'now', pinReadyAtUTC: 'now', timezone: 'America/New_York', reviewed: true, ...extra });
export function bloggerDouble(options = {}) {
  const calls = { refresh: 0, verify: 0, draft: 0, publish: 0, get: 0, list: 0, public: 0 }, posts = new Map(), requests = [];
  let at = Date.now();
  const send = async (value, init = {}) => {
    isolatedFirebase();
    const url = new URL(value); requests.push({ url: url.href, ...init });
    if (url.hostname.includes('pinterest')) throw new Error('A manual-mode test attempted a forbidden Pinterest API request.');
    if (url.href === 'https://oauth2.googleapis.com/token') { calls.refresh++; if (options.token) await options.token({ calls, init }); return { access_token: 'isolated-reviewed-access-' + calls.refresh, refresh_token: 'isolated-reviewed-rotated-refresh', token_type: 'Bearer', expires_in: 3600, scope: BLOGGER_SCOPE }; }
    if (url.href === 'https://oauth2.googleapis.com/revoke') return '';
    if (/^\/blogger\/v3\/users\/self\/blogs\/\d+$/.test(url.pathname)) { calls.verify++; if (options.verify) await options.verify({ calls, init }); return { blog: { id: url.pathname.split('/').at(-1), name: 'Explicit synthetic owned Blogger blog', url: 'https://example.com/' }, blog_user_info: { hasAdminAccess: options.admin !== false } }; }
    if (/\/posts$/.test(url.pathname) && (!init.method || init.method === 'GET')) { calls.list++; if (options.list) return options.list({ calls, init, url, posts }); const status = url.searchParams.get('status')?.toUpperCase(); return { items: [...posts.values()].filter(post => post.status === status).slice(0,25) }; }
    if (/\/posts$/.test(url.pathname) && init.method === 'POST') { calls.draft++; const input = JSON.parse(init.body), id = String(BigInt(POST) + BigInt(calls.draft - 1)), post = { ...input, id, blog: { id: BLOG }, url: 'https://example.com/post-' + id, status: 'DRAFT', published: new Date(at).toISOString() }; posts.set(id, post); if (options.draft) { const result = await options.draft({ calls, init, post }); if (result) return result; } return { ...post }; }
    const match = /\/posts\/(\d+)(\/publish)?$/.exec(url.pathname);
    if (match) { const post = posts.get(match[1]); if (!post) throw new AutomationError('provider_request', 'Explicit synthetic post lookup 404.', { upstreamStatus: 404, retryable: true }); if (match[2]) { calls.publish++; const date = url.searchParams.get('publishDate'); post.status = date ? 'SCHEDULED' : 'LIVE'; post.published = date || new Date(at).toISOString(); if (options.publish) { const result = await options.publish({ calls, init, post, url }); if (result) return result; } return { ...post }; } calls.get++; if (options.get) { const result = await options.get({ calls, init, post, url }); if (result) return result; } if (post.status === 'SCHEDULED' && Date.parse(post.published) <= at && !options.stillScheduled) post.status = 'LIVE'; return { ...post }; }
    if (url.origin === 'https://example.com' && url.pathname.startsWith('/post-')) { calls.public++; const post = posts.get(url.pathname.slice('/post-'.length)); if (options.public) { const result = await options.public({ calls, init, post }); if (result !== undefined) return result; } return `<html><body><h1>${post.title}</h1>${post.content}</body></html>`; }
    throw new Error('Unexpected external request in the isolated Blogger double.');
  };
  return { send, calls, posts, requests, setTime: value => { at = value; } };
}
export async function reviewedFixture(options = {}) {
  isolatedFirebase();
  const db = getDatabase(), identity = await firebaseIdentity('reviewed-' + randomUUID()), uid = identity.id;
  const transport = bloggerDouble(options);
  await ensureSettings(db, uid);
  await connectionRef(db, uid, 'blogger').create(emptyConnection(uid, 'blogger'));
  await saveOAuthGrant(db, uid, 'blogger', grant('blogger', uid), 1);
  await addWebsite(db, uid, { connectionId: 'blogger', blogId: BLOG }, { send: bloggerDouble().send });
  // Ignore setup calls when asserting actual reviewed publishing behavior.
  for (const key of Object.keys(transport.calls)) transport.calls[key] = 0;
  transport.requests.length = 0;
  let now = Date.now(); transport.setTime(now);
  return { db, uid, identity, ...transport, now: () => now, advance: amount => { now += amount; transport.setTime(now); }, request: reviewedRequest };
}
