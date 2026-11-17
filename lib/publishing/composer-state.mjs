import { articleHTML } from './article-format.mjs';
import { externalSourceLinks,hasProfessionalArticleStructure } from './review-content.mjs';
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
export function publishingReadiness({ data, loading = false, connectionId, websiteId, title, html, includePin = false, pinTitle, description, hashtags = '', imageReviewed, reviewed, relatedArticles = [], relatedLoaded = false, relatedBusy = false, relatedError = '', relatedCandidatesCount = 0, relatedFetchFailed = false, allowNoInternalLinks = false, wordCount = 0, metaDescription = '', focusKeyword = '', secondaryKeywords = [], slug = '', requireSeo = false, requireIllustrations = false, imagesComplete = false, imageDeliveryConfigured = true, externalSourcesVerified = false, externalSources = [] }) {
  const profile = data?.profiles?.find(p => p.id === connectionId && p.provider === 'blogger' && p.connected);
  const site = data?.websites?.find(s => s.id === websiteId && s.connectionId === connectionId);
  const tags = hashtags.trim() ? [...new Set(hashtags.trim().split(/\s+/))] : [];
  let htmlIssue = '';
  try { articleHTML(html); } catch (error) { htmlIssue = error.message; }
  const copyValid = plain(pinTitle, 100) && plain(description, 500, true) && tags.length <= 10 && tags.every(validReviewHashtag) && (description.trim() + (tags.length ? '\n' + tags.join(' ') : '')).length <= 500;
  const linkIDs=relatedArticles.map(link=>link?.id),selectedLinksReady=relatedLoaded&&!relatedBusy&&!relatedFetchFailed&&!relatedError&&relatedArticles.length>=2&&relatedArticles.length<=5&&new Set(linkIDs).size===relatedArticles.length;
  const noLinksConfirmed=allowNoInternalLinks&&relatedLoaded&&!relatedBusy&&!relatedFetchFailed&&relatedCandidatesCount<2&&relatedArticles.length===0;
  const linksReady=selectedLinksReady||noLinksConfirmed;
  const sourceLinks=Array.isArray(externalSources)?externalSources:externalSourceLinks(html,relatedArticles),sourcesReady=sourceLinks.length===0||externalSourcesVerified===true;
  const seoText=`${title||''} ${String(html||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&')}`.toLocaleLowerCase(),keywords=Array.isArray(secondaryKeywords)?secondaryKeywords:[],focusSlug=String(focusKeyword||'').toLocaleLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),slugTerms=focusSlug.split('-').filter(term=>term.length>2&&!['the','and','for','with','from','into','your','our','how'].includes(term)),slugWords=new Set(String(slug||'').split('-'));
  const seoReady=!requireSeo||(title.length>=50&&title.length<=60&&metaDescription.length>=140&&metaDescription.length<=160&&Boolean(focusKeyword)&&title.toLocaleLowerCase().includes(focusKeyword.toLocaleLowerCase())&&keywords.length>=5&&keywords.length<=10&&keywords.filter(keyword=>seoText.includes(String(keyword).toLocaleLowerCase())).length>=3&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)&&(!slugTerms.length||slugTerms.filter(term=>slugWords.has(term)).length>=Math.min(2,slugTerms.length))),structureReady=!requireSeo||hasProfessionalArticleStructure(html);
  return [
    { id: 'server', ready: Boolean(data?.providers?.blogger?.configured), message: loading ? 'Checking Blogger publishing setup…' : 'Blogger publishing server configuration is required.' },
    { id: 'account', ready: Boolean(profile), message: 'Select your connected Blogger account.' },
    { id: 'website', ready: Boolean(site && available(site) && profile), message: site?.authorizationChanged ? 'Re-verify this website after reconnecting Blogger.' : 'Select your verified Blogger blog.' },
    { id: 'article', ready: plain(title, 200) && !htmlIssue && Number.isInteger(wordCount) && wordCount >= 1000 && wordCount <= 1600, message: !plain(title, 200) ? 'Enter a plain article title, up to 200 characters.' : htmlIssue || (wordCount < 1000 || wordCount > 1600 ? `Review a complete article between 1,000 and 1,600 words (currently ${Number(wordCount||0).toLocaleString()}).` : 'Review the complete article.') },
    { id: 'seo', ready: seoReady, message: requireSeo && !seoReady ? 'Keep the H1 at 50–60 characters with the focus phrase, the description at 140–160, five to ten secondary phrases in use and a clean focus-keyword slug.' : 'SEO title and description suggestions are ready.' },
    ...(requireSeo ? [{ id: 'article-structure', ready: structureReady, message: structureReady ? 'Four H2/H3 sections and the clickable contents list are present.' : 'Restore the four H2/H3 sections and clickable contents list before publishing.' }] : []),
    { id: 'external-sources', ready: sourcesReady, message: sourceLinks.length&&!sourcesReady ? 'Open every external source link and verify it supports the adjacent claim before publication.' : 'External source links are either absent or marked as reviewer-verified.' },
    { id: 'illustrations', ready: !requireIllustrations || imagesComplete, message: requireIllustrations && !imagesComplete ? 'Save one cover plus both AI section illustrations before publishing.' : 'Required article illustrations are saved.' },
    { id: 'image-delivery', ready: !requireIllustrations || imageDeliveryConfigured, message: requireIllustrations && !imageDeliveryConfigured ? 'The site owner must configure a stable public HTTPS image origin and signing key before Blogger can receive article images.' : 'Signed public article-image delivery is configured.' },
    { id: 'internal-links', ready: linksReady, message: noLinksConfirmed ? 'This specific manual article will publish without internal links; recurring automation still requires two relevant live posts.' : relatedBusy ? 'Checking live internal links on your selected Blogger blog…' : relatedFetchFailed ? (relatedError || 'Live Blogger links could not be checked. Retry before publishing.') : relatedError || (!relatedLoaded ? 'Load relevant live posts from the selected Blogger blog.' : relatedArticles.length < 2 ? 'Select two relevant live Blogger posts, or confirm the one-time manual no-links option when fewer than two are available.' : relatedArticles.length > 5 ? 'Use at most five relevant live Blogger posts.' : 'Select two to five distinct relevant live Blogger posts.') },
    ...(includePin ? [
      { id: 'pin-copy', ready: copyValid, message: 'Review the optional Pin title and description; use at most 10 valid hashtags and 500 combined description/hashtag characters, or turn off the Pin pack.' },
      { id: 'artwork', ready: Boolean(imageReviewed), message: 'For your optional Pin pack, confirm saved artwork or supply its public image URL. Turn off the Pin pack to publish only to Blogger.' },
    ] : []),
    { id: 'review', ready: Boolean(reviewed), message: 'Tick the final review and Blogger publication authorization below.' },
  ];
}
