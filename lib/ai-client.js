// Browser-side transport only. No provider key or provider endpoint is bundled.
export async function generateWithAI(task, data, { signal, requestKey = crypto.randomUUID() } = {}) {
  let response;
  try {
    response = await fetch('/api/ai/generate', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task, ...data, requestKey, consent: true }), signal });
  } catch (issue) {
    if (issue.name === 'AbortError') throw issue;
    throw new Error('The generation result could not be confirmed. No automatic client retry was sent. Check your connection before starting a new request, which may use quota.');
  }
  let result; try { result = await response.json(); } catch { throw new Error('The AI server did not return a usable response. No offline content was substituted. Please try later.'); }
  if (!response.ok || !result.result || !result.generation?.provider) throw Object.assign(new Error(result.error || 'AI generation was not completed.'), { code: result.code, status: response.status });
  return result;
}
