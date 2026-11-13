// PinCraft content engine — generates viral Pinterest content from a topic.
// Runs entirely in the browser: deterministic, instant, offline, free.

/* ----------------------------- topic intent ----------------------------- */

const TOPIC_MAP = [
  {
    id: "quotes-sad",
    match: /(sad|heartbreak|broken heart|breakup|cry|lonely|miss you|let go|hurt)/i,
    label: "Sad Quotes",
    hooks: [
      "It still hurts, and that's okay",
      "Nobody warns you about this part",
      "Some goodbyes never really finish",
      "You were my favourite maybe",
      "The quiet part nobody tells you",
    ],
    tags: ["#SadQuotes", "#BrokenHeart", "#DeepWords", "#QuotesDaily", "#HealingJourney"],
    emoji: "💔",
  },
  {
    id: "quotes-love",
    match: /(love|romantic|relationship|crush|valentine|couple|soulmate)/i,
    label: "Love Quotes",
    hooks: [
      "The kind of love that feels like home",
      "You are my favourite notification",
      "Small things that mean everything",
      "Still choosing you, every single day",
      "Love looks a lot like this",
    ],
    tags: ["#LoveQuotes", "#RelationshipGoals", "#CoupleGoals", "#LoveIs", "#Romantic"],
    emoji: "❤️",
  },
  {
    id: "motivation",
    match: /(motivat|success|hustle|discipline|grind|goal|study|student|never give up|mindset)/i,
    label: "Motivation",
    hooks: [
      "Start before you feel ready",
      "Discipline beats motivation, every time",
      "You are not behind, you are building",
      "One small step is still a step",
      "Show up for the person you're becoming",
    ],
    tags: ["#Motivation", "#Mindset", "#GrowthMindset", "#DailyMotivation", "#SuccessHabits"],
    emoji: "🔥",
  },
  {
    id: "home",
    match: /(home|decor|interior|organization|organize|declutter|bedroom|living room|kitchen|small space)/i,
    label: "Home Decor",
    hooks: [
      "The 5-minute reset that makes a room feel new",
      "Small-space storage that actually looks good",
      "Renter-friendly upgrades you can undo",
      "Stop buying bins — do this instead",
      "The one habit that keeps clutter away",
    ],
    tags: ["#HomeDecor", "#HomeOrganization", "#SmallSpaceLiving", "#InteriorInspo", "#Declutter"],
    emoji: "🏡",
  },
  {
    id: "food",
    match: /(food|recipe|cooking|dinner|lunch|breakfast|dessert|cake|chicken|easy meal|snack)/i,
    label: "Food & Recipes",
    hooks: [
      "15-minute dinner that tastes like Sunday",
      "Crispy outside, soft inside — every time",
      "5 ingredients, zero stress",
      "Save this for your next lazy night",
      "The one pan everyone always asks for",
    ],
    tags: ["#EasyRecipes", "#DinnerIdeas", "#RecipeOfTheDay", "#Foodie", "#HomeCooking"],
    emoji: "🍔",
  },
  {
    id: "fashion",
    match: /(fashion|outfit|style|clothing|wardrobe|dress|look|streetwear)/i,
    label: "Fashion & Outfits",
    hooks: [
      "Capsule wardrobe, endless outfits",
      "One piece, five completely different looks",
      "The fit that works on every body",
      "Quiet luxury, high-street budget",
      "Timeless beats trendy — here's why",
    ],
    tags: ["#OutfitIdeas", "#StyleTips", "#CapsuleWardrobe", "#OOTD", "#FashionInspo"],
    emoji: "👗",
  },
  {
    id: "beauty",
    match: /(beauty|skincare|skin care|makeup|glow|acne|hair|self care)/i,
    label: "Beauty & Skincare",
    hooks: [
      "The 3-step routine your skin actually needs",
      "Stop layering — start simplifying",
      "Glow without the 10-step price tag",
      "The ingredient everyone forgets",
      "Morning routine under 5 minutes",
    ],
    tags: ["#SkincareRoutine", "#BeautyTips", "#GlowUp", "#SelfCare", "#SkincareRoutine"],
    emoji: "💄",
  },
  {
    id: "diy",
    match: /(diy|craft|handmade|project|wood|paint|recycle|upcycle)/i,
    label: "DIY & Crafts",
    hooks: [
      "Made this with things you already own",
      "30-minute weekend project",
      "No tools required, promise",
      "The easiest craft you'll finish today",
      "Beginner-friendly and under $10",
    ],
    tags: ["#DIYProjects", "#CraftIdeas", "#HandmadeDecor", "#DoItYourself", "#CreativeIdeas"],
    emoji: "💡",
  },
  {
    id: "garden",
    match: /(garden|plant|flower|balcony|indoor plant|succulent|herb)/i,
    label: "Gardening & Plants",
    hooks: [
      "Plants that survive a forgetful owner",
      "The watering rule nobody tells you",
      "Tiny balcony, real harvest",
      "Propagate this in a glass of water",
      "Stop killing this plant — do this instead",
    ],
    tags: ["#GardeningTips", "#PlantParent", "#Houseplants", "#GardenIdeas", "#PlantInspo"],
    emoji: "🌿",
  },
  {
    id: "travel",
    match: /(travel|trip|vacation|destination|city|beach|mountain|backpack)/i,
    label: "Travel & Lifestyle",
    hooks: [
      "The underrated stop everyone skips",
      "48 hours, one carry-on",
      "Budget-friendly and genuinely beautiful",
      "Hidden gems worth the detour",
      "Save this for your next trip",
    ],
    tags: ["#TravelTips", "#Wanderlust", "#BudgetTravel", "#TravelInspo", "#Lifestyle"],
    emoji: "✈️",
  },
  {
    id: "art",
    match: /(art|aesthetic|draw|sketch|painting|creative|design)/i,
    label: "Art & Aesthetic",
    hooks: [
      "The 10-minute sketch habit that sticks",
      "Colours that always work together",
      "Beginner art supplies actually worth buying",
      "Aesthetic on a budget",
      "Draw this when you feel stuck",
    ],
    tags: ["#ArtInspiration", "#Aesthetic", "#CreativeIdeas", "#DrawingInspo", "#ArtIdeas"],
    emoji: "🎨",
  },
  {
    id: "health",
    match: /(health|fitness|weight|workout|yoga|diet|sleep|energy)/i,
    label: "Health & Fitness",
    hooks: [
      "Small habits, big energy",
      "The 10-minute reset that changes your day",
      "Eat well without overthinking it",
      "Sleep better starting tonight",
      "Simple swaps that actually stick",
    ],
    tags: ["#HealthyHabits", "#Wellness", "#FitnessTips", "#SelfCare", "#HealthyLifestyle"],
    emoji: "🌿",
  },
];

