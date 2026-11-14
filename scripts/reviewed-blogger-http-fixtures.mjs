// EXPLICIT LOCAL SERVER PRELOAD ONLY. No app request can activate this file.
// Google/Blogger replies are synthetic; every other outbound provider is denied.
import { MockAgent, Agent, setGlobalDispatcher } from 'undici';
import dns from 'node:dns/promises';
import { syncBuiltinESMExports } from 'node:module';
const hosts = [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST];
if (process.env.REVIEWED_BLOGGER_HTTP_FIXTURES !== '1' || process.env.FIREBASE_EMULATORS !== '1' || process.env.FIREBASE_PROJECT_ID !== 'demo-pincraft-local' || hosts.some(h => !/^127\.0\.0\.1:\d+$/.test(h || '')) || process.env.VERCEL_ENV === 'production' || process.env.PINCRAFT_PUBLISHING_MODE === 'legacy_api') throw new Error('Refusing non-isolated reviewed Blogger fixtures.');
const mock = new MockAgent(); mock.disableNetConnect(); mock.enableNetConnect(/^(127\.0\.0\.1|localhost)(:\d+)?$/); setGlobalDispatcher(mock);
const lookup = dns.lookup;
dns.lookup = async (hostname, options) => hostname === 'example.com' ? options?.all ? [{ address: '93.184.216.34', family: 4 }] : { address: '93.184.216.34', family: 4 } : lookup(hostname, options);
syncBuiltinESMExports();
const google = mock.get('https://oauth2.googleapis.com'), blogger = mock.get('https://www.googleapis.com');
google.intercept({ path: '/token', method: 'POST' }).reply(200, { access_token: 'isolated-reviewed-http-access-NEVER-SAVE', refresh_token: 'isolated-reviewed-http-refresh', token_type: 'Bearer', expires_in: 3600, scope: 'https://www.googleapis.com/auth/blogger' }).persist();
google.intercept({ path: '/revoke', method: 'POST' }).reply(200, '').persist();
blogger.intercept({ path: '/blogger/v3/users/self', method: 'GET' }).reply(200, { id: '12345678998765', displayName: 'Synthetic reviewed Blogger account' }).persist();
const blog = { id: '123456789012', name: 'Explicit synthetic owned blog', url: 'https://example.com/' };
blogger.intercept({ path: /^\/blogger\/v3\/users\/self\/blogs\?/, method: 'GET' }).reply(200, { items: [blog] }).persist();
blogger.intercept({ path: '/blogger/v3/users/self/blogs/123456789012', method: 'GET' }).reply(200, { blog, blog_user_info: { hasAdminAccess: true } }).persist();
let sequence = 12345678901234n; const posts = new Map();
blogger.intercept({ path: '/blogger/v3/blogs/123456789012/posts?isDraft=true', method: 'POST' }).reply(options => {
  const input = JSON.parse(options.body), id = String(sequence++), post = { id, blog: { id: blog.id }, title: input.title, content: input.content, url: 'https://example.com/post-' + id, status: 'DRAFT', published: new Date().toISOString() };
  posts.set(id, post);
  if (input.title.includes('Synthetic uncertain receipt')) return { statusCode: 503, data: { error: 'Explicit lost mutation receipt fixture' } };
  return { statusCode: 200, data: post };
}).persist();
blogger.intercept({ path: /^\/blogger\/v3\/blogs\/123456789012\/posts\/\d+\/publish(?:\?.*)?$/, method: 'POST' }).reply(options => {
  const url = new URL(options.path, 'https://www.googleapis.com'), id = /\/posts\/(\d+)\//.exec(url.pathname)[1], post = posts.get(id);
  if (!post) return { statusCode: 404, data: {} };
  const at = url.searchParams.get('publishDate'); post.status = at ? 'SCHEDULED' : 'LIVE'; post.published = at || new Date().toISOString();
  return { statusCode: 200, data: post };
}).persist();
blogger.intercept({ path: /^\/blogger\/v3\/blogs\/123456789012\/posts\?/, method: 'GET' }).reply(options => {
  const url = new URL(options.path, 'https://www.googleapis.com'), status = url.searchParams.get('status')?.toUpperCase();
  return { statusCode: 200, data: { items: [...posts.values()].filter(post => post.status === status).slice(0,25) } };
}).persist();
blogger.intercept({ path: /^\/blogger\/v3\/blogs\/123456789012\/posts\/\d+\?/, method: 'GET' }).reply(options => {
  const id = /\/posts\/(\d+)\?/.exec(options.path)[1], post = posts.get(id);
  if (!post || post.status === 'DRAFT' && post.title.includes('Synthetic 404 lookup')) return { statusCode: 404, data: {} };
  if (post.status === 'SCHEDULED' && Date.parse(post.published) <= Date.now()) post.status = 'LIVE';
  return { statusCode: 200, data: post };
}).persist();
mock.get('https://example.com').intercept({ path: /^\/post-\d+$/, method: 'GET' }).reply(options => {
  const post = posts.get(options.path.slice('/post-'.length));
  if (!post || post.status !== 'LIVE') return { statusCode: 404, data: '' };
  return { statusCode: 200, data: '<html><body><h1>' + post.title + '</h1>' + post.content + '</body></html>', responseOptions: { headers: { 'content-type': 'text/html' } } };
}).persist();
// publicHost deliberately creates a DNS-pinned private Agent in production.
// Double ONLY our known synthetic article origin; refuse other external TCP.
const dispatch = Agent.prototype.dispatch;
Agent.prototype.dispatch = function (options, handler) {
  const origin = String(options.origin);
  if (['https://www.googleapis.com', 'https://oauth2.googleapis.com'].includes(origin)) return mock.get(origin).dispatch(options, handler);
  if (origin === 'https://example.com' && options.method === 'GET' && /^\/post-\d+$/.test(options.path)) return mock.get('https://example.com').dispatch(options, handler);
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) throw new Error('External network denied by explicit local reviewed Blogger fixture.');
  return dispatch.call(this, options, handler);
};
console.log('ISOLATED REVIEWED BLOGGER TEST SERVER: synthetic OAuth/publication receipts only; Pinterest and all other external publishing requests are blocked.');
