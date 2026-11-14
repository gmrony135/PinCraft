# PinCraft: Blogger অটো-পাবলিশ + Pinterest ম্যানুয়াল আপলোড

## এই ডেলিভারিতে কী আছে

আপনার নির্বাচিত পথ: **Blogger automatic → Pinterest manual/native scheduler**। আগের AI লেখা, ছবি, হ্যাশট্যাগ তৈরি এবং private Library বজায় আছে। নতুন VPS, Firebase Blaze, Firebase Functions, Cloud Scheduler, Cloudflare Worker বা পেইড image-storage service লাগানো হয়নি। বর্তমান ওয়েবসাইট `https://pincraftly.vercel.app`-এই থাকবে।

```text
Article Writer-এ নির্দিষ্ট লেখা/Pin copy/artwork review ও অনুমোদন
       ↓
Owner-scoped Firestore job + idempotent requestId
       ↓
Blogger draft তৈরি → আসল post ID সংরক্ষণ
       ↓
সেই ID-তে publish অথবা publishDate দিয়ে future schedule
       ↓
ADMIN GET: LIVE + প্রকাশের সময় হয়েছে?
       ↓
টোকেন/কুকি ছাড়া public HTTPS article page যাচাই
       ↓
Jobs-এ manual Pin pack: title / description / hashtags / artwork reference / real URL
       ↓
আপনি Pinterest-এ নিজে upload, board নির্বাচন ও native scheduling করবেন
```

**এটি Pinterest অটো-পোস্টার নয়।** কোনো Pinterest API, headless login/click, session-cookie সংগ্রহ বা কৃত্রিম Pin receipt নেই। Pin-এর public visibility, reach বা প্রথম দিনেই দেখা যাওয়ার নিশ্চয়তা নেই।

> স্থানীয় পরীক্ষা ও production build আলাদা evidence। এই পরিবর্তনের জন্য production secrets ইনস্টল, GitHub cron চালু, আসল Google consent বা আসল Blogger পোস্ট করা হয়নি। নিচের owner-side setup ও সচেতন activation এখনও প্রয়োজন।

**Final local validation:** backend **৪৯/৪৯**, production-build API/Chromium **৩১/৩১**, existing regression **২১১/২১১** এবং build পাস। [পরীক্ষার বিবরণ ও live-activation সীমা](reviewed-publishing-validation.md)। Provider receipts সব synthetic—real publishing acceptance নয়।

## ১. মূল কোড ও workflow

| ফাইল | কাজ |
| --- | --- |
| `lib/publishing/content.mjs` | strict reviewed input, সীমিত HTML, সময়/URL/হ্যাশট্যাগ যাচাই |
| `lib/publishing/blogger.mjs` | Blogger API v3, offline token refresh, draft/publish/schedule/LIVE verification |
| `lib/publishing/repository.mjs` | Firestore jobs, owner checks, leases, checkpoints, retry/review, manual child task |
| `app/api/publish/[...path]/route.js` | signed-in owner API; browser-এ provider secrets যায় না |
| `app/api/blogger/callback/route.js` | canonical Google OAuth callback |
| `scripts/run-reviewed-blogger.mjs` | সরাসরি Node runner; AI/Pinterest publisher নয় |
| `.github/workflows/pincraft-reviewed-blogger.yml` | প্রতি দশ মিনিটের best-effort cron; activation gate বন্ধ থাকে |
| `components/publishing/` | review composer, Jobs, copy/PNG/ZIP download, dashboard/setup |
| `scripts/test-reviewed-blogger.mjs` | guarded local unit/Firestore/Auth tests |
| `scripts/check-reviewed-publishing-ui.mjs` | আসল Next API + Chromium tests, শুধু synthetic remote replies |

পুরোনো `workers/publisher/` আর `lib/publishing/bridge*` deployment target নয়। পুরোনো `.github/workflows/pincraft-automation.yml`-ও এই direct runner নয়। ঐতিহাসিক পরীক্ষার ফল দিয়ে নতুন publishing সফল বলা যাবে না।

