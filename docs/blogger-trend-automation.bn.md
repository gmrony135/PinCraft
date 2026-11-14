# PinCraft: Blogger-only প্রকাশ ও দিনে সর্বোচ্চ ৬টি current-topic article automation

## ১. Publish / Schedule কেন আটকে ছিল এবং কী বদলেছে

আগের review screen-এ Pin artwork save/review করাও বাধ্যতামূলক ছিল। ফলে Blogger-এর লেখা সঠিক হলেও artwork-এর checkbox না দিলে Publish/Schedule বন্ধ থাকত। এটি নিজে Blogger API rejection-এর প্রমাণ নয়।

এখন **Include optional manual Pin pack ডিফল্টভাবে বন্ধ**। শুধু Blogger-এ লেখা দিতে:

1. `/publish` খুলুন; নিজের সম্পূর্ণ article paste করুন অথবা নিজের Cloud Library draft নিন। আবার generate করার প্রয়োজন নেই।
2. **Review this article** → Blogger account, verified blog, title ও HTML preview দেখুন।
3. Pin pack বন্ধই রাখুন। কোনো Pin artwork, Pin title/description/hashtag, public image host বা manual Pin target লাগবে না। Blog featured image-ও optional।
4. **I reviewed this specific HTML article and chosen blog…** দিয়ে নির্দিষ্ট Blogger প্রকাশ অনুমোদন করুন। এটি আগে থেকে tick করা নয়। Review-এর কোনো মান বদলালে আগের অনুমোদন সঙ্গে সঙ্গে অকার্যকর হয়।
5. **Publish blog now** অথবা timezone অনুযায়ী **Schedule Blogger post** চাপুন। সেভ হলে আসল immutable **Job ID** দেখাবে; Jobs-এ পরের checkpoint/error দেখুন।

Pin pack চাইলে আলাদাভাবে সেটি চালু করে নিজের copy/artwork review করতে হবে। কিন্তু pack না চাওয়ার জন্য Blogger প্রকাশ আটকে থাকবে না, এবং server কোনো ফাঁকা manual Pin task বানাবে না। Pinterest সবসময় নিজের native UI-তে manual।

## ২. নতুন Automation setup ব্যবহার

Navigation/Connector থেকে **Automation setup**, অথবা সরাসরি:

**https://pincraftly.vercel.app/automation**

নিজের verified account দিয়ে sign in করে বেছে নিন:

- connected Blogger account এবং নিজের verified administrator blog;
- **১–৩টি category**;
- চাইলে **Topic focus**—যেমন নির্দিষ্ট ঘর/গাছ/রেসিপির বিষয়। এটি evidence search সংকুচিত করে; prompt বা নিশ্চিত trend নয়;
- **English / বাংলা**;
- trend region: **BD, US, GB, IN, CA, AU**;
- audience-এর **IANA timezone**, যেমন `Asia/Dhaka` বা `America/New_York`;
- দৈনিক ceiling **১–৬টি Blogger post**;
- প্রতিটি slot-এর editable `HH:MM` সময়, অন্তত ১ ঘণ্টা ব্যবধানে।

৬টি slot-এর initial suggestion: **08:00, 10:30, 13:00, 15:30, 18:00, 20:30**, নির্বাচিত timezone-এ। এগুলো শুরু করার জন্য ছড়ানো সময়; audience analytics ছাড়া universal “perfect time” বলা হয়নি।

### দুটি আলাদা save

- **Save paused settings:** শুধু settings সেভ হয়। AI request, publishing job বা publication শুরু হয় না।
- **Enable recurring Blogger automation:** আলাদা recurring consent দিতে হবে। এতে ভবিষ্যতের AI article প্রতিবার আপনার individual review ছাড়াই, দেখানো evidence/quality gate পাস করলে, নির্বাচিত blog-এ schedule করার অনুমতি হয়। Existing AI quota ব্যবহারের অনুমতিও এতে অন্তর্ভুক্ত।

