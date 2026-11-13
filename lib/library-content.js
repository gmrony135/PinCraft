// Step 5 read-only adapter for the existing Pin Generator / Article Writer saves.
// Demo items are never inserted into the user's stored library.
import { generatePinPack } from "./generator";
import { generateArticle } from "./article";

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
      })).filter((section) => section.heading || section.paragraphs.length)
    : [];
  const listSection = item.listSection && typeof item.listSection === "object"
    ? { heading: text(item.listSection.heading), intro: text(item.listSection.intro), items: strings(item.listSection.items) }
    : null;
  const intro = text(item.intro);
  const conclusion = text(item.conclusion);
  const title = text(item.title).trim();
  const structured = !!(intro || sections.length || listSection?.items.length || conclusion);
  const structuredText = [
    `# ${title}`, "", intro, "",
    ...sections.flatMap((section) => [`## ${section.heading}`, "", ...section.paragraphs, ""]),
    ...(listSection ? [`## ${listSection.heading}`, listSection.intro, ...listSection.items.map((entry) => `- ${entry}`), ""] : []),
    ...(conclusion ? ["## Final thoughts", conclusion] : []),
  ].join("\n").replace(/\*\*/g, "");
  const plainText = text(item.plainText) || text(item.content) || (structured ? structuredText : "");
  const wordCount = countWords(plainText);
  return {
    id: text(item.sourceId) || text(item.id) || `article:${title}`,
    title,
    category: text(item.niche) || text(item.category) || "Blog Article",
    intro, sections, listSection, conclusion, plainText, structured,
    wordCount,
    readMinutes: Math.max(1, Math.ceil(wordCount / 220)),
    isDemo: false,
  };
}

export function partitionLibrary(items) {
  const pins = [];
  const articles = [];
  const pinIds = new Set();
  const articleIds = new Set();
  if (!Array.isArray(items)) return { pins, articles };

  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    if (item.type === "pin") {
      const titles = strings(item.titles);
      const title = (text(item.title) || titles[0] || text(item.topic)).trim();
      if (!title) continue;
      const id = text(item.id) || `pin:${title}`;
      if (pinIds.has(id)) continue;
      pinIds.add(id);
      pins.push({ id, title, category: text(item.category) || text(item.topic) || "Pinterest Pin", description: text(item.description), titleCount: titles.length || 1, isDemo: false });
    } else if (item.type === "article" || item.type === "published") {
      const article = normalizeLibraryArticle(item);
      if (!article.title || articleIds.has(article.id)) continue;
      articleIds.add(article.id);
      articles.push(article);
    }
  }
  return { pins, articles };
}

const DEMO_TOPICS = ["Sad Quotes", "Home Decor", "Easy Dinner Recipes", "Morning Motivation", "Skincare Routine", "Balcony Gardening"];
const DEMO_TITLES = [
  "10 Sad Quotes That Will Make You Cry",
  "7 Cozy Home Decor Ideas for Small Rooms",
  "Easy 15 Minute Dinner Recipes",
  "10 Morning Habits for a Better Day",
  "A Simple Skincare Routine for Beginners",
  "6 Small Balcony Garden Ideas to Try",
];

export function createDemoLibrary() {
  const pins = DEMO_TOPICS.map((topic, index) => {
    const pack = generatePinPack(topic);
    return { id: `demo-pin-${index + 1}`, title: DEMO_TITLES[index], category: pack.category, description: pack.description, titleCount: pack.titles.length, isDemo: true };
  });
  const articles = DEMO_TITLES.map((title, index) => ({
    ...normalizeLibraryArticle({ ...generateArticle(title, DEMO_TOPICS[index]), id: `demo-article-${index + 1}` }),
    isDemo: true,
  }));
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