## ২. Google Cloud-এ Blogger OAuth প্রস্তুত করুন

Google account-এর মালিক নিজে এগুলো করবেন; কোনো password, refresh token বা private key চ্যাটে দেবেন না।

1. আপনার Google Cloud project-এ **Blogger API v3** enable করুন।
2. Google Auth Platform/OAuth consent screen-এ app name, support/developer contact এবং প্রয়োজনীয় audience কনফিগার করুন। ব্যবহার অনুযায়ী Google-এর verification শর্ত মানুন।
3. Development/testing হলে নিজের Google account-টি অনুমোদিত test user হিসেবে রাখুন। **External + Testing অবস্থার offline refresh grant সাধারণত সাত দিনেই মেয়াদ হারাতে পারে**; স্থায়ী permission ধরে নেবেন না। Published/verified অবস্থাও চিরস্থায়ী grant-এর নিশ্চয়তা নয়। Google reference: <https://developers.google.com/identity/protocols/oauth2#expiration>।
4. **Web application** OAuth client তৈরি/নির্বাচন করুন। Firebase Google sign-in client-এর তথ্য প্রকাশ করলেই Blogger consent হয়ে যায় না।
5. Authorized redirect URI-তে হুবহু যোগ করুন:

   ```text
   https://pincraftly.vercel.app/api/blogger/callback
   ```

   শেষে `/` নয়; পুরোনো `/api/integrations/blogger/callback`-এর সঙ্গে গুলিয়ে ফেলবেন না। আগে থেকে পুরোনো URI অন্য জায়গায় লাগলে বিনা যাচাইয়ে সেটি মুছবেন না; এই নতুন URI যোগ করুন।
6. এই publishing consent-এর scope:

   ```text
   https://www.googleapis.com/auth/blogger
   ```

7. Client ID এবং client secret নিজের environment/secret settings-এ রাখুন। App নিজেই `access_type=offline`, `prompt=consent`, state, browser-bound cookie ও PKCE S256 ব্যবহার করে। OAuth Playground থেকে ব্যক্তিগত refresh token কপি/পেস্ট করতে হবে না।

Blogger-এর official `posts.publish` endpoint-এ optional **`publishDate`** হলো publication schedule-এর datetime; এই method-এ request body পাঠানো হয় না। API reference: <https://developers.google.com/blogger/docs/3.0/reference/posts/publish>। কেবল একটি future timestamp পাঠানো মানেই LIVE নয়—এই কোড remote state ও public page পরে আলাদাভাবে পরীক্ষা করে।

## ৩. বর্তমান ওয়েবসাইটের server environment

এগুলো **Vercel project-এর server-side Production environment**-এ লাগবে; `NEXT_PUBLIC_*` নয়। আগে থেকে থাকা Firebase Auth, Admin, session, generation settings মুছবেন/বদলাবেন না।

| Website environment | কী দেবেন |
| --- | --- |
| `PINCRAFT_PUBLISHING_MODE` | `blogger_manual_pin` (unset থাকলেও এই mode default) |
| `APP_URL` | `https://pincraftly.vercel.app` |
| `FIREBASE_PROJECT_ID` | বর্তমান একই Firebase project ID |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | বর্তমান অনুমোদিত Firebase Admin service identity |
| `FIREBASE_ADMIN_PRIVATE_KEY` | সংশ্লিষ্ট আসল private key; trusted secret UI-তে, source-এ নয় |
| `AUTOMATION_ENCRYPTION_KEY` | **আগের একই ৩২-byte base64 encryption key** |
| `GOOGLE_CLIENT_ID` | উপরের Blogger OAuth Web client ID |
| `GOOGLE_CLIENT_SECRET` | সেই একই Web client-এর secret |
| `GOOGLE_REDIRECT_URI` | `https://pincraftly.vercel.app/api/blogger/callback` |