একটি article review, website connect, Library save বা কোনো পুরোনো automation record-কে recurring consent ধরা হয় না। নতুন settings/reconnect-এর পরে স্পষ্টভাবে আবার authorize করতে হবে। Category ডিফল্টভাবে owner-এর হয়ে বেছে নেওয়া বা নিজে থেকে automation enable করা হয় না।

## ৩. “বর্তমান ট্রেন্ড” কীভাবে সত্যি যাচাই হয়

1. নির্দিষ্ট public Google Trends RSS এবং category/topic-constrained Google News RSS থেকে bounded XML পড়া হয়। Arbitrary feed/URL fetch, feed HTML execute, DTD/entity বা private network access নেই।
2. **৪৮ ঘণ্টার কম পুরোনো**, category এবং optional topic-এর সঙ্গে মিল থাকা source signal লাগে। সাধারণ sports/news trend-কে home-decor trend বলা যাবে না। Unsafe/high-risk/deal-only signal বাদ দেওয়া হয়।
3. আগে category-relevant **Google Search trend** পাওয়া গেলে অগ্রাধিকার। না থাকলে একই বিষয়ে অন্তত **দুটি আলাদা publisher name**-এর সাম্প্রতিক category-news cluster লাগবে। এটি পরিষ্কারভাবে **news signal, measured search demand নয়** লেখা থাকে। আলাদা publisher name মানেই independent reporting যাচাই হয়েছে—এ দাবি করা হয় না।
4. Relevance, freshness, publisher diversity এবং search-trend confirmation দিয়ে available candidate rank হয়। Source title, publisher, URL, published time, fetched time এবং signal type দেখা যায়। Search volume/virality invent হয় না।
5. সাম্প্রতিক generated/attempted topic সাত দিনের মধ্যে আবার নেওয়া হয় না। Static category angle বা পুরোনো fixed topic দিয়ে trend-এর জায়গা পূরণ হয় না।

Source headline topic evidence; পুরো source article পড়া বা independent fact-checking নয়। সেই কারণে output original **trend-inspired practical guide**, breaking-news report, অযাচাইকৃত মূল্য/ঘটনা বা চিকিৎসার নিশ্চয়তা নয়। উপযুক্ত signal না পাওয়া মানে অপেক্ষা/skip—নকল trend নয়।

## ৪. আগের generator-ই ব্যবহার হয়

- `generateForUser` → existing managed article task → existing bounded provider recovery। Generator নতুন করে প্রতিস্থাপন করা হয়নি।
- Existing 500–850-word complete article validator, তিনটি section ও practical list থাকে। Duplicate/অপূর্ণ paragraph, placeholder এবং category/topic mismatch বাদ যায়।
- বাস্তব generated article নিজের private Library-তে সেভ হয়।
- আলাদা existing AI quality task চালিয়ে **কমপক্ষে 82/100 এবং সব check pass** লাগবে। Failed-quality draft থেকে publication job হয় না।
- AI editorial score **fact-check, originality/plagiarism scan, SEO prediction বা quality guarantee নয়**। UI/consent-এ সীমা দেখানো আছে।
- Existing per-owner/site daily quota, concurrency, cooldown, safety refusal এবং private request-idempotency একই থাকে। একটি spent/uncertain request নতুন key দিয়ে চুপিচুপি আবার করা হয় না।
- একটি passing post সাধারণত **২টি text request** নেয়: article + editorial review। Default owner text allowance ৩০/day; অন্য tools-ও একই quota ব্যবহার করে। Provider/global limit আগে থামাতে পারে। Images স্বয়ংক্রিয়ভাবে generate হয় না; Pinterest artwork-এর quota/খরচ দিয়ে Blogger আটকে দেওয়া হয় না।

**দৈনিক ৬টি হলো সর্বোচ্চ পরিকল্পিত slot, ৬টি guaranteed success নয়।** Evidence/quality/quota/service failure হলে কম হতে পারে এবং কারণ/retained draft দেখা যাবে। কোনো demo/offline/filler লেখা স্বয়ংক্রিয়ভাবে প্রকাশ হয় না।

