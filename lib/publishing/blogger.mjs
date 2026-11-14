import 'server-only';
import { AutomationError } from '../automation/errors.mjs';
import { getAccessToken, invalidateAuthorization } from '../automation/oauth-tokens.mjs';
import { requestData, httpsURL } from '../automation/http.mjs';
import { numericId, escapeHTML } from './content.mjs';

export const publicationMarker = id => `<!-- pincraft-reviewed-job:${id} -->`;
const normalizeURL = value => { const u = new URL(value); if (u.protocol === 'http:') u.protocol = 'https:'; return httpsURL(u.href).href; };
export function articleURL(post, blogURL) {
  let url, base;
  try { url = new URL(normalizeURL(post.url)); base = new URL(normalizeURL(blogURL)); }
  catch { throw new AutomationError('publication_uncertain', 'Blogger did not confirm a valid article URL.', { uncertain: true }); }
  if (url.origin !== base.origin || url.pathname === base.pathname || !url.pathname.startsWith(base.pathname.endsWith('/') ? base.pathname : base.pathname + '/') || url.search) throw new AutomationError('publication_uncertain', 'Blogger did not confirm an article URL under the selected blog.', { uncertain: true });
  return url.href;
}
function unsure(message, remoteId = null, cause = null) {
  const error = new AutomationError('publication_uncertain', message, { uncertain: true, upstreamStatus: cause?.upstreamStatus });
  if (numericId(remoteId)) error.acceptedRemoteId = remoteId;
  return error;
}
export class BloggerPublisher {
  constructor(db, { send = requestData, now = () => Date.now() } = {}) { this.db = db; this.send = send; this.now = now; this.tokens = new Map(); }
  async access(uid, id, force = false) {
    const key = uid + ':' + id;
    if (!force && this.tokens.has(key)) return this.tokens.get(key);
    const value = await getAccessToken(this.db, uid, 'blogger', { send: this.send, force, connectionId: id });
    this.tokens.set(key, value); return value;
  }
  assertAccess(job, access) {
    if (access.revision !== job.payload.bloggerRevision || access.accountKey !== job.payload.bloggerAccountKey) throw new AutomationError('oauth_changed', 'Blogger authorization changed. Re-verify the original blog and explicitly reconfirm the saved job before continuing.', { status: 409 });
  }
  async call(job, path, options = {}) {
    const uid = job.ownerUID, id = job.payload.bloggerConnectionId;
    let access = await this.access(uid, id);
    if (access.revision !== job.payload.bloggerRevision || access.accountKey !== job.payload.bloggerAccountKey) {
      this.tokens.delete(uid + ':' + id);
      access = await this.access(uid, id, true);
    }
    const attempt = () => {
      this.assertAccess(job, access);
      return this.send('https://www.googleapis.com/blogger/v3/' + path, { provider: 'Blogger publishing', timeout: 20000, maxBytes: 700000, ...options, headers: { Authorization: `Bearer ${access.accessToken}`, 'Content-Type': 'application/json' } });
    };
    try { return await attempt(); }
    catch (error) {
      if (error.upstreamStatus !== 401) throw error;
      access = await this.access(uid, id, true);
      try { return await attempt(); }
      catch (second) { if (second.upstreamStatus === 401) await invalidateAuthorization(this.db, uid, 'blogger', access); throw second; }
    }
  }
  async verifyBlog(job) {
    const result = await this.call(job, `users/self/blogs/${job.payload.blogId}`);
    if (result.blog?.id !== job.payload.blogId || result.blog_user_info?.hasAdminAccess !== true) throw new AutomationError('destination_not_owned', 'The connected Google account must administer the selected Blogger blog.', { status: 403 });
    if (normalizeURL(result.blog.url) !== job.payload.blogURL) throw new AutomationError('destination_changed', 'The selected blog URL changed. Re-verify the website before publishing.', { status: 409 });
    return result;
  }
  async draft(job) {
    const a = job.payload.article;
    const content = publicationMarker(job.id) + '\n' + (a.featuredImageUrl ? `<p><img src="${escapeHTML(a.featuredImageUrl)}" alt="${escapeHTML(a.title)}"></p>\n` : '') + a.html;
    const post = await this.call(job, `blogs/${job.payload.blogId}/posts?isDraft=true`, { method: 'POST', mutation: true, body: JSON.stringify({ kind: 'blogger#post', title: a.title, content }) });
    if (!numericId(post?.id)) throw unsure('Blogger did not return a usable draft ID. Inspect the remote blog before retrying.');
    try {
      if ((post.blog?.id && post.blog.id !== job.payload.blogId) || (post.status && post.status !== 'DRAFT')) throw new Error('Unexpected draft');
      return { remoteId: post.id, draftURL: post.url ? articleURL(post, job.payload.blogURL) : null };
    } catch { throw unsure('Blogger returned an unexpected draft result. Its ID was saved for inspection; automatic reinsertion is blocked.', post.id); }
  }
  async publish(job) {
    if (!numericId(job.remoteId)) throw new AutomationError('draft_missing', 'The saved draft ID is missing. Inspect the job before continuing.', { status: 409 });
    const future = new Date(job.publishAtUTC).getTime() > this.now() + 1000;
    const suffix = future ? '?publishDate=' + encodeURIComponent(new Date(job.publishAtUTC).toISOString()) : '';
    const post = await this.call(job, `blogs/${job.payload.blogId}/posts/${job.remoteId}/publish${suffix}`, { method: 'POST', mutation: true });
    // After a successful POST, ANY inability to validate the receipt is an
    // accepted-but-uncertain mutation, including a failing follow-up GET.
    try {
      if (post?.id !== job.remoteId || (post.blog?.id && post.blog.id !== job.payload.blogId)) throw new Error('Unexpected post');
      const saved = post.status ? post : await this.get(job);
      if (future ? saved.status !== 'SCHEDULED' : !['LIVE', 'SCHEDULED'].includes(saved.status)) throw new Error('Unexpected status');
      return { future, draftURL: saved.url ? articleURL(saved, job.payload.blogURL) : job.draftURL };
    } catch (cause) { throw unsure('The saved post’s publication or schedule receipt needs inspection. Do not send another publish request blindly.', job.remoteId, cause); }
  }
  async get(job, id = job.remoteId, { content = false } = {}) {
    if (!numericId(id)) throw new AutomationError('invalid_remote_id', 'Enter the actual Blogger post ID.');
    const post = await this.call(job, `blogs/${job.payload.blogId}/posts/${id}?view=ADMIN&fields=${content ? 'id,blog,status,url,published,title,content' : 'id,blog,status,url,published,title'}`);
    if (post?.id !== id || (post.blog?.id && post.blog.id !== job.payload.blogId)) throw new AutomationError('post_mismatch', 'Blogger did not confirm that post in the selected blog.', { status: 409 });
    return post;
  }
  async live(job) {
    const post = await this.get(job);
    if (this.now() < new Date(job.publishAtUTC).getTime() || post.status !== 'LIVE' || !Number.isFinite(Date.parse(post.published)) || Date.parse(post.published) > this.now() + 5000) return null;
    const url = articleURL(post, job.payload.blogURL);
    try {
      // A separate unauthenticated public HTTPS request, no token/cookies.
      const html = await this.send(url, { provider: 'Public Blogger article', publicHost: true, format: 'text', contentTypes: ['text/html', 'application/xhtml+xml'], maxBytes: 1500000, timeout: 15000 });
      if (!html.includes(publicationMarker(job.id)) && !(html.includes(job.remoteId) && html.includes(escapeHTML(job.payload.article.title)))) return null;
      return url;
    } catch (error) { if (error.upstreamStatus === 429) throw error; return null; }
  }
}
