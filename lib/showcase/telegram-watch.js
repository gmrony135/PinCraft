"use client";
// Watches API responses. When the server refuses an action because Telegram verification is missing,
// it fires one window event. The prompt listens for that event. Browsing is never affected.
import { TELEGRAM_REQUIRED_CODE, TELEGRAM_REQUIRED_EVENT } from "./telegram-required.mjs";

export function installTelegramWatcher() {
  if (typeof window === "undefined" || typeof window.fetch !== "function" || window.__pincraftTelegramWatch) return;
  window.__pincraftTelegramWatch = true;
  const original = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await original(...args);
    if (!response.ok && response.status === 403) {
      let path = "";
      try { path = new URL(response.url, window.location.href).pathname; } catch { path = ""; }
      if (path.startsWith("/api/")) {
        response.clone().json().then((data) => {
          if (data?.code === TELEGRAM_REQUIRED_CODE) window.dispatchEvent(new Event(TELEGRAM_REQUIRED_EVENT));
        }).catch(() => {});
      }
    }
    return response;
  };
}