## ৫. সময়, pause এবং duplicate protection

- প্রথম eligible slot অন্তত ৪৫ মিনিট পরে; preparation সর্বোচ্চ ৯০ মিনিট আগে শুরু হতে পারে।
- প্রতি scheduler invocation-এ সর্বোচ্চ একটি AI stage: discovery+article, অথবা quality+queue/recovery। Durable checkpoint থাকায় browser বন্ধ থাকতে পারে।
- IANA/DST-aware UTC schedule: nonexistent wall-clock time বাদ যায়, repeated slot একই local date-এ একবার ব্যবহৃত হয়।
- Settings revision পাল্টালেও ব্যবহার/সেভ হওয়া instant আবার চালানো হয় না। Configured local-day ceiling এবং **rolling ২৪ ঘণ্টায় hard সর্বোচ্চ ৬টি recurring Blogger reservation** বজায় থাকে। Failed/reserved work চুপিচুপি limit reset করে না।
- Missed deadline-এ backdate/একসঙ্গে ছয়টি catch-up post নয়; slot skip করে পরের eligible সময় নেয়।
- **Pause new automation work** নতুন generation এবং unsent Blogger mutation বন্ধ করে। আগে থেকে in-flight request শেষ হতে পারে।
- **Blogger-এ ইতিমধ্যে SCHEDULED হওয়া post pause করলেই unschedule হয় না।** সেগুলো Blogger UI-তে নিজে manage/unschedule করতে হবে। এখানে remote delete/unpublish নেই।

## ৬. Blogger job ও সত্যিকারের live result

Generated slot এবং one-article review একই guarded direct publisher ব্যবহার করে:

```text
owner / original Google identity / revision / site / capacity যাচাই
→ Blogger draft তৈরি
→ আসল post ID durable save
→ সেই একই ID-তে posts.publish + future publishDate
→ due ADMIN status LIVE
→ token/cookie ছাড়া matching public HTTPS page যাচাই
→ শুধু তখন verified result URL
```

`queued`, `article generated`, `SCHEDULED`, `LIVE` আলাদা অবস্থা। Jobs-এ actual Blogger state দেখতে হবে; generation slot-এ “job created” মানেই এখনো live বলে দাবি নয়। Recurring jobs-এ বানানো per-article owner review timestamp থাকে না; saved recurring consent এবং evidence/editorial receipt আলাদা থাকে।

কোনো mutation receipt অনিশ্চিত হলে `needs_review`; original marker/postID যাচাই ছাড়া নতুন insert নয়। পুরোনো ID, publisher attempt limit, authorization locks এবং public-page verification বদলানো হয়নি।

### আগে থেকেই `needs_review` হলে নতুন করে Publish নয়

Blogger draft/schedule response-এ কখনো non-public editor/preview URL থাকতে পারে। সেটিকে live permalink ধরে validation করে genuine post ID হারানো বা নতুন draft তৈরি করা ঠিক নয়। এই implementation preview URL ও তার query token বাদ দেয়; confirmed post ID/checkpoint-ই রাখে। Final LIVE + matching public-page verification আগের মতোই strict।

আগে তৈরি job নিজে থেকে approve/migrate হবে না। `/jobs`-এ **Job ID** ও **Blogger post ID** মিলিয়ে সঠিক saved job-এর **Inspect result** খুলুন। Blogger-এ সত্যিকারের post পরীক্ষা করার পরেই inspection checkbox/প্রয়োজনে original-account reconfirmation দিয়ে **Verify existing post** দিন। Marker মিললে একই ID publish checkpoint-এ ফেরে; **Run due step** একই post-এ পরের কাজ করে। এই recovery আরেকটি নতুন submission নয়। পরপর নতুন Publish চেপে duplicate draft বানাবেন না। অন্য saved attempts থামানোও explicit owner inspection-এর সিদ্ধান্ত; app remote post delete করে না।

