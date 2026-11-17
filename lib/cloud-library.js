export async function saveCloudDraft(kind, content, requestKey) {
  const response = await fetch('/api/library', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'archive', kind, content, requestKey }),
  });
  let data;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok || data?.saved !== true || data.storage !== 'firestore' || !data.id) {
    throw new Error(data?.error || 'Your private Library history could not be confirmed. Keep this page open and retry.');
  }
  window.dispatchEvent(new Event('pincraft:cloud-library-updated'));
  return data.id;
}
