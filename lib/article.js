// PinCraft article engine — writes a full SEO blog article for a pin title.
// Runs fully in the browser: instant, offline, free.

import { detectTopic } from "./generator";

/* ------------------------- per-niche writing bits ------------------------- */

const VOICE = {
  "Sad Quotes": {
    approachHeading: "How to use these words when it all feels heavy",
    approachClose:
      "You do not need to fix the feeling today. You only need to name it, sit with it for a minute, and let the next hour be ordinary. That is not avoidance — that is how grief and heartbreak actually move.",
    feeling: "that quiet ache you carry around all day and never explain to anyone",
    stakes: "the days when everything reminds you of someone",
    promise: "words for the feelings you could not put into a sentence",
    listHeading: "8 quotes for the days words are hard",
    items: [
      "“It still hurts, and that's okay. Healing was never meant to be fast.”",
      "“Some people leave and take the volume out of your life.”",
      "“I was fine until I remembered how you said my name.”",
      "“The hardest part was not the goodbye — it was the ordinary Tuesday that came after.”",
      "“You can miss someone and still know they were never right for you.”",
      "“I did not lose you all at once. I lost you a little more each morning.”",
      "“Not every feeling needs a reply. Some just need to be felt.”",
      "“You will not always feel like this. That is not a promise, it is a pattern.”",
    ],
  },
  "Love Quotes": {
    approachHeading: "How to turn a quote into a moment",
    approachClose:
      "The best love quotes are not the poetry — they are the timing. Save one and send it on a random Tuesday afternoon. That is the whole secret, and it costs nothing.",
    feeling: "the small, ordinary ways love shows up when nobody is watching",
    stakes: "the moments that go by too fast to notice the first time",
    promise: "words that make your person feel seen",
    listHeading: "7 love quotes worth sending today",
    items: [
      "“You are my favourite part of an ordinary day.”",
      "“Love is mostly text messages asking if you ate.”",
      "“I still get excited when your name shows up on my phone.”",
      "“Home is not a place. It is the way you say my name.”",
      "“I would choose you again, knowing everything.”",
      "“Small love is the loudest kind.”",
      "“You make the boring hours feel like a memory I want to keep.”",
    ],
  },
  Motivation: {
    feeling: "that gap between where you are and where you keep telling yourself you should be",
    stakes: "Monday mornings when the plan looks too big to start",
    promise: "the smallest version of the plan that actually gets done",
    listHeading: "7 lines to read before you quit",
    items: [
      "“Start before you feel ready — readiness is a story you tell yourself.”",
      "“Discipline is remembering what you want when you are tired.”",
      "“You are not behind. You are building something that takes time.”",
      "“One page a day is 365 pages a year.”",
      "“Motivation gets you started. The routine keeps the promise.”",
      "“Nobody sees the boring part, and the boring part is the whole thing.”",
      "“Show up small. Small shows up every day.”",
    ],
  },
  "Home Decor": {
    feeling: "walking into a room that never quite feels finished",
    stakes: "the corner you have moved five times and still do not like",
    promise: "one change you can make this weekend with what you already own",
    listHeading: "6 small changes that make a room feel finished",
    items: [
      "Clear one surface completely — clutter reads as unfinished.",
      "Add one warm light source at eye level instead of the ceiling light.",
      "Hang art slightly lower than you think: centre it at eye height.",
      "Keep three textures in a room — wood, textile, and something smooth.",
      "Group objects in odd numbers; three reads calmer than four.",
      "Empty one shelf. Space is a design choice, not a waste.",
    ],
  },
  "Food & Recipes": {
    feeling: "opening the fridge at 7pm with no plan at all",
    stakes: "the nights you would rather order in than cook",
    promise: "a real dinner that will not eat your evening",
    listHeading: "6 rules for a fast weeknight dinner",
    items: [
      "Start with one pan and one high-heat ingredient.",
      "Salt earlier than you think — salt is structure, not topping.",
      "Keep a cheat ingredient: chilli oil, lemon, or good stock.",
      "Cook the sauce while the pasta water boils; never wait.",
      "Finish everything with something fresh or something crunchy.",
      "Double the base. Tomorrow's lunch is a gift from tonight.",
    ],
  },
  "Fashion & Outfits": {
    feeling: "a wardrobe full of clothes and nothing that feels right",
    stakes: "the mornings you change three times and still feel off",
    promise: "fewer pieces that work together far better",
    listHeading: "6 rules for a wardrobe that always works",
    items: [
      "Buy for the life you actually have, not the one you plan to have.",
      "One statement piece per outfit — that is the whole formula.",
      "Fit beats price. A tailored basic looks expensive.",
      "Stick to three core colours you already own.",
      "Shoes and outerwear carry the outfit. Spend there first.",
      "If it needs a specific bra or shoe to work, it does not work.",
    ],
  },
  "Beauty & Skincare": {
    feeling: "trying every product and still not liking your skin",
    stakes: "the mornings you wake up and the mirror starts the day badly",
    promise: "a short routine you will actually finish",
    listHeading: "6 rules for skin that behaves",
    items: [
      "Cleanse gently — stripping the barrier is what causes the problems.",
      "One active at a time, for at least four weeks.",
      "Sunscreen every morning, even indoors near windows.",
      "Moisturise while the skin is still damp.",
      "Introduce new products one at a time so you can blame correctly.",
      "Sleep is a skincare ingredient you cannot buy.",
    ],
  },
  "DIY & Crafts": {
    feeling: "wanting to make something but not wanting to buy a whole trolley of supplies",
    stakes: "weekends that vanish into scrolling instead of making",
    promise: "a project you can finish before dinner",
    listHeading: "6 rules for projects that actually get finished",
    items: [
      "Pick a project that fits in one session, not one month.",
      "Use what you already own for attempt number one.",
      "Pre-cut every piece before you start gluing.",
      "A cheap tool you use beats a perfect tool you do not.",
      "Photograph the steps — future you will want them.",
      "Finished and imperfect beats perfect and unfinished.",
    ],
  },
  "Gardening & Plants": {
    feeling: "wanting a green space and killing every plant you bring home",
    stakes: "watching a healthy plant slowly give up on you",
    promise: "the few rules that keep plants alive",
    listHeading: "6 rules that keep plants alive",
    items: [
      "Water deeply and less often — roots chase water, not sips.",
      "Always check the drainage hole before you blame yourself.",
      "Match the plant to the light you actually have.",
      "Repot in spring, not whenever you feel like it.",
      "Yellow leaves are usually too much water, not too little.",
      "Learn one plant well before you buy five.",
    ],
  },
  "Travel & Lifestyle": {
    feeling: "counting days until the next trip instead of being where you are",
    stakes: "the itineraries that were so full nothing was enjoyed",
    promise: "a slower way to travel that costs less",
    listHeading: "6 rules for trips that feel longer",
    items: [
      "Plan one anchor per day, not five.",
      "Book accommodation near public transport, not near the sights.",
      "Eat where people queue locally, not where signs are in English.",
      "Leave one full day completely unplanned.",
      "Carry less than you think — you can wash clothes anywhere.",
      "Walk the first morning. It teaches you the whole city.",
    ],
  },
  "Art & Aesthetic": {
    feeling: "the gap between what you picture and what ends up on the page",
    stakes: "sketchbooks that stop after page four",
    promise: "a small daily practice that finally sticks",
    listHeading: "6 rules for a creative habit that lasts",
    items: [
      "Ten minutes daily beats three hours once a month.",
      "Pick three colours and stay inside them for a week.",
      "Copy your favourite artist openly — it is how everyone learns.",
      "Finish bad drawings. Unfinished ones teach nothing.",
      "Keep supplies in sight, not in a drawer.",
      "Show someone the work before you think it is ready.",
    ],
  },
  "Health & Fitness": {
    feeling: "knowing what to do and still not doing it",
    stakes: "the plans that end on day four",
    promise: "the smallest routine that survives a bad week",
    listHeading: "6 rules for habits that stick",
    items: [
      "Anchor the habit to something you already do daily.",
      "Make the first version embarrassingly small.",
      "Track streaks, not scores.",
      "Never miss twice — one missed day is data, two is a pattern.",
      "Prepare the night before so morning needs no decisions.",
      "Sleep is the habit that makes the others possible.",
    ],
  },
  Lifestyle: {
    feeling: "doing a lot and still feeling behind",
    stakes: "weeks that disappear without anything to show",
    promise: "a simpler system that fits a real life",
    listHeading: "6 rules that simplify everything",
    items: [
      "Choose one thing that matters this week.",
      "Make the first step visible.",
      "Decide once, then stop re-deciding.",
      "Keep the routine small enough to survive a bad day.",
      "Track the streak, not the score.",
      "Review weekly, not daily — daily is noise.",
    ],
  },
};

