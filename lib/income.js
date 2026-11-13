// Step 5 demo reporting. No live Adsterra reporting or ad delivery is connected.
export const AD_CODE_STORAGE_KEY = "pincraft.adsterra.v1";
export const MAX_AD_CODE_LENGTH = 50000;

export const INCOME_STATS = [
  { key: "views", label: "Today's Views", value: "1,250", caption: "Views from your blog traffic" },
  { key: "clicks", label: "Today's Clicks", value: "340", caption: "Clicks across your content" },
  { key: "earning", label: "Today's Earning", value: "$3.75", caption: "Estimated ad income · USD" },
];

export const INCOME_HISTORY = [
  { date: "Today", views: 1250, clicks: 340, cents: 375 },
  { date: "Yesterday", views: 1120, clicks: 296, cents: 320 },
  { date: "2 days ago", views: 1385, clicks: 358, cents: 415 },
  { date: "3 days ago", views: 980, clicks: 244, cents: 290 },
  { date: "4 days ago", views: 1200, clicks: 315, cents: 360 },
];

export function formatIncome(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function validateAdCode(code) {
  if (typeof code !== "string" || !code.trim()) return "Paste your Adsterra ad code before saving.";
  if (code.length > MAX_AD_CODE_LENGTH) return "Ad code is too long. Use no more than 50,000 characters.";
  return "";
}

export function isSavedAdCode(value) {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.code === "string" &&
    !validateAdCode(value.code) &&
    typeof value.savedAt === "string" &&
    Number.isFinite(Date.parse(value.savedAt))
  );
}
