"use client";

// Tiny localStorage-backed library so "Save To My Library" really persists.

const KEY = "pincraft.library.v1";

export function getLibrary() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveToLibrary(item) {
  if (typeof window === "undefined") return [];
  const list = getLibrary();
  const exists = list.some((x) => x.id === item.id);
  const next = exists ? list : [item, ...list].slice(0, 100);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export function removeFromLibrary(id) {
  const next = getLibrary().filter((x) => x.id !== id);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  return next;
}
