import { articleHTML } from './article-format.mjs';
import { validReviewHashtag,validReviewText as plain } from './review-fields.mjs';
const available = site => site && site.connected !== false && site.authorizationChanged !== true;
export function defaultPublishingDestination(data, connectionId = '', websiteId = '', preferredWebsiteId = '') {
  if (!data) return { connectionId, websiteId };
  const profiles = (data.profiles || []).filter(p => p.provider === 'blogger' && p.connected);
  const websites = (data.websites || []).filter(s => available(s) && profiles.some(p => p.id === s.connectionId));
  const preferred = !connectionId && websites.find(s => s.id === preferredWebsiteId);
  let nextConnection = profiles.some(p => p.id === connectionId) ? connectionId : preferred?.connectionId || (profiles.length === 1 ? profiles[0].id : '');
  const choices = websites.filter(s => s.connectionId === nextConnection);
  const nextWebsite = choices.some(s => s.id === websiteId) ? websiteId : choices.find(s => s.id === preferredWebsiteId)?.id || (choices.length === 1 ? choices[0].id : '');
  return { connectionId: nextConnection, websiteId: nextWebsite };
}
export function publishingReadiness({ data, loading = false, connectionId, websiteId, title, html, includePin = false, pinTitle, description, hashtags = '', imageReviewed, reviewed, relatedArticles = [], relatedLoaded = false, relatedBusy = false, relatedError = '', wordCount = 0, metaDescription = '', requireSeo = false, requireIllustrations = false, imagesComplete = false, imageDeliveryConfigured = true }) {
  const profile = data?.profiles?.find(p => p.id === connectionId && p.provider === 'blogger' && p.connected);
  const site = data?.websites?.find(s => s.id === websiteId && s.connectionId === connectionId);
  const tags = hashtags.trim() ? [...new Set(hashtags.trim().split(/\s+/))] : [];
  let htmlIssue = '';
  try { articleHTML(html); } catch (error) { htmlIssue = error.message; }
  const copyValid = plain(pinTitle, 100) && plain(description, 500, true) && tags.length <= 10 && tags.every(validReviewHashtag) && (description.trim() + (tags.length ? '\n' + tags.join(' ') : '')).length <= 500;
  const linkIDs=relatedArticles.map(link=>link?.id),linksReady=relatedLoaded&&!relatedBusy&&!relatedError&&relatedArticles.length>=2&&relatedArticles.length<=5&&new Set(linkIDs).size===relatedArticles.length;
  const seoReady=!requireSeo||(metaDescription.length>=140&&metaDescription.length<=160);
  return [
    { id: 'server', ready: Boolean(data?.providers?.blogger?.configured), message: loading ? 'Checking Blogger publishing setup…' : 'Blogger publishing server configuration is required.' },
    { id: 'account', ready: Boolean(profile), message: 'Select your connected Blogger account.' },
    { id: 'website', ready: Boolean(site && available(site) && profile), message: site?.authorizationChanged ? 'Re-verify this website after reconnecting Blogger.' : 'Select your verified Blogger blog.' },
    { id: 'article', ready: plain(title, 200) && !htmlIssue && Number.isInteger(wordCount) && wordCount >= 1000 && wordCount <= 1600, message: !plain(title, 200) ? 'Enter a plain article title, up to 200 characters.' : htmlIssue || (wordCount < 1000 || wordCount > 1600 ? `Review a complete article between 1,000 and 1,600 words (currently ${Number(wordCount||0).toLocaleString()}).` : 'Review the complete article.') },
    { id: 'seo', ready: seoReady, message: requireSeo && !seoReady ? 'Keep the AI meta description between 140 and 160 characters before review.' : 'SEO description suggestion is ready.' },
    { id: 'illustrations', ready: !requireIllustrations || imagesComplete, message: requireIllustrations && !imagesComplete ? 'Save one cover plus both AI section illustrations before publishing.' : 'Required article illustrations are saved.' },
    { id: 'image-delivery', ready: !requireIllustrations || imageDeliveryConfigured, message: requireIllustrations && !imageDeliveryConfigured ? 'The site owner must configure a stable public HTTPS image origin and signing key before Blogger can receive article images.' : 'Signed public article-image delivery is configured.' },
    { id: 'internal-links', ready: linksReady, message: relatedBusy ? 'Checking live internal links on your selected Blogger blog…' : relatedError || (!relatedLoaded ? 'Load relevant live posts from the selected Blogger blog.' : relatedArticles.length < 2 ? 'Select at least two relevant live Blogger posts. Links are never invented.' : relatedArticles.length > 5 ? 'Use at most five relevant live Blogger posts.' : 'Select two to five distinct relevant live Blogger posts.') },
    ...(includePin ? [
      { id: 'pin-copy', ready: copyValid, message: 'Review the optional Pin title and description; use at most 10 valid hashtags and 500 combined description/hashtag characters, or turn off the Pin pack.' },
      { id: 'artwork', ready: Boolean(imageReviewed), message: 'For your optional Pin pack, confirm saved artwork or supply its public image URL. Turn off the Pin pack to publish only to Blogger.' },
    ] : []),
    { id: 'review', ready: Boolean(reviewed), message: 'Tick the final review and Blogger publication authorization below.' },
  ];
}
