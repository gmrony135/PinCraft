import "server-only";
import { AutomationError } from "./errors.mjs";
import { httpsURL, requestJSON } from "./http.mjs";
import { articleHTML, contentPrompt, pinDescription, validateContent } from "./content.mjs";
const bearer = (token) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
const pinID = (id) => typeof id === "string" && /^\d{5,40}$/.test(id);
const remoteID = (id) => (typeof id === "string" || typeof id === "number") && /^[A-Za-z0-9_-]{1,128}$/.test(String(id));
function field(value, name, required = true, max = 6000) {
  const result = typeof value === "string" ? value.trim() : "";
  if ((required && !result) || result.length > max || /[\u0000-\u001f\u007f]/.test(result)) throw new AutomationError("invalid_settings", `Enter a valid ${name}.`);
  return result;
}
export function connectionInput(raw) {
  if (!raw || typeof raw !== "object") throw new AutomationError("invalid_settings", "Connection settings are required.");
  const { aiProvider, blogProvider } = raw;
  if (!["openai", "gemini"].includes(aiProvider) || !["blogger", "wordpress", "webhook"].includes(blogProvider)) throw new AutomationError("invalid_settings", "Choose a supported AI and blog provider.");
  const blogUrl = httpsURL(field(raw.blogUrl, "Blog URL", true, 1000));
  if (blogUrl.search) throw new AutomationError("invalid_url", "The Blog URL must not contain query parameters.");
  const value = { aiProvider, aiKey: field(raw.aiKey, "AI API key"), model: field(raw.model, "model name", true, 100), pinterestToken: field(raw.pinterestToken, "Pinterest OAuth access token"), pinterestBoardId: field(raw.pinterestBoardId, "Pinterest Board ID", true, 40), pinterestRefreshToken: field(raw.pinterestRefreshToken, "Pinterest refresh token", false), blogProvider, blogUrl: blogUrl.href.replace(/\/$/, ""), blogToken: field(raw.blogToken, "blog credential", blogProvider !== "blogger"), blogId: field(raw.blogId, "Blogger Blog ID", blogProvider === "blogger", 40), blogUsername: field(raw.blogUsername, "WordPress username", blogProvider === "wordpress", 128), blogRefreshToken: field(raw.blogRefreshToken, "Blogger offline refresh token", blogProvider === "blogger") };
  if (!/^[A-Za-z0-9._:/-]{1,100}$/.test(value.model) || !pinID(value.pinterestBoardId) || (blogProvider === "blogger" && !/^\d{3,40}$/.test(value.blogId))) throw new AutomationError("invalid_settings", "Check the model name and numeric account IDs.");
  if (blogProvider === "blogger" && (!process.env.BLOGGER_CLIENT_ID || !process.env.BLOGGER_CLIENT_SECRET)) throw new AutomationError("blogger_oauth_missing", "Blogger offline publishing needs the server's BLOGGER_CLIENT_ID and BLOGGER_CLIENT_SECRET.", { status: 503 });
  return value;
}
export async function refreshAccess(config, send = requestJSON) {
  if (config.blogProvider === "blogger") {
    if (!config.blogRefreshToken || !process.env.BLOGGER_CLIENT_ID || !process.env.BLOGGER_CLIENT_SECRET) throw new AutomationError("blogger_oauth_missing", "Blogger offline authorization is incomplete.");
    const data = await send("https://oauth2.googleapis.com/token", { provider: "Blogger token refresh", method: "POST", timeout: 15000, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: config.blogRefreshToken, client_id: process.env.BLOGGER_CLIENT_ID, client_secret: process.env.BLOGGER_CLIENT_SECRET }).toString() });
    if (typeof data.access_token !== "string" || !data.access_token) throw new AutomationError("provider_auth", "Blogger did not return an access token.");
    config.blogToken = data.access_token;
  }
  if (config.pinterestRefreshToken && process.env.PINTEREST_CLIENT_ID && process.env.PINTEREST_CLIENT_SECRET) {
    const data = await send("https://api.pinterest.com/v5/oauth/token", { provider: "Pinterest token refresh", method: "POST", timeout: 15000, headers: { Authorization: `Basic ${Buffer.from(`${process.env.PINTEREST_CLIENT_ID}:${process.env.PINTEREST_CLIENT_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: config.pinterestRefreshToken }).toString() });
    if (typeof data.access_token !== "string" || !data.access_token) throw new AutomationError("provider_auth", "Pinterest did not return an access token.");
    config.pinterestToken = data.access_token;
    if (typeof data.refresh_token === "string" && data.refresh_token) config.pinterestRefreshToken = data.refresh_token;
  }
  return config;
}
async function aiRequest(config, prompt, maxTokens, send) {
  if (config.aiProvider === "openai") {
    const data = await send("https://api.openai.com/v1/responses", { provider: "OpenAI", method: "POST", headers: bearer(config.aiKey), timeout: 80000, body: JSON.stringify({ model: config.model, input: prompt, max_output_tokens: maxTokens, text: { format: { type: "json_object" } } }) });
    const text = data.output_text || (data.output || []).flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text).join("");
    if (data.status === "incomplete" || !text) throw new AutomationError("invalid_content", "OpenAI did not return a complete response.", { retryable: true });
    return text;
  }
  const model = config.model.replace(/^models\//, "");
  const data = await send(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { provider: "Gemini", method: "POST", headers: { "x-goog-api-key": config.aiKey, "Content-Type": "application/json" }, timeout: 80000, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", maxOutputTokens: maxTokens } }) });
  const candidate = data.candidates?.[0];
  if (!candidate || candidate.finishReason !== "STOP") throw new AutomationError("invalid_content", "Gemini did not return a complete response.", { retryable: true });
  return candidate.content?.parts?.map((part) => part.text || "").join("") || "";
}
function wordpressHeaders(config) { return { Authorization: `Basic ${Buffer.from(`${config.blogUsername}:${config.blogToken}`).toString("base64")}`, "Content-Type": "application/json" }; }
export async function verifyConnections(config, send = requestJSON) {
  await refreshAccess(config, send);
  const [ai, board] = await Promise.all([
    aiRequest(config, 'Return a JSON object with exactly one key, "ready", set to true.', 256, send),
    send(`https://api.pinterest.com/v5/boards/${encodeURIComponent(config.pinterestBoardId)}`, { provider: "Pinterest board", headers: bearer(config.pinterestToken) }),
  ]);
  let test; try { test = JSON.parse(ai); } catch { /* Rejected below. */ }
  if (test?.ready !== true || String(board.id) !== config.pinterestBoardId) throw new AutomationError("connection_failed", "AI or Pinterest validation did not succeed. Nothing has been activated.");
  let blog;
  if (config.blogProvider === "blogger") {
    const data = await send(`https://www.googleapis.com/blogger/v3/users/self/blogs/${encodeURIComponent(config.blogId)}`, { provider: "Blogger", headers: bearer(config.blogToken) });
    if (data.blog?.id !== config.blogId || data.blog_user_info?.hasAdminAccess !== true) throw new AutomationError("provider_auth", "Use an owner/admin Blogger authorization for this blog.");
    const actualUrl = new URL(data.blog.url);
    if (actualUrl.hostname !== new URL(config.blogUrl).hostname) throw new AutomationError("connection_failed", "The Blog ID does not match the configured blog hostname.");
    blog = { name: data.blog.name || "Blogger", url: config.blogUrl };
  } else if (config.blogProvider === "wordpress") {
    const data = await send(`${config.blogUrl}/wp-json/wp/v2/users/me?context=edit`, { provider: "WordPress", publicHost: true, headers: wordpressHeaders(config) });
    if (!data.id || data.capabilities?.publish_posts !== true) throw new AutomationError("provider_auth", "This WordPress account has not confirmed permission to publish posts.");
    blog = { name: config.blogUrl, url: config.blogUrl };
  } else {
    const data = await send(config.blogUrl, { provider: "Blog publishing endpoint", publicHost: true, headers: bearer(config.blogToken) });
    if (data.ready !== true || !data.siteUrl || data.capabilities?.idempotency !== true || data.capabilities?.publicationLookup !== true) throw new AutomationError("connection_failed", "The endpoint must implement PinCraft's publisher contract, including idempotency and publication lookup.");
    config.siteUrl = httpsURL(data.siteUrl).href;
    blog = { name: "Custom publisher", url: config.siteUrl };
  }
  return { aiProvider: config.aiProvider, model: config.model, boardId: String(board.id), boardName: String(board.name || board.id).slice(0, 100), blogProvider: config.blogProvider, blogName: String(blog.name).slice(0, 160), blogUrl: blog.url, verifiedAt: new Date().toISOString(), tokenRefresh: Boolean(config.pinterestRefreshToken && process.env.PINTEREST_CLIENT_ID && process.env.PINTEREST_CLIENT_SECRET), publicationPermission: "Provider validates write permission when posting" };
}
export async function generateContent(config, topic, send = requestJSON, metadata = null) {
  let prompt = contentPrompt(topic);
  if (metadata?.source === "google_trends") prompt += " This title comes from a live search-trend feed, NOT a verified news article. Write an evergreen educational guide or thoughtful reflection about the topic. Do not invent match results, current news, dates, quotations, allegations, biographical facts or claims about real people. Do not imply you have read the news. If the title is inappropriate or unsafe to cover without current evidence, return a JSON object with error set to unsafe_topic instead of an article.";
  const text = await aiRequest(config, prompt, 4500, send);
  let data; try { data = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { throw new AutomationError("invalid_content", "AI returned invalid JSON. Nothing was published.", { retryable: true }); }
  if (data?.error === "unsafe_topic") throw new AutomationError("unsafe_topic", "The AI declined this trend topic. Auto Mode was paused for review; no article was published.");
  return validateContent(data, topic);
}
function articleResult(config, data) {
  try {
    if (!remoteID(data.id)) throw new Error("Missing ID");
    const raw = new URL(data.url || data.link);
    const expected = new URL(config.siteUrl || config.blogUrl);
    if (raw.hostname !== expected.hostname) throw new Error("Wrong hostname");
    // Blogger may return http canonical URLs for a blog configured with HTTPS.
    if (config.blogProvider === "blogger" && raw.protocol === "http:") raw.protocol = "https:";
    const url = httpsURL(raw.href);
    if (config.blogProvider === "wordpress" && data.status !== "publish") throw new Error("Not public");
    if (config.blogProvider === "webhook" && data.status !== "published") throw new Error("Not public");
    if (config.blogProvider === "blogger" && (["DRAFT", "SCHEDULED"].includes(data.status) || !Number.isFinite(new Date(data.published).getTime()))) throw new Error("Not public");
    return { id: String(data.id), url: url.href };
  } catch { throw new AutomationError("unconfirmed_publication", "The blog did not confirm a public article URL. Check the remote blog before continuing.", { uncertain: true }); }
}
export async function publishArticle(config, job, send = requestJSON) {
  const html = articleHTML(job.content, job.id); let data;
  if (config.blogProvider === "blogger") data = await send(`https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(config.blogId)}/posts?isDraft=false`, { provider: "Blogger publish", mutation: true, method: "POST", headers: bearer(config.blogToken), body: JSON.stringify({ kind: "blogger#post", title: job.content.title, content: html, labels: ["PinCraft", job.topic] }) });
  else if (config.blogProvider === "wordpress") data = await send(`${config.blogUrl}/wp-json/wp/v2/posts`, { provider: "WordPress publish", mutation: true, publicHost: true, method: "POST", headers: wordpressHeaders(config), body: JSON.stringify({ title: job.content.title, content: html, status: "publish", slug: `pincraft-${job.id}` }) });
  else data = await send(config.blogUrl, { provider: "Blog publish", mutation: true, publicHost: true, method: "POST", headers: { ...bearer(config.blogToken), "Idempotency-Key": job.id }, body: JSON.stringify({ idempotencyKey: job.id, title: job.content.title, html, excerpt: job.content.description, slug: `pincraft-${job.id}` }) });
  return articleResult(config, data);
}
export async function postPin(config, job, imageUrl, send = requestJSON) {
  const data = await send("https://api.pinterest.com/v5/pins", { provider: "Pinterest publish", mutation: true, method: "POST", headers: bearer(config.pinterestToken), body: JSON.stringify({ board_id: config.pinterestBoardId, title: job.content.title, description: pinDescription(job.content), link: job.blog_url, alt_text: `${job.topic}: ${job.content.title}`.slice(0, 450), media_source: { source_type: "image_url", url: imageUrl } }) });
  if (!pinID(data.id)) throw new AutomationError("unconfirmed_pin", "Pinterest did not confirm a valid Pin ID. Check your board before continuing.", { uncertain: true });
  return { id: data.id, url: `https://www.pinterest.com/pin/${data.id}/` };
}
export async function verifyRemotePublication(config, job, externalId, send = requestJSON) {
  if (!remoteID(externalId)) throw new AutomationError("invalid_id", "Enter the remote post or Pin ID.");
  await refreshAccess(config, send);
  if (job.blog_url) {
    if (!pinID(externalId)) throw new AutomationError("invalid_id", "Enter a numeric Pinterest Pin ID.");
    const data = await send(`https://api.pinterest.com/v5/pins/${externalId}`, { provider: "Pinterest verification", headers: bearer(config.pinterestToken) });
    if (data.id !== externalId || data.link !== job.blog_url || String(data.board_id) !== config.pinterestBoardId) throw new AutomationError("verification_failed", "That Pin did not confirm the expected board and article link.");
    return { pin: { id: externalId, url: `https://www.pinterest.com/pin/${externalId}/` } };
  }
  let data;
  if (config.blogProvider === "blogger") data = await send(`https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(config.blogId)}/posts/${encodeURIComponent(externalId)}`, { provider: "Blogger verification", headers: bearer(config.blogToken) });
  else if (config.blogProvider === "wordpress") data = await send(`${config.blogUrl}/wp-json/wp/v2/posts/${encodeURIComponent(externalId)}?context=edit`, { provider: "WordPress verification", publicHost: true, headers: wordpressHeaders(config) });
  else data = await send(`${config.blogUrl}?id=${encodeURIComponent(externalId)}`, { provider: "Blog verification", publicHost: true, headers: bearer(config.blogToken) });
  const html = config.blogProvider === "wordpress" ? data.content?.raw : data.content || data.html;
  if (String(data.id) !== externalId || (config.blogProvider === "webhook" ? data.idempotencyKey !== job.id : typeof html !== "string" || !html.includes(`pincraft-job:${job.id}`))) throw new AutomationError("verification_failed", "That article did not confirm this job's publication marker.");
  return { blog: articleResult(config, data) };
}
