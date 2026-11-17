// Browser-side transport only. Technical service settings stay on the server.
export async function generateWithAI(task, data, { signal, requestKey = crypto.randomUUID() } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 75000);
  try {
    let response;
    try {
      const endpoint = task === 'pin_info' ? '/api/ai/pin-post-info' : task === 'trend_ideas' ? '/api/trend-finder/ideas' : '/api/ai/generate';
      response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task, ...data, requestKey, consent: true }), signal: controller.signal });
    } catch (issue) {
      if (issue.name === 'AbortError' && !timedOut) throw issue;
      throw new Error('The generation result could not be confirmed. No automatic client retry was sent. Check your connection before starting a new request, which may count toward shared site-wide capacity.');
    }
    let result;
    try { result = await response.json(); }
    catch (issue) {
      if (issue.name === 'AbortError' && !timedOut) throw issue;
      throw new Error('The AI result could not be read. No offline content was substituted. Please try later.');
    }
    if (!response.ok || result.task !== task || !result.result || result.generation?.kind !== 'ai') throw Object.assign(new Error(result.error || 'AI generation was not completed.'), { code: result.code, status: response.status });
    return result;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