/* ------------------------------ helpers ---------------------------------- */

function sentimentFor(title) {
  const t = title.toLowerCase();
  if (/(cry|sad|hurt|breakup|miss|lost|alone|pain|goodbye)/.test(t))
    return "sad";
  if (/(motivat|success|hustle|goal|study|never give|discipline|strong)/.test(t))
    return "motivational";
  if (/(easy|quick|simple|fast|budget|beginner|cheap)/.test(t)) return "practical";
  return "warm";
}

function keywordList(title, g) {
  const core = title
    .toLowerCase()
    .replace(/[0-9]+/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["the", "that", "will", "make", "you", "your", "and", "for", "with", "this", "from", "are", "how", "why"].includes(w))
    .slice(0, 4);
  const label = g.label.toLowerCase();
  return [...new Set([...core, label, `${label} ideas`, `${label} tips`])].slice(0, 7);
}

const p = (...paras) => paras;

/* ------------------------------- main ----------------------------------- */

export function generateArticle(rawTitle, topicHint) {
  const title = String(rawTitle || "Untitled Pin").trim();
  const g = detectTopic(topicHint || title);
  const v = VOICE[g.label] || VOICE.Lifestyle;
  const sentiment = sentimentFor(title);
  const keywords = keywordList(title, g);
  const label = g.label.toLowerCase();

  /* ---- intro: 80–100 words, emotional ---- */
  const intro = [
    `There is a version of ${label} everyone talks about, and then there is the real one: ${v.feeling}.`,
    `Most advice assumes you have time and a perfect setup. You probably do not — you have ${v.stakes} and a few spare minutes.`,
    `So this post is about ${v.promise} — nothing more.`,
    `Read it once, save it, come back when you need it.`,
  ].join(" ");

  /* ---- 3 H2 sections, 2–3 paragraphs each ---- */
  const sections = [
    {
      heading: `Why ${title} is worth your attention`,
      paragraphs: p(
        `The first thing to understand is that ${label} is not really about information. You already know most of what you are supposed to do. What is missing is a version of it small enough to start on a day like today.`,
        `That is why big plans fail quietly. They are not wrong, they are just too large for a normal life. When the plan asks for an hour and you have ten minutes, the plan does not get shortened — it gets skipped.`,
        `So the goal here is different: find the smallest complete version, do that, and let repetition do the heavy lifting.`
      ),
    },
    {
      heading: v.approachHeading || `The simple approach that actually works`,
      paragraphs: p(
        `Start with one anchor. Choose a time, a place, or an existing habit that already happens without thinking — after your morning tea, before you open your laptop, on the walk home. An anchor does not care about your mood, which is exactly why it works.`,
        `Then make the first step visible. Whatever the action is, keep the tool in sight: the notebook open, the shoes by the door, the pin saved where you will see it. Five seconds of friction is enough to kill a good habit.`,
        v.approachClose ||
          `Finally, track only the streak, not the score. One tick per day. Scores invite guilt and comparison; streaks invite momentum. ${
            sentiment === "motivational"
              ? "You are not chasing a perfect week — you are protecting a chain you do not want to break."
              : "The chain is the whole trick, and it is much kinder than motivation."
          }`
      ),
    },
    {
      heading: `Mistakes to skip (and what to do instead)`,
      paragraphs: p(
        `**Copying someone else's system exactly.** Their constraints are not yours. Borrow the principles, then set your own numbers — how many, how long, how often.`,
        `**Restarting from zero after one missed day.** A missed day is data, not failure. Resume at the same size you left off. Two missed days is a pattern; one is just life.`,
        `**Optimising before doing.** Ten logged days beats a perfect plan you never ran, because only one of them produces anything you can learn from.`
      ),
    },
  ];

  /* ---- list / quotes section ---- */
  const listSection = {
    heading: v.listHeading,
    intro:
      sentiment === "sad"
        ? "Save the ones that feel true. Come back when you need them."
        : "Pick one and try it this week — not all of them.",
    items: v.items,
  };

  /* ---- conclusion ---- */
  const conclusion = [
    `That is the whole approach: ${label}, simplified until it fits a real day.`,
    `Choose one anchor for ${title.toLowerCase()}, set it for tomorrow rather than for "someday this week", and do the smallest complete version. Then repeat it long enough that it stops being a decision.`,
    `Save this post, pin the version that speaks to you, and come back on the day you need a nudge.`,
  ].join(" ");

  const plainText = toPlainText({ title, intro, sections, listSection, conclusion, keywords });
  const words = countWords(plainText);

  return {
    id: `art_${Date.now()}`,
    title,
    niche: g.label,
    emoji: g.emoji,
    createdAt: new Date().toISOString(),
    intro,
    sections,
    listSection,
    conclusion,
    keywords,
    wordCount: words,
    seoScore: seoScore({ title, words, keywords, sections, plainText }),
    plainText,
    readMinutes: Math.max(2, Math.round(words / 220)),
  };
}