- বিদ্যমান `BLOGGER_CLIENT_ID` / `BLOGGER_CLIENT_SECRET` fallback-ও সমর্থিত। `GOOGLE_CLIENT_ID` উপস্থিত থাকলে Google নামের pair-টাই ব্যবহৃত হয়; দুই ভিন্ন client মিশিয়ে দেবেন না।
- `TOKEN_ENCRYPTION_KEY` alias সমর্থিত; কিন্তু দুটো encryption variable থাকলে **দুটোর মান একই হতে হবে**। শুধু নাম মেলানোর জন্য key ঘোরাবেন না—তাহলে পুরোনো encrypted grants এবং অন্য encrypted records অপাঠ্য হবে।
- Firebase-এর email/password ও Google login-এর আগের `AUTH_SESSION_SECRET`, public Firebase identifiers এবং generation keys আগের মতো থাকবে। এগুলো এই publishing workflow-তে নতুন করে বানাতে হবে না।
- প্রয়োজনীয় server environment পরিবর্তনের পর নিজের স্বাভাবিক, অনুমোদিত deployment করুন। এই গাইড পড়া বা কোড ফাইল থাকা deployment-এর প্রমাণ নয়।

## ৪. GitHub Secrets এবং Variables

Repository **Settings → Secrets and variables → Actions**-এ নিচের নামগুলো যোগ করুন। Screenshot, issue, source বা Actions log-এ secret দেখাবেন না।

### Repository secrets

| GitHub Secret | Runner-এ যে environment হয় | নির্দেশনা |
| --- | --- | --- |
| `PINCRAFT_FIREBASE_ADMIN_CLIENT_EMAIL` | `FIREBASE_ADMIN_CLIENT_EMAIL` | অনুমোদিত একই project-এর server identity |
| `PINCRAFT_FIREBASE_ADMIN_PRIVATE_KEY` | `FIREBASE_ADMIN_PRIVATE_KEY` | সংশ্লিষ্ট private key; multiline অথবা escaped `\n` সমর্থিত |
| `PINCRAFT_TOKEN_ENCRYPTION_KEY` | `AUTOMATION_ENCRYPTION_KEY` | ওয়েবসাইটের **ঠিক একই বিদ্যমান key** |
| `GOOGLE_CLIENT_SECRET` | `GOOGLE_CLIENT_SECRET` | ওয়েবসাইটের একই Google OAuth client secret |

### Repository variables

| GitHub Variable | মান |
| --- | --- |
| `PINCRAFT_FIREBASE_PROJECT_ID` | বর্তমান একই Firebase project ID; public identifier |
| `GOOGLE_CLIENT_ID` | ওয়েবসাইটের একই OAuth Web client ID; public identifier |
| `REVIEWED_BLOGGER_SCHEDULER_ENABLED` | setup/review শেষ না হওয়া পর্যন্ত unset/`false`; পরে সচেতনভাবে `true` |

`APP_URL`, exact callback এবং manual mode workflow-তে non-secret constants। ব্যক্তিগত Google refresh grant **প্রতি owner-এর encrypted Firestore connection record-এ** থাকে; একটি global `GOOGLE_REFRESH_TOKEN` দিয়ে সব ব্যবহারকারীর হয়ে পোস্ট করা হয় না। তাই Actions-এ নিচের কোনোটি লাগবে না:

- `GOOGLE_REFRESH_TOKEN`
- Pinterest password/access token/session JSON/cookies
- Gemini বা অন্য AI API key
- Vercel deployment token, GitHub write token, Cloudflare token

Runner কেবল saved reviewed content পড়ে। AI generation-এ তার প্রবেশাধিকার বা কাজ নেই। Service identity-র বর্তমান অনুমোদিত Firestore read/write এবং Firebase managed-user read access লাগবে; এই পরিবর্তন **Rules, IAM, indexes বা billing পরিবর্তনের অনুমতি নয়**। কোনো permission error হলে approved operator সেটি পর্যালোচনা করবেন; browser Rules উন্মুক্ত করে সমাধান করবেন না।

## ৫. আগে ব্যক্তিগত Blogger connection তৈরি করুন

