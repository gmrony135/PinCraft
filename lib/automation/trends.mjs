import "server-only";
import { requestData } from "./http.mjs";
import { AutomationError } from "./errors.mjs";
import { jobsFor, data } from "./firestore.mjs";
import { categoryTopic } from "./category-topics.mjs";

export const TREND_REGIONS = ["BD", "US", "GB", "IN", "CA", "AU"];
// Only read bounded titles/dates from a fixed public RSS endpoint. Never execute
// feed HTML, expand arbitrary entities, use feed images, or follow news URLs.
function xmlText(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" }[entity])).replace(/&#(x[0-9a-f]+|\d+);/gi, (_, value) => { const n = value[0].toLowerCase() === "x" ? parseInt(value.slice(1), 16) : Number(value); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ""; }).replace(/<[^>]*>/g, "").trim();
}
export function parseTrends(xml, now = new Date()) {
  if (typeof xml !== "string" || xml.length > 900000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new AutomationError("invalid_trends", "The trend feed format was rejected.", { retryable: true });
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 100).map((match) => {
    const title = xmlText(match[1].match(/<title>([\s\S]*?)<\/title>/)?.[1] || "");
    const publishedAt = new Date(xmlText(match[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || ""));
    return { title, publishedAt };
  }).filter((item) => item.title.length >= 3 && item.title.length <= 100 && Number.isFinite(item.publishedAt.getTime()) && now - item.publishedAt < 48 * 3600000 && now - item.publishedAt >= -3600000);
  if (!items.length) throw new AutomationError("trends_unavailable", "No fresh Google Trends topics were confirmed. No fixed topic has been mislabeled as trending.", { retryable: true });
  return items;
}
export async function fetchTrends(region, send = requestData, now = new Date()) {
  if (!TREND_REGIONS.includes(region)) throw new AutomationError("invalid_region", "Choose a supported trend region.");
  const sourceUrl = `https://trends.google.com/trending/rss?geo=${region}`;
  const xml = await send(sourceUrl, { provider: "Google Trends RSS", format: "text", headers: { Accept: "application/rss+xml, application/xml, text/xml" }, timeout: 15000 });
  return { items: parseTrends(xml, now), sourceUrl, fetchedAt: now.toISOString(), region };
}
export async function chooseTopic(account, job, database, send) {
  if (account.topic_source === "categories") return categoryTopic(account);
  if (account.topic_source !== "google_trends") return { topic: job.topic, metadata: { source: "rotation", label: "Configured topic rotation — not live trends" } };
  const feed = await fetchTrends(account.trend_region, send);
  const previous = (await jobsFor(database, account.user_id).where("created_at", ">", new Date(Date.now()-2*86400000)).orderBy("created_at", "desc").limit(21).get()).docs.map(data).filter(row=>row.id!==job.id).map(row=>row.topic.toLowerCase());
  const selected = feed.items.find((item) => !previous.includes(item.title.toLowerCase()));
  if (!selected) throw new AutomationError("trends_exhausted", "Fresh trend topics were already used. The worker will retry rather than invent new trending data.", { retryable: true });
  return { topic: selected.title, metadata: { source: "google_trends", sourceUrl: feed.sourceUrl, fetchedAt: feed.fetchedAt, publishedAt: selected.publishedAt.toISOString(), region: feed.region, label: "Google Trends RSS" } };
}