/* ------------------------------ utilities -------------------------------- */

export function countWords(text) {
  return String(text).split(/\s+/).filter(Boolean).length;
}

function stripMd(s) {
  return String(s).replace(/\*\*/g, "");
}

export function toPlainText(a) {
  const parts = [
    `# ${a.title}`,
    "",
    a.intro,
    "",
    ...a.sections.flatMap((s) => [`## ${s.heading}`, "", ...s.paragraphs.flatMap((x) => [stripMd(x), ""])]),
    `## ${a.listSection.heading}`,
    "",
    ...a.listSection.items.map((x) => `- ${stripMd(x)}`),
    "",
    "## Final thoughts",
    "",
    a.conclusion,
    "",
    `Keywords: ${a.keywords.join(", ")}`,
  ];
  return parts.join("\n");
}

/**
 * Lightweight on-page SEO score (0–100) based on real heuristics:
 * word count, title length, heading structure, list section,
 * keyword presence/density and intro length.
 */
export function seoScore({ title, words, keywords, sections, plainText }) {
  let score = 0;
  const detail = [];

  // word count 500–800
  if (words >= 500 && words <= 800) {
    score += 26;
    detail.push("Word count in the ideal 500–800 range");
  } else if (words >= 400) {
    score += 16;
    detail.push("Word count slightly outside 500–800");
  } else {
    score += 8;
    detail.push("Article is shorter than recommended");
  }

  // title length
  const tLen = title.length;
  if (tLen >= 35 && tLen <= 65) {
    score += 16;
    detail.push("Title length is ideal for search results");
  } else if (tLen >= 25 && tLen <= 75) {
    score += 11;
    detail.push("Title length is acceptable");
  } else {
    score += 6;
    detail.push("Title could be 35–65 characters");
  }

  // heading structure
  const h2 = sections.length;
  if (h2 >= 3) {
    score += 16;
    detail.push("3+ H2 sub-headings structure the page");
  } else {
    score += 8;
    detail.push("Add more sub-headings");
  }

  // list section helps featured snippets
  score += 12;
  detail.push("List section is eligible for featured snippets");

  // keyword presence
  const lower = plainText.toLowerCase();
  const found = keywords.filter((k) => lower.includes(k.toLowerCase())).length;
  const ratio = keywords.length ? found / keywords.length : 0;
  score += Math.round(ratio * 20);
  detail.push(`${found}/${keywords.length} target keywords appear in the copy`);

  // intro length 80–100 words
  const introWords = countWords(plainText.split("\n\n")[1] || "");
  if (introWords >= 75 && introWords <= 105) {
    score += 10;
    detail.push("Intro is the ideal 80–100 words");
  } else {
    score += 5;
    detail.push("Intro length could be tighter");
  }

  return { total: Math.min(100, Math.max(60, score)), detail };
}