1. canonical HTTPS সাইটে verified Email/Password বা Google identity দিয়ে PinCraft-এ sign in করুন।
2. **Connections → Connect Blogger** চাপুন। নিজের Google account দিয়ে আসল consent সম্পন্ন করুন।
3. ফিরে এসে **Load my blogs** → নিজের administrator blog নির্বাচন → **Verify & add website** করুন। এটি কোনো পোস্ট দেয় না।
4. এক free Blogger website-এর আগের capacity বজায় আছে। অতিরিক্ত site-এ অনুমোদিত, মেয়াদবহাল subscription লাগবে; pending payment claim দিয়ে বাড়তি capacity মেলে না। Payment collection/reviewer-এর আগের বন্ধ অবস্থা বদলানো হয়নি।
5. Google reconnect করলে একই blog আবার verify করুন। পুরোনো job **Retry-তে আলাদা reconfirmation** ছাড়া নতুন grant ব্যবহার করবে না। অন্য Google identity দিয়ে পুরোনো reviewed job দখল করা যায় না।

## ৬. Workflow সচেতনভাবে চালু করুন

ফাইল: `.github/workflows/pincraft-reviewed-blogger.yml`

```yaml
schedule:
  - cron: '7,17,27,37,47,57 * * * *'
```

Cron UTC-তে চলে; saved job UTC time আলাদাভাবে সংরক্ষিত হয়। Node runner IANA timezone-কে cron string বানিয়ে আন্দাজ করে না।

Activation-এর শর্ত:

- workflow trusted **`gmrony135/PinCraft`** repository-র **`main`** branch-এ থাকবে; default branch-ও main হওয়া উচিত;
- repository **public** হতে হবে;
- `REVIEWED_BLOGGER_SCHEDULER_ENABLED=true` থাকতে হবে;
- সব credentials/project/key/client mapping ঠিক হতে হবে;
- active job থাকলে সেটি আসল পোস্ট দিতে পারে—queue না দেখে শুধু setup পরীক্ষা করতে dispatch করবেন না।

Workflow-এর `workflow_dispatch` আছে, কিন্তু এই ডেলিভারি কোনো run dispatch করেনি। আগে queue খালি নিশ্চিত করে operator নিজের ইচ্ছায় একবার run করতে পারেন। Queue খালি run-এর summary/heartbeat **শুধু runner execution**, Google account consent বা published article-এর প্রমাণ নয়। এরপর `/jobs`-এ **reviewed Blogger runner**-এর heartbeat দেখুন; পুরোনো OIDC worker heartbeat আলাদা।

Workflow-তে:

- standard `ubuntu-24.04`, Node `24.22.3`, production dependencies only;
- official actions commit SHA-তে pinned;
- `contents: read`, credential persistence off; কোনো `id-token: write` বা repo write permission নেই;
- এক সময়ে এক workflow; আগের run cancel করে remote request মাঝপথে কাটা হয় না;
- bounded ৪ candidate / সর্বোচ্চ ১২ checkpoint; runner নতুন step শুরু বন্ধ করে প্রায় ১৮০ সেকেন্ডে; পুরো job timeout ৫ মিনিট;
- secrets শুধু publishing step-এ; কোনো browser/AI, screenshot, artifact upload বা raw provider object logging নেই;
- bounded run শেষ হলে Firestore gRPC client বন্ধ হয়, যাতে idle client CI process ধরে না রাখে।

পুরোনো `.github/workflows/pincraft-automation.yml` direct Blogger runner নয়। Source-এ সেটিও এখন আলাদা `LEGACY_PINTEREST_API_SCHEDULER_ENABLED=true` ছাড়া skip করে; এই variable **unset/false** রাখুন। নতুন website release-এর default mode legacy generation worker, API queue/enable ও Pinterest posting আটকে দেয়। আগে থেকে GitHub-এ পুরোনো workflow enable থাকলে rollout-এর আগে সেটি disable/পর্যালোচনা করুন—local source edit remote workflow disable হওয়ার প্রমাণ নয়। নতুন scheduler পরীক্ষা করতে পুরোনো historical verification redispatch করবেন না।

## ৭. প্রতিটি article ও manual Pin কীভাবে ব্যবহার করবেন

### Article Writer