### Verify existing post-এ 404 এলে: অনুসন্ধান অথবা স্পষ্টভাবে থামিয়ে লেখা উদ্ধার

একই generic error দিয়ে quota শেষ বা post মুছে গেছে ধরে নেওয়া হয় না। `/jobs` → **Inspect result** → **Find existing post — read only** দিয়ে শুরু করুন। পোস্ট খুঁজে পেয়েছেন—এমন checkbox দাবি না করেই এই search করা যায়।

- Original Google identity এবং একই verified blog-এর administrator access যাচাই হয়। Saved post ID থাকলে আগে তার exact ADMIN read হয়; শুধু post-404 হলেই তালিকা খোঁজা হয়। Lost receipt-এ কোনো ID না থাকলে search শুধু নিজের job marker খোঁজে, ID বানায় না।
- এবার প্রথম পাতা নয়: Draft, Scheduled ও Live প্রতিটিতে সর্বোচ্চ **১০ পাতা × ২৫ পোস্ট**, মোট সর্বোচ্চ **৭৫০ পোস্ট / ৩০ request**, ৪২-সেকেন্ডের scan deadline। Provider cursor শুধু server memory-তে থাকে। প্রতি status-এর page/post count ও coverage Jobs-এ দেখা যায়।
- **All returned pages checked** মানে ওই মুহূর্তে API-র ফেরত দেওয়া তালিকা শেষ হয়েছে; **More posts may remain unchecked** মানে সীমা/অসম্পূর্ণতা আছে। কোনোটিই post deletion-এর নিশ্চয়তা নয়। পুরোনো first-page-only ফলকে নতুন complete-search প্রমাণ বানানো হয় না।
- Search কোনো ID বদলায় না, job resume করে না এবং draft/publish করে না। Marker মেলা ID শুধু candidate। Candidate বেছে নিলে inspection checkbox পরিষ্কার হয়; প্রকৃত পোস্ট দেখে নতুন করে **Verify existing post** দিতে হয়। একাধিক match হলে স্বয়ংক্রিয় নির্বাচন নয়।
- Generic HTTP 403 দেখেই reconnect বা quota-failure দাবি নয়; 401/প্রকৃত OAuth reconnect error হলে original account reconnect/re-verify করতে বলে। অন্য post-এর লেখা/title/ID, preview/page token, private URL বা raw provider body save/expose হয় না।

**Blogger-এ খুঁজেও না পেলে:** একই ID বারবার Verify নয়। Actual blog দেখে সিদ্ধান্ত নিলে inspection checkbox দিয়ে **Stop this job — keep saved article** চাপুন। এটি শুধু ওই local job বন্ধ করে; remote post delete করে না, পুরোনো ID/attempt মুছে না এবং publication success দাবি করে না।

তারপর ওই row-তে **Review saved article again** পাওয়া যায়। Protected owner-only read থেকে original safe HTML/title/optional featured image ফেরে; নতুন লেখা generate বা নতুন job তৈরি হয় না। পুরোনো schedule/consent বহন করা হয় না—fresh review-এর checkbox খালি থাকে। Search অসম্পূর্ণ হলে সেটিকে absence proof ধরে replacement করা যাবে না। অন্য একই-লেখার unresolved job থাকলে সেটিও পরীক্ষা/স্পষ্টভাবে stop না করা পর্যন্ত নতুন request ID দিয়েও duplicate submission আটকে যায়।

Pause/reconnection/recurring authority bypass হয় না। Final ADMIN LIVE + public-page verification-এ এই list fallback ব্যবহার হয় না। Provider-read-only search-এ OAuth renewal ও safe diagnostic checkpoint-এর local write হতে পারে; এটি database-read-only দাবি নয়।

## ৭. Free Actions + existing Vercel generator

বর্তমান `.github/workflows/pincraft-reviewed-blogger.yml`-ই বাড়ানো হয়েছে; legacy Pinterest workflow চালু করা হয়নি।

