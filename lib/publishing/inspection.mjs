import 'server-only';
import { AutomationError } from '../automation/errors.mjs';
import { numericId } from './content.mjs';
import { publicationMarker } from './blogger.mjs';

const states = ['DRAFT', 'SCHEDULED', 'LIVE'];
const statuses = ['draft', 'scheduled', 'live'];
export const INSPECTION_LIMITS = Object.freeze({ pageSize: 25, pagesPerStatus: 10, maxRequests: 30, maxPosts: 750, scanMs: 42000 });
const messages = {
  direct: 'Google confirmed administrator access to this same blog and returned the requested post with this job’s marker.',
  admin_list: 'An authenticated, paginated ADMIN check returned this exact post ID with this job’s marker. No new post was created.',
  found: 'An existing post with this job’s marker was found. Check the matched ID in Blogger, then explicitly Verify it. This search did not resume or publish the job.',
  candidate: 'The entered post ID returned 404. A different existing post contains this exact job’s marker. Review the matched ID below and explicitly verify it; nothing was resumed automatically.',
  ambiguous: 'More than one existing post contains this job’s marker. Nothing was selected or resumed. Inspect these posts in Blogger before continuing.',
  missing: 'Google confirmed administrator access. All returned pages for Draft, Scheduled and Live were checked, but no post with this job’s marker was found at that time. This is not proof of deletion. After inspecting Blogger, you can stop this job and recover its saved article for a fresh review; nothing is reposted automatically.',
  limited: 'No matching job marker was found in the pages checked. The search reached a safety limit, so some posts remain unchecked. Do not treat this as deletion or create a replacement automatically.',
  marker_mismatch: 'That post exists, but Google did not confirm its original blog, recognized status and this job’s exact marker together. It was not selected or resumed.',
  blog_unavailable: 'Google could not confirm administrator access to the original blog. Check this same blog under the original Google account; this is not a post-field or quota diagnosis.',
  authorization_unavailable: 'Google could not authorize this inspection. Reconnect the original Google account with Blogger permission, then re-verify this same blog before trying again.',
  access_denied: 'Google refused this read with HTTP 403. That status alone does not distinguish a permission restriction from a provider limit. No list bypass, automatic reconnect or new post was attempted.',
  incomplete: 'The read-only post check could not finish. Its result does not establish whether the post exists. No new post or publication request was sent.',
};
const count = (value, max) => Number.isInteger(value) && value >= 0 ? Math.min(value, max) : 0;
// Only allowlisted status/ID/count flags cross the owner API boundary. Never
// URLs, preview tokens, unrelated titles/content, page cursors or provider bodies.
export function publicInspection(value) {
  if (!value || !Object.hasOwn(messages, value.outcome)) return null;
  // Older first-page-only receipts must never acquire a false complete claim.
  const outcome = value.outcome === 'missing' && value.scanComplete !== true ? 'limited' : value.outcome;
  return {
    outcome, message: messages[outcome], adminConfirmed: value.adminConfirmed === true,
    blogHTTP: Number.isInteger(value.blogHTTP) ? value.blogHTTP : null,
    primaryHTTP: Number.isInteger(value.primaryHTTP) ? value.primaryHTTP : null,
    scanRequests: count(value.scanRequests, INSPECTION_LIMITS.maxRequests), scanPosts: count(value.scanPosts, INSPECTION_LIMITS.maxPosts),
    scanLimited: value.scanLimited === true, scanComplete: value.scanComplete === true,
    scanStatuses: Object.fromEntries(statuses.map(status => [status, {
      pages: count(value.scanStatuses?.[status]?.pages, INSPECTION_LIMITS.pagesPerStatus),
      posts: count(value.scanStatuses?.[status]?.posts, INSPECTION_LIMITS.pageSize * INSPECTION_LIMITS.pagesPerStatus),
      complete: value.scanStatuses?.[status]?.complete === true,
    }])),
    maxPosts: INSPECTION_LIMITS.maxPosts,
    matchedPostId: numericId(value.matchedPostId) ? value.matchedPostId : null,
    matchedPostStatus: states.includes(value.matchedPostStatus) ? value.matchedPostStatus : null,
    source: ['posts_get', 'admin_list'].includes(value.source) ? value.source : null,
  };
}
function rejected(code, outcome, diagnostic, cause = null) {
  if (cause?.code === 'oauth_reconnect_required' || cause?.upstreamStatus === 401) {
    code = 'oauth_reconnect_required'; outcome = 'authorization_unavailable';
  } else if (cause?.upstreamStatus === 403) {
    code = 'inspection_access_denied'; outcome = 'access_denied';
  }
  const error = new AutomationError(code, messages[outcome], { status: 409, upstreamStatus: Number.isInteger(cause?.upstreamStatus) ? cause.upstreamStatus : null });
  error.inspectionDiagnostic = { ...diagnostic, outcome };
  return error;
}
function marked(post, job) {
  return numericId(post?.id) && post.blog?.id === job.payload.blogId && states.includes(post.status)
    && typeof post.content === 'string' && post.content.includes(publicationMarker(job.id));
}
// Owner-triggered inspection only. The runner, mutations and final LIVE/public
// verification never call this fallback. A caller may SEARCH without an ID;
// only the separate owner-attested review may resume a matched checkpoint.
export async function inspectExistingBloggerPost(publisher, job, id = null) {
  if (id !== null && !numericId(id)) throw new AutomationError('invalid_remote_id', 'Enter the actual Blogger post ID.');
  const diagnostic = {
    adminConfirmed: false, blogHTTP: null, primaryHTTP: null, scanRequests: 0, scanPosts: 0,
    scanLimited: false, scanComplete: false, matchedPostId: null, matchedPostStatus: null, source: null,
    scanStatuses: Object.fromEntries(statuses.map(status => [status, { pages: 0, posts: 0, complete: false }])),
  };
  try { await publisher.verifyBlog(job, { timeout: 10000 }); diagnostic.adminConfirmed = true; diagnostic.blogHTTP = 200; }
  catch (error) { diagnostic.blogHTTP = Number.isInteger(error.upstreamStatus) ? error.upstreamStatus : null; throw rejected('inspection_blog_unavailable', 'blog_unavailable', diagnostic, error); }
  if (id !== null) {
    let post;
    try { post = await publisher.get(job, id, { content: true, timeout: 10000 }); diagnostic.primaryHTTP = 200; }
    catch (error) {
      diagnostic.primaryHTTP = Number.isInteger(error.upstreamStatus) ? error.upstreamStatus : null;
      if (error.upstreamStatus !== 404) throw rejected('inspection_unconfirmed', 'incomplete', diagnostic, error);
    }
    if (post) {
      if (post.id !== id || !marked(post, job)) throw rejected('verification_failed', 'marker_mismatch', diagnostic);
      return { post, diagnostic: { ...diagnostic, matchedPostId: id, matchedPostStatus: post.status, source: 'posts_get', outcome: 'direct' } };
    }
  }
  const matches = new Map(), deadline = Date.now() + INSPECTION_LIMITS.scanMs;
  let firstError = null;
  // Three independent, bounded status streams. Provider cursors stay in memory
  // and are URL-encoded only into the same fixed Google blog path.
  await Promise.all(statuses.map(async status => {
    let pageToken = null;
    const seen = new Set(), summary = diagnostic.scanStatuses[status];
    try {
      for (let page = 0; page < INSPECTION_LIMITS.pagesPerStatus; page++) {
        if (firstError) return;
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new AutomationError('inspection_timeout', 'The bounded read deadline was reached.');
        const query = new URLSearchParams({ view: 'ADMIN', status, fetchBodies: 'true', fetchImages: 'false', maxResults: String(INSPECTION_LIMITS.pageSize), orderBy: 'updated', fields: 'nextPageToken,items(id,blog,status,content)' });
        if (pageToken) query.set('pageToken', pageToken);
        diagnostic.scanRequests++; summary.pages++;
        const result = await publisher.call(job, `blogs/${job.payload.blogId}/posts?${query}`, { timeout: Math.min(8000, remaining) });
        if (!result || result.items !== undefined && !Array.isArray(result.items)) throw new AutomationError('inspection_bad_response', 'The post-list read was incomplete.');
        const posts = (result.items || []).slice(0, INSPECTION_LIMITS.pageSize);
        diagnostic.scanPosts += posts.length; summary.posts += posts.length;
        for (const post of posts) if (marked(post, job)) matches.set(post.id, post);
        if ((result.items || []).length > INSPECTION_LIMITS.pageSize) { diagnostic.scanLimited = true; return; }
        const next = result.nextPageToken;
        if (next === undefined || next === null || next === '') { summary.complete = true; return; }
        if (typeof next !== 'string' || next.length > 8192 || /[\u0000-\u001f\u007f]/.test(next) || seen.has(next)) throw new AutomationError('inspection_bad_cursor', 'The post-list read could not safely continue.');
        seen.add(next); pageToken = next;
      }
      diagnostic.scanLimited = true;
    } catch (error) { if (!firstError) firstError = error; }
  }));
  diagnostic.scanComplete = statuses.every(status => diagnostic.scanStatuses[status].complete);
  diagnostic.scanLimited ||= !diagnostic.scanComplete;
  if (firstError) throw rejected('inspection_unconfirmed', 'incomplete', diagnostic, firstError);
  if (matches.size > 1) throw rejected('inspection_ambiguous', 'ambiguous', diagnostic);
  if (!matches.size) throw rejected(diagnostic.scanComplete ? 'inspection_post_unavailable' : 'inspection_scan_limited', diagnostic.scanComplete ? 'missing' : 'limited', diagnostic);
  const [matchedId, post] = [...matches][0];
  diagnostic.matchedPostId = matchedId; diagnostic.matchedPostStatus = post.status; diagnostic.source = 'admin_list';
  if (matchedId !== id) throw rejected('inspection_candidate_found', 'candidate', diagnostic);
  return { post, diagnostic: { ...diagnostic, outcome: 'admin_list' } };
}
