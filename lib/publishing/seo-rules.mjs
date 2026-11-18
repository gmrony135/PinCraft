// Single source of truth for AI/SEO publishing rules. The server (content.mjs) and the
// client readiness panel (composer-state.mjs) both call this, so they cannot disagree.
// Semantics match the server rules exactly: the keyword-usage check reads the article
// HTML only (not the title), and every value is trimmed the way the server trims it.
const STOP_TERMS = ['the', 'and', 'for', 'with', 'from', 'into', 'your', 'our', 'how'];

export function seoFailures({title = '', html = '', metaDescription = '', focusKeyword = '', secondaryKeywords = [], slug = ''} = {}) {
  const t = String(title ?? '').trim(), meta = String(metaDescription ?? '').trim(), focus = String(focusKeyword ?? '').trim();
  const keywords = (Array.isArray(secondaryKeywords) ? secondaryKeywords : []).map(value => String(value ?? '').trim());
  const cleanSlug = String(slug ?? '').trim();
  const failures = [];
  if (t.length < 50 || t.length > 60) failures.push(`The H1 is ${t.length} characters; it must be 50–60.`);
  if (meta.length < 140 || meta.length > 160) failures.push(`The meta description is ${meta.length} characters; it must be 140–160.`);
  if (!focus) failures.push('Add a focus keyword.');
  if (keywords.length < 5 || keywords.length > 10) failures.push(`You have ${keywords.length} secondary keyword${keywords.length === 1 ? '' : 's'}; use 5–10.`);
  if (!cleanSlug) failures.push('Add a clean keyword-focused slug.');
  if (focus && !t.toLocaleLowerCase().includes(focus.toLocaleLowerCase())) failures.push(`The H1 must contain the focus keyword "${focus}".`);
  const visibleText = String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').toLocaleLowerCase();
  const used = keywords.filter(keyword => visibleText.includes(keyword.toLocaleLowerCase()));
  if (used.length < 3) {
    const missing = keywords.filter(keyword => !used.includes(keyword));
    failures.push(`Only ${used.length} secondary keyword${used.length === 1 ? ' appears' : 's appear'} in the article body; at least 3 must appear naturally. Not in the body yet: ${missing.join(', ') || 'none'}.`);
  }
  const focusSlug = focus.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const slugTerms = focusSlug.split('-').filter(term => term.length > 2 && !STOP_TERMS.includes(term));
  const slugWords = new Set(cleanSlug.split('-'));
  const slugHits = slugTerms.filter(term => slugWords.has(term));
  if (slugTerms.length && slugHits.length < Math.min(2, slugTerms.length)) failures.push(`The slug must include at least ${Math.min(2, slugTerms.length)} focus-keyword words (${slugTerms.join(', ')}); it includes ${slugHits.length}.`);
  return failures;
}