const FALLBACK = {
  id: "general",
  label: "Lifestyle",
  hooks: [
    "Nobody talks about this part",
    "The simple version actually works better",
    "Save this before it disappears",
    "Try this for 7 days and see",
    "The one thing that changed everything",
  ],
  tags: ["#PinCraft", "#ViralPins", "#PinterestTips", "#Trending", "#DailyInspo"],
  emoji: "📌",
};

export function detectTopic(topic) {
  const t = String(topic || "");
  return TOPIC_MAP.find((g) => g.match.test(t)) || FALLBACK;
}

/* ------------------------------ title styles ----------------------------- */

const TITLE_PATTERNS = [
  (hook, topic, year) => `${topic} — ${hook}`,
  (hook, topic, year) => `${hook} (${topic} guide ${year})`,
  (hook, topic, year) => `Try This: ${topic}`,
  (hook, topic, year) => `${topic}? Read this before you start`,
  (hook, topic, year) => `The ${topic} Shortcut Everyone Saves`,
];

const DESC_OPENERS = [
  "Save this for later — you'll want to come back to it.",
  "Pin it now, thank yourself tonight.",
  "This one hits different.",
  "Steal this idea before everyone else does.",
  "Tried it, loved it, had to share it.",
];

const DESC_MIDDLES = [
  "A short, practical read with ideas you can use today — no fluff, no 40-step plan.",
  "Perfect for saving, sharing and sending to the friend who needs it.",
  "Swipe through and keep the one that speaks to you the most.",
];

