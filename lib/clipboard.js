// One honest clipboard implementation for pins, articles, hashtags and the reader.
export async function copyText(value) {
  const text = String(value ?? "");
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* Use the selection fallback below. */ }
  const active = document.activeElement;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;top:-9999px;left:0;opacity:0;font-size:16px";
  const container = active?.closest?.("dialog[open]") || document.body;
  container.appendChild(area);
  try {
    area.focus({ preventScroll: true });
    area.select();
    area.setSelectionRange(0, area.value.length);
    return Boolean(document.execCommand("copy"));
  } catch { return false; }
  finally { area.remove(); active?.focus?.({ preventScroll: true }); }
}