1. আগের মতো লেখা generate/open করুন।
2. **Publish to Blogger · prepare your Pin** খুলুন।
3. connected Blogger account এবং verified blog বেছে নিন।
4. HTML preview, article title, Pin title/description/hashtags review করুন। পরিবর্তন করলে review checkbox আবার uncheck হয়।
5. Artwork source:
   - **Downloaded to my device:** নিজের downloaded artwork review/save করুন। চাইলে PNG/JPEG/WebP ফাইল local preview করে **Download PNG for Pinterest** করুন। Conversion browser-এর canvas-এ হয়; কোনো image bytes server/Firestore-এ upload হয় না।
   - **Existing public image host:** নিজের existing HTTPS image URL দিন। নতুন hosting service চাপানো হয়নি।
6. Optional Blogger featured image-এর জন্য নিজের hosted HTTPS URL দিতে পারেন। Local ফাইলকে এই কোড গোপনে Blogger-এ rehost করে না। Blank হলে article text-only হতে পারে।
7. audience timezone এবং blog time/manual Pin target দিন। Pin target blog-এর আগে হতে পারে না। America/New_York-এর 10:00, 12:00, 14:00, 16:00, 20:00, 21:00 শুধু editable suggestions; delivery guarantee নয়। DST-তে না-থাকা বা দুবার-হওয়া local hour প্রত্যাখ্যাত হয়।
8. নির্দিষ্ট কনটেন্টের review/authorization checkbox দিন; **Schedule Blogger post** বা **Publish blog now** বেছে নিন।

User-initiated website requests একই durable checkpoint দিয়ে তাৎক্ষণিক কয়েকটি step চালাতে পারে। বাকি due work ও browser-closed verification Actions runner করে—**যদি সেটি বাস্তবে configured/enabled থাকে**। Schedule অনেক আগে Blogger-এ register হলে due-time publication Blogger করে; URL confirmation/manual task release পরের সফল check-এ হবে।

Network response হারালে একই submission নিরাপদে resume করুন; নতুন request ID দিয়ে অন্ধভাবে আবার চাপবেন না। এই browser-এর submit button uncertain result-এ content edit/new submission আটকে দেয়; reload-এর পরও আগে Jobs পরীক্ষা করুন।

### Jobs → Manual Pin pack

Blogger সত্যিই LIVE/public হলে:

- title, description+hashtags ও real destination URL আলাদা copy controls-এ পাবেন;
- copy-only ZIP download করতে পারবেন;
- নিজের device-এর artwork আবার attach করে **copy + PNG ZIP** পাবেন; file browser-এ থাকে, server-এ নয়;
- public image reference থাকলে নিজের hosted image আলাদা খুলতে পারবেন;
- Pinterest নিজে খুলে sign in, upload, board নির্বাচন এবং available native scheduler ব্যবহার করবেন।

সাইট local image file retain করে না। পরে অন্য device/reload করলে নিজের artwork আবার বেছে নিতে হবে। ZIP/clipboard-এ কোনো provider token, owner credential বা OAuth envelope থাকে না।

চাইলে পরে actual Pinterest URL নিজে লিখে confirmation দিতে পারেন। সেটি **`user_reported_not_verified`**, API-confirmed success নয়। বাইরের manual/third-party Pinterest activity server গুনতে বা নিয়ন্ত্রণ করতে পারে না; পুরোনো API six-Pin ledger-কে manual-account monitoring হিসেবে দেখানো হয় না।

## ৮. State, retry এবং reconnect

| অবস্থা | অর্থ / করণীয় |
| --- | --- |
| `queued` | reviewed job বা পরের saved checkpoint প্রস্তুত |
| `processing` | leased checkpoint চলছে; একই job/connection-এ concurrent mutation blocked |
| `scheduled` | Blogger future schedule গ্রহণ করেছে; এটি LIVE receipt নয় |
| `waiting_live` | admin/public check এখনো যথেষ্ট প্রমাণ দেয়নি |
| `retry` | নিশ্চিতভাবে rejected/read-only temporary error; bounded backoff |
| `failed` | config/auth/permission/attempt-limit সমস্যা; কারণ ঠিক করুন |
| `needs_review` | mutation হয়তো হয়েছে; automatic reinsert/repost বন্ধ |
| `completed` | Blogger LIVE এবং unauthenticated matching page যাচাই হয়েছে |
| `awaiting_manual_time` / `ready_for_manual` | manual reminder/pack; Pinterest auto-execution নয় |
| `manually_marked_done` | owner-এর reported link; API verification নয় |

