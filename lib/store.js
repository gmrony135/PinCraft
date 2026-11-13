"use client";

// Tiny persistent store (localStorage) — no backend needed, everything works offline.

import { useEffect, useState, useCallback } from "react";

const KEY = "pincraft.v1";

export const CATEGORIES = [
  { id: "homedecor", name: "Home Decor", full: "Home Decor & Home Organization", emoji: "🏡", tint: "from-amber-100 to-amber-50", label: "home decor" },
  { id: "food", name: "Food", full: "Food, Recipes & Cooking", emoji: "🍔", tint: "from-orange-100 to-orange-50", label: "food recipes" },
  { id: "fashion", name: "Fashion", full: "Fashion & Outfit Ideas", emoji: "👗", tint: "from-fuchsia-100 to-fuchsia-50", label: "fashion tips" },
  { id: "beauty", name: "Beauty", full: "Beauty & Skincare", emoji: "💄", tint: "from-rose-100 to-rose-50", label: "beauty and skincare" },
  { id: "diy", name: "DIY & Crafts", full: "DIY & Crafts", emoji: "💡", tint: "from-yellow-100 to-yellow-50", label: "DIY and crafts" },
  { id: "garden", name: "Gardening", full: "Gardening & Plant Ideas", emoji: "🌿", tint: "from-emerald-100 to-emerald-50", label: "gardening and plants" },
  { id: "quotes", name: "Quotes", full: "Love Quotes, Sad Quotes & Motivation", emoji: "❤️", tint: "from-red-100 to-red-50", label: "quotes" },
  { id: "travel", name: "Travel", full: "Travel & Lifestyle", emoji: "✈️", tint: "from-sky-100 to-sky-50", label: "travel ideas" },
  { id: "art", name: "Art", full: "Art, Aesthetic & Creative Ideas", emoji: "🎨", tint: "from-violet-100 to-violet-50", label: "art and aesthetics" },
];

export const DEFAULT_STATE = {
  user: null, // { name, email, hasPinterest, category }
  plan: "Free",
  pinterestConnected: false,
  selectedCategory: null,
  pins: [], // { id, topic, createdAt, titles, descriptions, prompts, blog }
  schedules: [], // { id, pinsPerDay, time, days, createdAt }
  settings: {
    blogUrl: "",
    pinterestUrl: "",
    wordpressKey: "",
    pinterestKey: "",
  },
  postedPins: [], // ids
  postedBlogs: [], // ids
  onboarded: false,
};