- Public **gmrony135/PinCraft**, trusted **main**, `REVIEWED_BLOGGER_SCHEDULER_ENABLED=true`।
- UTC cron: **`7,17,27,37,47,57 * * * *`**, best effort।
- Node 24.22.3; production dependencies; official actions SHA-pinned; এক concurrent run; five-minute timeout; combined soft deadline প্রায় ১৮০ সেকেন্ড।
- `contents: read` এবং **`id-token: write`**। Repo write permission নয়।
- Direct Node runner প্রথমে short-lived GitHub OIDC দিয়ে **`/api/internal/blog-automation/tick`**-এ একবার empty `{}` পাঠায়। Endpoint issuer/audience/public repo ID/main/exact reviewed workflow/**deployed SHA** এবং replay যাচাই করে। Cookie, UID, user-supplied settings/adapter বা shared cron secret দিয়ে এটি চালানো যায় না।
- AI generation **আগের Vercel service/configuration-এ** হয়। Gemini/Groq/অন্য AI key GitHub-এ নতুন করে কপি বা decrypt করতে হয় না।
- এরপর runner সরাসরি Node-এ সর্বোচ্চ ৪ due Blogger candidate / ১২ checkpoint চালায়। AI generation unavailable হলেও আগে থেকে owner-authorized Blogger jobs বন্ধ করে দেওয়া হয় না।
- Vercel-এর normal system env exposure চালু থাকতে হবে (`VERCEL_GIT_COMMIT_SHA`), এবং `APP_URL` exact canonical origin। নতুন main commit ও পুরোনো deployment mismatch হলে generation সাময়িকভাবে fail-closed হয়।
- GitHub-এ আগের চার publishing Secrets-ই যথেষ্ট; existing encryption key/Google client/Firebase project mapping বদলাবেন না। নতুন long-lived bearer, Pinterest session/global refresh বা paid service লাগানো হয়নি।

**কখনো `.github/workflows/pincraft-automation.yml` পুনরায় enable করবেন না।** `LEGACY_PINTEREST_API_SCHEDULER_ENABLED=false` থাকবে। পুরোনো `/api/internal/automation/tick` এই নতুন path নয়।

Firestore Spark/Vercel/AI/Google-এর project-wide quotas থাকে। Billing/IAM/Rules/TTL পরিবর্তন করা হয়নি, নতুন composite index লাগে না। Source file, empty workflow success বা heartbeat-কে real post/cron acceptance বলা যায় না।

## ৮. কীভাবে যাচাই করবেন

1. Automation setup-এ actual saved status, exact next slot, latest generation heartbeat, quota এবং last outcome দেখুন।
2. Latest 12 actual slots খুলে source evidence এবং editorial result দেখুন; তৈরি হলে private draft এবং saved Blogger job-এ যান।
3. Jobs-এ immutable Job ID, checkpoint, actual error/HTTP status এবং সত্যিকারের verified URL দেখুন।
4. Blogger-এ SCHEDULED post থেকে সময়মতো LIVE/public হয়েছে কি না independent check করুন।
5. GitHub run-এর event **`schedule`** কি না আলাদা দেখুন। Manual `workflow_dispatch` success scheduled execution-এর প্রমাণ নয়।

Local test command:

```bash
# শুধু generated synthetic emulator env; কখনো production credentials নয়
set -a; . .cache/firebase-test.env; set +a
PINCRAFT_PUBLISHING_MODE=blogger_manual_pin npm run test:publishing
PINCRAFT_PUBLISHING_MODE=blogger_manual_pin npm run test:publishing:automation
npm run test:publishing:entry
npm run build
```

Backend tests বাস্তব local Auth/Firestore transactions এবং explicitly synthetic RSS/AI/Blogger replies ব্যবহার করে। Browser tests real built Next routes/Chromium ব্যবহার করলেও provider receipts synthetic। কোনো test ফল genuine owner authorization, successful live AI draft বা production Blogger publication-এর বদলি নয়। [বর্তমান validation ledger](blog-automation-validation.json)।
