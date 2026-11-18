// Single source of truth for AI-article publishing sub-checks.
// Used by the server (repository.mjs) and the client readiness panel
// (composer-state.mjs) so both report the same specific failing check.
//
// The reviewed text may be edited after the Library draft was saved, so the
// reviewed word count is checked on its own (1,000–1,600). The saved draft's
// stored count is checked as a source-integrity fact but is NOT required to
// equal the reviewed count. Images must still match the saved source exactly.

const inRange = n => Number.isInteger(n) && n >= 1000 && n <= 1600;

const imageRefs = images => JSON.stringify((Array.isArray(images) ? images : [])
  .map(image => ({
    assetId: image.assetId,
    role: image.role,
    sectionIndex: image.role === 'cover' ? null : image.sectionIndex,
    altText: image.altText,
  }))
  .sort((a, b) => a.role.localeCompare(b.role) || (a.sectionIndex ?? -1) - (b.sectionIndex ?? -1)));

export function aiArticleFailures({ reviewedWordCount, reviewedImages, sourceDraftId, source }) {
  const failures = [];
  if (!sourceDraftId) failures.push('Reopen the complete AI draft from your Library so the article is linked to its saved source.');
  if (!source) return [...failures, 'The saved AI source draft could not be read. Reopen it from your Library.'];
  if (!inRange(reviewedWordCount)) failures.push(`The reviewed article has ${Number(reviewedWordCount) || 0} words; it must be 1,000–1,600.`);
  if (!inRange(source.wordCount)) failures.push(`The saved source draft has ${Number(source.wordCount) || 0} words; it must be 1,000–1,600.`);
  if (source.imageStatus !== 'complete') failures.push(`The saved source draft's illustrations are ${source.imageStatus || 'missing'}; save the cover and both section illustrations.`);
  const images = Array.isArray(reviewedImages) ? reviewedImages : [];
  if (images.length !== 3) failures.push(`The reviewed article has ${images.length} saved illustration${images.length === 1 ? '' : 's'}; it needs exactly 3 (cover plus two sections).`);
  else if (imageRefs(images) !== imageRefs(source.images)) failures.push('The reviewed illustrations do not match the saved source draft; reopen that Library draft.');
  return failures;
}