const DESC_CLOSERS = [
  "Tap through for the full guide and more pins like this every single day.",
  "Follow PinCraft for daily pins that actually get clicked.",
  "More ideas added every week — follow so you don't lose this one.",
];

/* -------------------------------- helpers -------------------------------- */

function titleCase(s) {
  return s
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function pick(arr, i) {
  return arr[i % arr.length];
}

function slugHashtag(topic) {
  const words = topic
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  return words.length ? "#" + words.join("") : null;
}

/* ----------------------------- description ------------------------------- */

function buildDescription(topic, g, titles, hashtags) {
  const label = g.label.toLowerCase();
  return [
    `${DESC_OPENERS[0]} ${titles[0]}.`,

    `If you have been searching for ${topic.toLowerCase()} that actually feels worth saving, this is it.`,
    `${DESC_MIDDLES[0]} Everything is written for real people who want a simple next step today, not a perfect plan for someday.`,

    `${topic} works best when you start small: pick one idea, try it this week, and keep the version that fits your life.`,
    `That is exactly how this pin is built — short, clear and easy to come back to whenever you need it.`,

    `${DESC_CLOSERS[0]} New ${label} ideas are added every week.`,

    hashtags.slice(0, 5).join(" "),
  ].join(" ");
}

/* ------------------------------ main export ------------------------------ */

/**
 * Generate a complete pin pack for a topic.
 * @param {string} rawTopic
 * @returns {{topic:string, category:string, emoji:string, titles:string[],
 *            description:string, hashtags:string[], imageIdea:object,
 *            articleTitle:string}}
 */
export function generatePinPack(rawTopic) {
  const topic = titleCase(rawTopic);
  const g = detectTopic(rawTopic);
  const year = new Date().getFullYear();

  const titles = TITLE_PATTERNS.map((fn, i) => fn(pick(g.hooks, i), topic, year));

  const hashtags = (() => {
    const base = [...g.tags];
    const topicTag = slugHashtag(topic);
    if (topicTag && !base.some((t) => t.toLowerCase() === topicTag.toLowerCase())) {
      base.unshift(topicTag);
    }
    const extra = ["#Pinterest", "#Trending2026", "#ViralContent", "#PinIdeas", "#Inspiration"];
    const out = [...base];
    for (const e of extra) {
      if (out.length >= 10) break;
      if (!out.some((t) => t.toLowerCase() === e.toLowerCase())) out.push(e);
    }
    return out.slice(0, 10);
  })();

  const description = buildDescription(topic, g, titles, hashtags);

  const imageIdea = {
    headline: titles[0].slice(0, 58),
    layout: "Vertical 2:3 Pinterest pin · text-first, generous margins",
    palette: "White background · #E60023 accent · black headline",
    style: `${g.label} aesthetic · modern serif headline + clean sans body`,
    prompt: `Vertical 2:3 Pinterest pin for "${topic}". Minimal editorial layout: cream-white background, bold black serif headline reading "${titles[0].slice(
      0,
      52
    )}", a thin #E60023 accent line, plenty of negative space, soft natural light texture, no clutter, high readability on mobile, ${g.label.toLowerCase()} mood.`,
  };

  return {
    id: `pin_${Date.now()}`,
    topic,
    category: g.label,
    emoji: g.emoji,
    createdAt: new Date().toISOString(),
    titles,
    description,
    hashtags,
    imageIdea,
    articleTitle: `${topic}: A Practical Guide (${year})`,
    wordCountTarget: "500–800 words",
  };
}

export const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;
