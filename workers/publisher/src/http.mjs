import { PublishError, fail, publicHttps, readBounded, safeUpstreamMessage, base64 } from './security.mjs';
const fixed = new Set(['api.pinterest.com', 'www.googleapis.com', 'blogger.googleapis.com', 'oauth2.googleapis.com']);
export class ProviderHTTP {
  constructor(send = fetch, imageHosts = '') { this.send = send; this.calls = 0; this.imageHosts = imageHosts.split(',').map(s => s.trim().toLowerCase()).filter(Boolean); }
  async request(url, { method = 'GET', headers = {}, body, mutation = false, expected = null, emptyOK = false } = {}) {
    const parsed = new URL(url); if (parsed.protocol !== 'https:' || !fixed.has(parsed.hostname) || parsed.username || parsed.password || parsed.port) fail('provider_destination', 'An unapproved publishing destination was rejected.');
    if (++this.calls > 10) fail('invocation_budget', 'This publishing step will continue on the next background check.', { status: 503, retryable: true });
    let r;
    try { r = await this.send(parsed.href, { method, headers, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.timeout(20000) }); }
    catch { throw new PublishError(mutation ? 'publication_uncertain' : 'provider_unavailable', mutation ? 'The remote result is uncertain. Inspect the destination before retrying; no automatic repost will be attempted.' : 'The publishing service could not be reached.', { status: 503, uncertain: mutation, retryable: !mutation }); }
    let data; try { const text = new TextDecoder().decode(await readBounded(r, 260000)); data = emptyOK && r.ok && !text.trim() ? {} : JSON.parse(text); }
    catch { throw new PublishError(mutation && r.ok ? 'publication_uncertain' : 'provider_unavailable', 'The remote response could not be confirmed.', { status: 503, uncertain: mutation && (r.ok || r.status >= 500), retryable: !mutation, upstreamStatus: r.status }); }
    if (!r.ok || expected && !expected.includes(r.status)) {
      const status = r.status, message = status === 401 ? 'The publishing authorization expired or was rejected. Reconnect if automatic renewal does not resolve it.' : status === 403 ? (parsed.hostname === 'api.pinterest.com' ? 'Pinterest denied access. Check the granted scopes, destination ownership and app access tier.' : 'Blogger denied access. Check API enablement, Blogger permission and blog administrator access.') : status === 404 ? 'The selected board, blog or post was not found. Recheck its authorized destination.' : status === 429 ? 'The publishing service is rate-limiting requests. The job will wait before trying again.' : safeUpstreamMessage(data?.message || data?.error?.message, 'The publishing request was rejected. Check its content and destination.');
      const after = Number(r.headers.get('retry-after'));
      throw new PublishError(status === 401 ? 'provider_unauthorized' : status === 429 ? 'rate_limited' : mutation && status >= 500 ? 'publication_uncertain' : 'provider_rejected', message, { status: status >= 500 ? 503 : status >= 400 && status <= 499 ? status : 502, upstreamStatus: status, uncertain: mutation && status >= 500 || mutation && r.ok, retryable: status === 429 || !mutation && status >= 500, retryAfter: Number.isFinite(after) && after > 0 ? Math.min(86400000, after * 1000) : null });
    }
    return data;
  }
  imageURL(value) { const url = publicHttps(value); if (!this.imageHosts.length) fail('image_host_setup', 'Configure the existing public image hostname before scheduling. Image hosting and generation have not been replaced.', { status: 503 }); if (!this.imageHosts.includes(url.hostname)) fail('image_host_rejected', 'Use an image on the existing, explicitly configured public image host. Redirects and unapproved hosts are not fetched.'); return url; }
  async pinImage(value, { encode = true } = {}) {
    const url = this.imageURL(value); let r;
    // Cloudflare fetch resolves HTTPS hostnames in the platform. IP literals,
    // local/special-use names and redirects are rejected; credentials never go
    // to image hosts. There is no localhost/per-request transport override.
    try { r = await this.send(url.href, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Accept: 'image/png,image/jpeg' } }); } catch { fail('image_unavailable', 'The existing public Pin image could not be fetched.', { status: 409, retryable: true }); }
    if (!r.ok) { await r.body?.cancel(); fail('image_unavailable', 'The existing public Pin image did not return a successful response.', { status: 409, retryable: true }); }
    const bytes = await readBounded(r, 650000), type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const png = type === 'image/png' && bytes.length > 24 && [137,80,78,71,13,10,26,10].every((value, i) => bytes[i] === value), jpeg = type === 'image/jpeg' && bytes.length > 20 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpeg) fail('image_format', 'Use the existing image host’s JPEG or PNG image, at most 650 KB. A WebP is not silently relabeled as JPEG. Image generation has not been changed.');
    return { sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join(''), bytes: bytes.length, contentType: type, ...(encode ? { media: { source_type: 'image_base64', content_type: type, data: base64(bytes) } } : {}) };
  }
  async articlePublic(value) {
    const url = publicHttps(value); let r; try { r = await this.send(url.href, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { Accept: 'text/html' } }); } catch { return false; }
    const ready = r.status === 200 && /text\/html/i.test(r.headers.get('content-type') || ''); await r.body?.cancel(); return ready;
  }
}