- সর্বোচ্চ **৩ logical attempt**; draft→publish→verify একটি successful attempt জুড়ে checkpoints হতে পারে। প্রতিবার harmless LIVE poll নতুন attempt নয়। Retry counter reset করে না।
- definite retry-তে সর্বনিম্ন ১০ মিনিট backoff, পরে বাড়ে। HTTP 429 হলে পুরো সেই runner run থামে; early retry দিয়ে rate-limit backoff bypass করা যায় না।
- একটি 401-এ নতুন token নিয়ে একবার retry; আবার ব্যর্থ হলে reconnect প্রয়োজন। Expired/rejected offline grant-এ actionable reconnect দেখানো হয়।
- lease ৮ মিনিট; mutation চলার সময় process মারা গেলে পরের recovery `needs_review` করে—নতুন draft বানায় না।
- `needs_review` হলে Blogger UI-তে দেখুন। Existing post ID নিয়ে **Inspect result → Verify existing post** করুন। Selected blog এবং job-এর নিজস্ব content marker মিলতে হবে। Draft হলে সেই ID publish checkpoint-এ ফিরে যায়; LIVE হলেও public verification বাকি থাকে।
- চাইলে remote inspection-এর পর **Stop after inspection**; এতে remote post delete হয় না, success-ও বানানো হয় না।
- disconnect local token সঙ্গে সঙ্গে মুছে দেয়। ইতিমধ্যে পাঠানো request শেষ হতে পারে। In-flight lock থাকা পর্যন্ত authorization replace করা যায় না; late response encrypted credentials পুনরুদ্ধার করতে পারে না।
- removed/changed blog, paid capacity expiry বা disabled/unverified app user নতুন mutation আটকে দেয়।
- scheduled post ইতিমধ্যে Blogger-এ register হয়ে গেলে শুধু GitHub cron disable/disconnect করলেই **Blogger-এর নিজস্ব schedule cancel হয় না**। বাতিল করতে Blogger UI-তে গিয়ে নিজে unschedule/revert করুন। এই code remote delete/revert endpoint চালায় না।

## ৯. খরচ ও সীমাবদ্ধতা—অবশ্যই পড়ুন

- Firestore free quota: **1 GiB storage, 50,000 reads/day, 20,000 writes/day, 20,000 deletes/day, 10 GiB outbound/month**। Daily quota Pacific midnight-এর আশেপাশে reset হয়। এগুলো পুরো project-এর shared quota; existing generation/Library/OAuth activity-ও ব্যবহার করে। Official: <https://firebase.google.com/docs/firestore/quotas>।
- এখানে paid TTL deletes/backups/PITR/Storage/Functions লাগানো হয়নি। Existing Rules/IAM/indexes/TTL configuration বদলানো হয়নি। New due query একটি single indexed field ব্যবহার করে; production-এ কোনো blanket index redeploy লাগানো হয়নি।
- প্রতি দশ মিনিটে দিনে ১৪৪টি সম্ভাব্য cron invocation। Empty query-ও read charge করতে পারে, heartbeat write হয়; job transactions এবং খোলা browser-এর refresh আরও quota ব্যবহার করে। ছোট workload-এর জন্য bounded runner—unlimited service নয়। Queue বড় হলে দেরি বাড়বে। Quota শেষ হলে Spark-এ কাজ fail/pause করতে পারে; কোড Blaze enable করে না।
- Public repository-র **standard GitHub-hosted runners** free ব্যবহারের নিয়মের মধ্যে পড়ে; private/internal repository included minutes ব্যবহার করে এবং বেশি হলে bill/limit-এর ঝুঁকি আছে। এই workflow private repo-তে **ইচ্ছাকৃত skip** করে। Larger runner নির্বাচন করবেন না। Official: <https://docs.github.com/en/billing/concepts/product-billing/github-actions>।
- GitHub cron **best effort**: high load-এ delay বা drop হতে পারে; default branch-এ workflow থাকতে হয়; public repo-তে দীর্ঘ inactivity-তে scheduled workflows disable হতে পারে। Exact-minute বা always-on guarantee নয়। Official: <https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule>।
- Blogger/Google quota, OAuth app verification, grant revocation এবং existing Vercel account-এর limits আলাদা। এই code কোনো payment card, paid upgrade বা quota increase করে না।
- কোনো Pinterest first-day visibility/traffic/ranking/income guarantee নেই। নিজের content rights ও platform rules মানতে হবে।

