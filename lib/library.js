"use client";

// Device-local content library. Callers must handle failed storage writes.
const KEY = "pincraft.library.v1";
export const LIBRARY_UPDATED_EVENT = "pincraft:library-updated";

export function getLibrary() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object" && typeof item.id === "string") : [];
  } catch { return []; }
}

function persist(next) {
  if (typeof window === "undefined") throw new Error("Your library is available in the browser only.");
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); }
  catch { throw new Error("Your browser could not save this item. Allow site storage or free some space, then try again."); }
  window.dispatchEvent(new Event(LIBRARY_UPDATED_EVENT));
  return next;
}

export function saveToLibrary(item) {
  if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id) throw new Error("This item could not be saved. Please generate it again.");
  const list = getLibrary();
  const exists = list.some((entry) => entry.id === item.id);
  return persist(exists ? list : [item, ...list].slice(0, 100));
}

export function removeFromLibrary(id) {
  return persist(getLibrary().filter((item) => item.id !== id));
}
