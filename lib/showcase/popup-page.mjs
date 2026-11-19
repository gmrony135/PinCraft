// Result codes shown in the showcase popup. Only these values are ever rendered or passed on.
export const SHOWCASE_RESULT_CODES = new Set([
  'telegram_joined', 'telegram_not_member', 'telegram_auth_failed', 'telegram_auth_expired', 'telegram_unavailable',
  'telegram_not_configured', 'telegram_bot_not_admin',
  'youtube_subscribed', 'youtube_not_subscribed', 'youtube_denied', 'youtube_state_invalid', 'youtube_unavailable',
  'youtube_token_failed', 'youtube_api_disabled', 'youtube_scope_missing', 'youtube_not_configured',
]);

export function safeResultCode(code) {
  return SHOWCASE_RESULT_CODES.has(code) ? code : 'youtube_unavailable';
}

// Page used when the YouTube grant finishes in a small popup window. It hands the result to the opener
// and closes itself. If there is no opener (popup blocked, or opened directly), it goes to the dashboard.
export function showcaseResultPage(code) {
  const payload = JSON.stringify({ source: 'pincraft-showcase', code: safeResultCode(code) });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PinCraft</title></head><body style="font-family:system-ui,sans-serif;padding:24px;color:#111"><p>Finishing verification. You can close this window.</p><script>(function(){var d=${payload};try{if(window.opener){window.opener.postMessage(d,window.location.origin);window.close();return;}}catch(e){}window.location.replace('/dashboard?showcase='+encodeURIComponent(d.code));})();</script></body></html>`;
}
