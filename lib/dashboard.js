// Step 4 demo data only. No Pinterest analytics or posting service is connected.
export const AUTOMATION_STORAGE_KEY = "pincraft.automation.v1";
export const PIN_COUNTS = [5, 10, 15, 20];
export const POST_TIMES = ["Morning", "Afternoon", "Evening", "Night"];
export const DEFAULT_AUTOMATION = {
  enabled: false,
  pinsPerDay: 10,
  postTime: "Morning",
  savedAt: null,
};

export const DASHBOARD_STATS = [
  { key: "pins", label: "Total Pins", value: "128", caption: "Pins in your collection" },
  { key: "views", label: "Total Views", value: "45,200", caption: "Times your pins were seen" },
  { key: "clicks", label: "Total Clicks", value: "8,940", caption: "Clicks from your pins" },
  { key: "earning", label: "Total Earning", value: "$42.50", caption: "Estimated ad earnings" },
];

export const RECENT_ACTIVITY = [
  {
    id: "demo-pin-1",
    title: "10 Sad Quotes That Will Make You Cry",
    topic: "Sad Quotes",
    status: "Posted",
    views: 1250,
    clicks: 340,
    date: "Today",
  },
  {
    id: "demo-pin-2",
    title: "7 Cozy Home Decor Ideas for Small Rooms",
    topic: "Home Decor",
    status: "Posted",
    views: 2180,
    clicks: 465,
    date: "Today",
  },
  {
    id: "demo-pin-3",
    title: "Easy 15 Minute Dinner Recipes",
    topic: "Food & Recipes",
    status: "Posted",
    views: 3470,
    clicks: 680,
    date: "Yesterday",
  },
  {
    id: "demo-pin-4",
    title: "10 Morning Habits for a Better Day",
    topic: "Motivation",
    status: "Scheduled",
    views: 0,
    clicks: 0,
    date: "Tomorrow",
  },
  {
    id: "demo-pin-5",
    title: "15 Love Quotes Worth Saving",
    topic: "Love Quotes",
    status: "Scheduled",
    views: 0,
    clicks: 0,
    date: "Tomorrow",
  },
];

// Mon–Sun; the seven bars total 45,200 views.
export const WEEKLY_VIEWS = [
  { day: "Mon", fullDay: "Monday", views: 4200 },
  { day: "Tue", fullDay: "Tuesday", views: 5800 },
  { day: "Wed", fullDay: "Wednesday", views: 5100 },
  { day: "Thu", fullDay: "Thursday", views: 7300 },
  { day: "Fri", fullDay: "Friday", views: 6500 },
  { day: "Sat", fullDay: "Saturday", views: 8900 },
  { day: "Sun", fullDay: "Sunday", views: 7400 },
];

export function normalizeAutomation(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : DEFAULT_AUTOMATION.enabled,
    pinsPerDay: PIN_COUNTS.includes(input.pinsPerDay) ? input.pinsPerDay : DEFAULT_AUTOMATION.pinsPerDay,
    postTime: POST_TIMES.includes(input.postTime) ? input.postTime : DEFAULT_AUTOMATION.postTime,
    savedAt:
      typeof input.savedAt === "string" && Number.isFinite(Date.parse(input.savedAt))
        ? input.savedAt
        : null,
  };
}

export function sameAutomation(a, b) {
  return !!b && a.enabled === b.enabled && a.pinsPerDay === b.pinsPerDay && a.postTime === b.postTime;
}

export function isValidAutomation(value) {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.enabled === "boolean" &&
    PIN_COUNTS.includes(value.pinsPerDay) &&
    POST_TIMES.includes(value.postTime) &&
    typeof value.savedAt === "string" &&
    Number.isFinite(Date.parse(value.savedAt))
  );
}
