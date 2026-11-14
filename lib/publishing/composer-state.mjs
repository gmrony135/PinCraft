import { articleHTML } from './article-format.mjs';
import { validReviewHashtag,validReviewText as plain } from './review-fields.mjs';
const available = site => site && site.connected !== false && site.authorizationChanged !== true;
export function defaultPublishingDestination(data, connectionId = '', websiteId = '', preferredWebsiteId = '') {
  if (!data) return { connectionId, websiteId };
  const profiles = (data.profiles || []).filter(p => p.provider === 'blogger' && p.connected);
  const websites = (data.websites || []).filter(s => available(s) && profiles.some(p => p.id === s.connectionId));
  // A URL parameter is only a selection hint among the CURRENT owner's sites.
  // Never use a caller-supplied URL, identity, revision or destination directly.
  const preferred = !connectionId && websites.find(s => s.id === preferredWebsiteId);
  let nextConnection = profiles.some(p => p.id === connectionId) ? connectionId : preferred?.connectionId || (profiles.length === 1 ? profiles[0].id : '');
  const choices = websites.filter(s => s.connectionId === nextConnection);
  const nextWebsite = choices.some(s => s.id === websiteId) ? websiteId : choices.find(s => s.id === preferredWebsiteId)?.id || (choices.length === 1 ? choices[0].id : '');
  return { connectionId: nextConnection, websiteId: nextWebsite };
}
export function publishingReadiness({ data, loading = false, connectionId, websiteId, title, html, pinTitle, description, hashtags = '', imageReviewed, reviewed }) {
  const profile = data?.profiles?.find(p => p.id === connectionId && p.provider === 'blogger' && p.connected);
  const site = data?.websites?.find(s => s.id === websiteId && s.connectionId === connectionId);
  const tags = hashtags.trim() ? [...new Set(hashtags.trim().split(/\s+/))] : [];
  let htmlIssue = '';
  try { articleHTML(html); } catch (error) { htmlIssue = error.message; }
  const copyValid = plain(pinTitle, 100) && plain(description, 500, true) && tags.length <= 10 && tags.every(validReviewHashtag) && (description.trim() + (tags.length ? '\n' + tags.join(' ') : '')).length <= 500;
  return [
    { id: 'server', ready: Boolean(data?.providers?.blogger?.configured), message: loading ? 'Checking Blogger publishing setup…' : 'Blogger publishing server configuration is required.' },
    { id: 'account', ready: Boolean(profile), message: 'Select your connected Blogger account.' },
    { id: 'website', ready: Boolean(site && available(site) && profile), message: site?.authorizationChanged ? 'Re-verify this website after reconnecting Blogger.' : 'Select your verified Blogger blog.' },
    { id: 'article', ready: plain(title, 200) && !htmlIssue, message: !plain(title, 200) ? 'Enter a plain article title, up to 200 characters.' : htmlIssue || 'Review the complete article.' },
    { id: 'pin-copy', ready: copyValid, message: 'Review the Pin title and description; use at most 10 valid hashtags and 500 combined description/hashtag characters.' },
    { id: 'artwork', ready: Boolean(imageReviewed), message: 'Confirm you reviewed and saved your Pin artwork, or supply its public image URL.' },
    { id: 'review', ready: Boolean(reviewed), message: 'Tick the final review and Blogger publication authorization below.' },
  ];
}
