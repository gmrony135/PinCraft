// Read-only normalization of actual device-saved Pin and article drafts.

export const LIBRARY_STORAGE_KEY = "pincraft.library.v1";
export const LIBRARY_PAGE_SIZE = 6;

const text = (value) => typeof value === "string" ? value : "";
const strings = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
const countWords = (value) => text(value).split(/\s+/).filter(Boolean).length;

export function normalizeLibraryArticle(item) {
  const sections = Array.isArray(item.sections)
    ? item.sections.filter((section) => section && typeof section === "object").map((section) => ({
        heading: text(section.heading),
        paragraphs: strings(section.paragraphs),
        subsections: Array.isArray(section.subsections) ? section.subsections.filter(subsection => subsection && typeof subsection === "object").map(subsection => ({heading:text(subsection.heading),paragraphs:strings(subsection.paragraphs)})) : [],
      })).filter((section) => section.heading || section.paragraphs.length)
    : [];
  const listSection = item.listSection && typeof item.listSection === "object"
    ? { heading: text(item.listSection.heading), intro: text(item.listSection.intro), items: strings(item.listSection.items) }
    : null;
  const faqs = Array.isArray(item.faqs) ? item.faqs.filter(faq => faq && typeof faq === "object").slice(0,5).map(faq => ({ question: text(faq.question), answer: text(faq.answer) })) : [];
  const images = Array.isArray(item.images) ? item.images.filter(image => image && /^[a-f0-9]{64}$/.test(image.assetId || "") && ["cover","section"].includes(image.role)).slice(0,3).map(image => ({ assetId:image.assetId, role:image.role, sectionIndex:Number.isInteger(image.sectionIndex)?image.sectionIndex:null, sectionHeading:text(image.sectionHeading), altText:text(image.altText) })) : [];
  const relatedArticles = Array.isArray(item.relatedArticles) ? item.relatedArticles.filter(link => link && typeof link.url === "string" && /^https:\/\//i.test(link.url)).slice(0,5).map(link => ({...(typeof link.id==="string"&&/^\d{3,40}$/.test(link.id)?{id:link.id}:{}),title:text(link.title),url:link.url,...(typeof link.publishedAt==="string"?{publishedAt:link.publishedAt}:{})})) : [];
  const intro = text(item.intro);
  const conclusion = text(item.conclusion);
  const title = text(item.title).trim();
  const structured = !!(intro || sections.length || listSection?.items.length || faqs.length || conclusion);
  const structuredText = [
    `# ${title}`, "", intro, "",
    ...sections.flatMap((section) => [`## ${section.heading}`, "", ...section.paragraphs, ...section.subsections.flatMap(subsection => [`### ${subsection.heading}`, ...subsection.paragraphs]), ""]),
    ...(listSection ? [`## ${listSection.heading}`, listSection.intro, ...listSection.items.map((entry) => `- ${entry}`), ""] : []),
    ...(faqs.length ? ["## Frequently asked questions", ...faqs.flatMap(faq => [`Q: ${faq.question}`, `A: ${faq.answer}`]), ""] : []),
    ...(conclusion ? ["## Final thoughts", conclusion] : []),
    ...relatedArticles.map(link => `- ${link.title}: ${link.url}`),
  ].join("\n").replace(/\*\*/g, "");
  const plainText = text(item.plainText) || text(item.content) || (structured ? structuredText : "");
  const wordCount = Number.isInteger(item.wordCount)&&item.wordCount>0?item.wordCount:countWords(plainText);
  return {
    id: text(item.sourceId) || text(item.id) || `article:${title}`,
    title,
    category: text(item.niche) || text(item.category) || "Blog Article",
    intro, sections, listSection, faqs, conclusion, plainText, structured, images, imageStatus:text(item.imageStatus), imageError:text(item.imageError), relatedArticles,
    focusKeyword:text(item.focusKeyword), secondaryKeywords:strings(item.secondaryKeywords||item.keywords), metaDescription:text(item.metaDescription), slug:text(item.slug),
    imageBriefs:Array.isArray(item.imageBriefs)?item.imageBriefs.slice(0,3):[], generation:item.generation&&typeof item.generation==='object'?item.generation:null,
    wordCount,
    readMinutes: Math.max(1, Math.ceil(wordCount / 220)),
  };
}

export function partitionLibrary(items) {
  const pins = [];
  const articles = [];
  const pinIds = new Set();
  const articleIds = new Set();
  if (!Array.isArray(items)) return { pins, articles };

  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item) || item.isDemo === true) continue;
    if (item.type === "pin") {
      const titles = strings(item.titles);
      const title = (text(item.title) || titles[0] || text(item.topic)).trim();
      if (!title) continue;
      const id = text(item.id) || `pin:${title}`;
      if (pinIds.has(id)) continue;
      pinIds.add(id);
      const imageIdea = item.imageIdea && typeof item.imageIdea === "object" && !Array.isArray(item.imageIdea) ? Object.fromEntries(["headline", "palette", "layout", "style", "prompt"].map(key => [key, text(item.imageIdea[key])]).filter(([, value]) => value)) : null;
      pins.push({ id, title, titles: titles.length ? titles : [title], category: text(item.category) || text(item.topic) || "Pinterest Pin", description: text(item.description), hashtags: strings(item.hashtags), keywords: strings(item.keywords), imageIdea, titleCount: titles.length || 1 });
    } else if (item.type === "article" || item.type === "published") {
      const article = normalizeLibraryArticle(item);
      if (!article.title || articleIds.has(article.id)) continue;
      articleIds.add(article.id);
      articles.push(article);
    }
  }
  return { pins, articles };
}

export function filterLibrary(items, query) {
  const search = text(query).trim().toLocaleLowerCase();
  return search ? items.filter((item) => `${item.title} ${item.category}`.toLocaleLowerCase().includes(search)) : items;
}

export async function copyLibraryText(value) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall back to a temporary text selection. Never claim success if it fails.
  }
  const active = document.activeElement;
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;top:-9999px;left:0;opacity:0";
  // A modal makes the rest of the document inert, so keep fallback selection
  // inside the open dialog when copying from the article reader.
  const container = active?.closest?.("dialog[open]") || document.body;
  container.appendChild(area);
  try {
    area.focus();
    area.select();
    area.setSelectionRange(0, area.value.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
    active?.focus?.({ preventScroll: true });
  }
}