## ১০. নিরাপদ local validation

Production env, service-account JSON বা real grants এই commands-এ দেবেন না। Node 24, Java 21+ এবং যথাযথ Chromium local libraries লাগবে। Small-memory machine-এ **build, install, emulator/UI suites একসঙ্গে চালাবেন না**।

```bash
npm ci
npm run test:firebase:setup  # শুধু synthetic demo project env, excluded file, mode 0600

# Terminal 1: local emulators only
JAVA_TOOL_OPTIONS='-Xms64m -Xmx256m -XX:ActiveProcessorCount=2' \
  npm run firebase:emulators

# Terminal 2: isolated server/unit checks
set -a; . .cache/firebase-test.env; set +a
export PINCRAFT_PUBLISHING_MODE=blogger_manual_pin
npm run test:publishing
```

Build আগে emulators stop করলে কম মেমরি লাগে:

```bash
NODE_OPTIONS='--max-old-space-size=768' npm run build
npx playwright install --with-deps chromium  # developer tests only, runner-এ নয়
```

তারপর emulators আবার চালু করে actual Next API/Chromium suite:

```bash
# Terminal 2: explicit synthetic-only HTTP preload; NEVER production server command
set -a; . .cache/firebase-test.env; set +a
export PINCRAFT_PUBLISHING_MODE=blogger_manual_pin
REVIEWED_BLOGGER_HTTP_FIXTURES=1 \
NODE_OPTIONS='--max-old-space-size=384 --import ./scripts/reviewed-blogger-http-fixtures.mjs' \
  npm start -- --hostname 0.0.0.0 --port 3001

# Terminal 3: same synthetic local Firebase env
set -a; . .cache/firebase-test.env; set +a
PINCRAFT_PUBLISHING_MODE=blogger_manual_pin BASE_URL=http://127.0.0.1:3001 \
  npm run test:publishing:ui
```

এই scripts demo project ছাড়া চালাতে অস্বীকার করে। HTTP fixtures শুধুই test-process preload; কোনো API flag দিয়ে activate করা যায় না। এগুলো real Google account consent বা actual post visibility-এর প্রমাণ নয়।

## Activation checklist

- [ ] Google Cloud-এ Blogger API ও exact redirect URI ঠিক আছে।
- [ ] Website ও Actions-এ **একই project, client ও existing encryption key** আছে।
- [ ] Secrets source/git/log-এ নেই; previously exposed Pinterest token কখনো reuse/install করা হয়নি। সেই token-এর revocation পুরোনো provider account settings-এ নিজে নিশ্চিত করুন।
- [ ] নতুন code normal review/deploy হয়েছে; existing site/generation/Library সংরক্ষিত।
- [ ] নিজের genuine Blogger consent এবং owned blog verification হয়েছে।
- [ ] queue দেখে operator জেনে-বুঝে scheduler enable করেছেন; old worker-কে নতুন runner বলা হয়নি।
- [ ] ছোট, owner-approved real article দিয়েই আলাদা live acceptance করবেন; synthetic receipts-কে real success বলবেন না।
- [ ] Pinterest upload/schedule আপনি নিজেই করবেন; any saved Pin link user-reported হিসেবে থাকবে।