function read() {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

let memory = null;
const listeners = new Set();

function emit() {
  listeners.forEach((l) => l(memory));
}

export function getState() {
  if (typeof window === "undefined") return DEFAULT_STATE;
  if (!memory) memory = read();
  return memory;
}

export function setState(patch) {
  const next =
    typeof patch === "function" ? patch(getState()) : { ...getState(), ...patch };
  memory = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  emit();
  return next;
}

export function useStore() {
  const [state, setLocal] = useState(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLocal(getState());
    setHydrated(true);
    const l = (s) => setLocal({ ...s });
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);

  const update = useCallback((patch) => setState(patch), []);

  return { state, update, hydrated };
}

export function resetAll() {
  memory = { ...DEFAULT_STATE };
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
  emit();
}

/* ---------------- AI-style content generator (frontend-only) ---------------- */

const HOOKS = {
  homedecor: [
    "The 5-minute reset that makes a room feel new",
    "Small-space storage that actually looks good",
    "Stop buying bins — do this instead",
    "Renter-friendly upgrades you can undo",
    "The one habit that keeps clutter away",
  ],
  food: [
    "15-minute dinner that tastes like Sunday",
    "Crispy outside, soft inside",
    "5 ingredients, zero stress",
    "Save this for your next lazy night",
    "The one pan everyone asks for",
  ],
  fashion: [
    "Capsule wardrobe, endless outfits",
    "One piece, five looks",
    "The fit that always works",
    "Quiet luxury on a budget",
    "Timeless over trendy",
  ],
  beauty: [
    "The 3-step routine your skin actually needs",
    "Stop layering — start simplifying",
    "Glow without the 10-step price tag",
    "The ingredient everyone forgets",
    "Morning routine under 5 minutes",
  ],
  diy: [
    "Made this with things you already own",
    "30-minute weekend project",
    "No tools required",
    "The easiest craft you'll finish today",
    "Beginner-friendly and under $10",
  ],
  garden: [
    "Plants that survive a forgetful owner",
    "The watering rule nobody tells you",
    "Tiny balcony, real harvest",
    "Propagate this in a glass of water",
    "Stop killing this plant — do this",
  ],
  quotes: [
    "It still hurts, and that's okay",
    "You were my favourite maybe",
    "Healing is not linear",
    "Some goodbyes never finish",
    "The quiet part nobody tells you",
  ],
  travel: [
    "The underrated stop everyone skips",
    "48 hours, one carry-on",
    "Budget-friendly and beautiful",
    "Hidden gems worth the detour",
    "Save this for your next trip",
  ],
  art: [
    "The 10-minute sketch habit that sticks",
    "Colors that always work together",
    "Beginner art supplies worth buying",
    "Aesthetic on a budget",
    "Draw this when you feel stuck",
  ],
};

const TITLE_PATTERNS = [
  (t, topic) => `${topic} — ${t}`,
  (t, topic) => `${t} (${topic} that actually works)`,
  (t, topic) => `Try This: ${topic}`,
  (t, topic) => `${topic}? Read this first`,
  (t, topic) => `The ${topic} Shortcut You'll Save`,
];

const HASHTAGS = {
  homedecor: "#HomeDecor #HomeOrganization #SmallSpaceLiving #InteriorInspo #Declutter",
  food: "#EasyRecipes #Foodie #DinnerIdeas #RecipeOfTheDay #HomeCooking",
  fashion: "#OOTD #StyleTips #CapsuleWardrobe #FashionInspo #OutfitIdeas",
  beauty: "#SkincareRoutine #BeautyTips #GlowUp #SkinCare #BeautyInspo",
  diy: "#DIYProjects #CraftIdeas #HandmadeDecor #DoItYourself #CreativeIdeas",
  garden: "#GardeningTips #PlantParent #Houseplants #GardenIdeas #PlantInspo",
  quotes: "#LoveQuotes #SadQuotes #Motivation #QuotesDaily #HealingJourney",
  travel: "#TravelTips #Wanderlust #BudgetTravel #TravelInspo #Lifestyle",
  art: "#ArtInspiration #Aesthetic #CreativeIdeas #ArtIdeas #DrawingInspo",
};

const DESC_OPENERS = [
  "Save this for later — you'll want it.",
  "Pin it now, thank yourself tonight.",
  "This one hits different.",
  "Steal this idea before everyone else does.",
  "Tried it, loved it, sharing it.",
];

const IMAGE_STYLES = [
  "vertical 2:3 Pinterest pin, soft natural light, muted cream background, minimal serif typography",
  "vertical 2:3 Pinterest pin, cozy lifestyle photography, warm tones, shallow depth of field",
  "vertical 2:3 Pinterest pin, bold oversized text overlay, high contrast, flat lay composition",
  "vertical 2:3 Pinterest pin, editorial magazine style, pastel palette, clean negative space",
  "vertical 2:3 Pinterest pin, cinematic moody lighting, textured paper background, elegant script font",
];

function pick(arr, i) {
  return arr[i % arr.length];
}

function titleCase(s) {
  return s
    .split(" ")
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export const CATEGORY_ALIASES = {
  homedecor: [
    "homedecor",
    "home decor",
    "home",
    "home organization",
    "home decor & home organization",
    "interior",
    "organization",
  ],
  food: [
    "food",
    "food recipes",
    "recipe",
    "recipes",
    "cooking",
    "food, recipes & cooking ideas",
    "cooking ideas",
  ],
  fashion: ["fashion", "outfit", "outfits", "style", "fashion & outfit ideas"],
  beauty: ["beauty", "skincare", "skin care", "beauty & skincare", "makeup"],
  diy: ["diy", "crafts", "craft", "diy & crafts", "handmade"],
  garden: ["garden", "gardening", "plants", "plant", "gardening & plant ideas"],
  quotes: [
    "quotes",
    "sad",
    "sad quotes",
    "love quotes",
    "motivation",
    "motivational",
    "love quotes, sad quotes & motivation",
    "love",
    "inspiration",
  ],
  travel: ["travel", "lifestyle", "travel & lifestyle", "trips", "tourism"],
  art: ["art", "aesthetic", "creative", "art, aesthetic & creative ideas"],
};

export function resolveCategory(input) {
  if (!input) return null;
  const v = String(input).trim().toLowerCase();
  if (HOOKS[v]) return v;
  for (const [key, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.includes(v)) return key;
  }
  return null;
}

export function categoryLabel(id) {
  const found = CATEGORIES.find((c) => c.id === id);
  return found ? found.label : id;
}

export function generateContent(topic, category) {
  const cat = resolveCategory(category) || "motivation";
  const cleanTopic = (topic || "Your Topic").trim();
  const hooks = HOOKS[cat];

  const titles = TITLE_PATTERNS.map((fn, i) => fn(hooks[i], cleanTopic));

  const descriptions = titles.map(
    (t, i) =>
      `${DESC_OPENERS[i % DESC_OPENERS.length]} ${t}. ${
        i === 0
          ? "A quick read with practical ideas you can use today."
          : i === 1
          ? "Perfect for saving, sharing, and coming back to."
          : "Swipe through and save the one that speaks to you."
      } ${HASHTAGS[cat]}`
  );

  const prompts = titles.map(
    (t, i) =>
      `${IMAGE_STYLES[i]} — headline text "${t.slice(0, 70)}", brand palette: warm red (#e60023) accent, black typography on white, generous margins, no clutter, high readability on mobile.`
  );

  const rawLabel = categoryLabel(cat);
  const catLabel = rawLabel.replace(/\s*(ideas|tips)$/i, "");
  const keywords = [
    cleanTopic.toLowerCase(),
    `${catLabel} ideas`,
    `${catLabel} for beginners`,
    `${cleanTopic.toLowerCase()} tips`,
    "pinterest pins",
    "daily blog content",
  ];

  const blogTitle = `${titleCase(cleanTopic)}: A Practical Guide (${new Date().getFullYear()})`;

  const blogBody = buildBlog(cleanTopic, cat, titles, keywords);

  return {
    id: `pin_${Date.now()}`,
    topic: cleanTopic,
    category: cat,
    createdAt: new Date().toISOString(),
    titles,
    descriptions,
    prompts,
    keywords,
    blog: {
      title: blogTitle,
      metaDescription: `${cleanTopic} — practical tips, quick wins and a simple daily routine. ${keywords.join(", ")}.`,
      keywords,
      body: blogBody,
      wordCount: blogBody.split(/\s+/).filter(Boolean).length,
    },
  };
}

function buildBlog(topic, cat, titles, keywords) {
  const t = topic.toLowerCase();
  const blocks = [
    `${titles[0]}. If you have been searching for a straight answer on ${t}, this guide keeps it simple: what actually matters, what you can safely skip, and the smallest daily routine that sticks. No 40-step plan, no motivational filler — just the version you can start today and keep going on a bad week.`,

    `## Why ${t} feels harder than it should`,
    `Most people do not fail at ${t} because they lack effort. They fail because they start with too much. A big plan feels productive on day one and collapses by day four, and then the collapse itself becomes the story: "I tried, it did not work."`,
    `The fix is boring. Shrink the action until it is almost impossible to skip, then repeat it long enough that it becomes your default behaviour. Small and repeatable beats big and abandoned, every single time. That is the entire strategy, and everything below is just detail on top of it.`,

    `## The three-part framework`,
    `**1. Pick one anchor.** Choose a single trigger — a time of day, a place, or an existing habit you already do without thinking. Anchor beats motivation because an anchor does not care about your mood. "After I pour my morning coffee" is an anchor. "When I feel inspired" is a wish.`,
    `**2. Make the first step visible.** Whatever the action is, keep the tool within sight. Notifications on, notes on the desk, shoes by the door. Visibility removes the five seconds of friction that quietly kill consistency.`,
    `**3. Track streaks, not scores.** One checkbox per day. That is enough. Scores invite comparison and guilt; streaks invite momentum and a small, useful fear of breaking the chain.`,

    `## A realistic daily routine`,
    `Start with ten focused minutes. In those minutes, do the smallest complete version of the task — not the preparation for it, the actual thing. Prepare-then-do is the most common way people spend three weeks feeling busy and finish with nothing.`,
    `Day one will feel almost suspiciously easy. That is intentional. You are building the habit before you build the volume, because volume without a habit is a one-week project.`,
    `After the first week, add five minutes. After the fourth week, add one new element — a second repetition, a slightly harder variation, or a review step. At no point should you double the workload. A routine must survive a bad day, or it is not a routine; it is a phase.`,

    `## Common mistakes to avoid`,
    `**Copying someone else's system exactly.** Their constraints, energy and schedule are not yours. Borrow the principles; build your own numbers.`,
    `**Restarting from zero after a missed day.** A missed day is data, not failure. Resume the next day at the same size. The streak counter matters less than the return.`,
    `**Optimising before doing.** Ten logged days beats a perfect plan you never ran. You cannot tune a system that has never produced a data point.`,
    `**Hidden effort.** If the routine needs a decision every single time, it will not last. Pre-decide: same time, same place, same first step.`,

    `## How to know it is working`,
    `Look for the boring signals: it takes less willpower than last week, you stop negotiating with yourself about whether to start, and a missed day feels annoying rather than final. Those three signals appear before results do, which is exactly why most people quit too early.`,
    `Give it four weeks before you judge the outcome. Two weeks is long enough to feel change and too short to measure it.`,

    `## What to do next`,
    `Choose one anchor for ${t}. Set it for tomorrow, not for "someday this week". Do the smallest complete version, tick the box, and get on with your day. Repeat for seven days before you change anything at all.`,
    `That is the whole plan — and it is enough. Save this guide, pin the version that speaks to you, and come back when you need a nudge.`,

    `**Keywords:** ${keywords.join(" · ")}`,
  ];
  return blocks.join("\n\n");
}

export const CONTENT_PACKS_NOTE =
  "Generated locally in your browser — connect your API key in Settings to use a live AI model.";
