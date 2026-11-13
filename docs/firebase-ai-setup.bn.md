# PinCraft: নিরাপদ Firebase + AI সেটআপ

এই গাইডটি `pincraft-ly` → `https://pincraftly.vercel.app`-এর জন্য। **কোনো paid plan, Blaze upgrade, Cloud Function বা Scheduler এই কাজের অংশ হিসেবে চালু করা হয়নি।**

## কী প্রস্তুত, আর কী বাকি

প্রস্তুত কোড: Email/Password signup ও login, verification email, password reset, Continue with Google, private server session, Gemini → Groq text fallback, Cloudflare FLUX artwork এবং AI Studio।

Live login/AI চালু হওয়ার আগে **আপনার Firebase Console ও Vercel secure settings-এর কাজ বাকি**। Public Firebase configuration কোনো Admin authorization নয়। Server-side credentials উপস্থিত থাকাও প্রকৃত login, Firestore permissions বা quota যাচাই হওয়ার প্রমাণ নয়।

## ১. Firebase-এ দুই ধরনের sign-in চালু করুন

1. [Firebase Authentication → Sign-in method](https://console.firebase.google.com/project/pincraft-ly/authentication/providers) খুলুন।
2. **Email/Password** enable করুন। Email-link/passwordless আলাদা বিষয়; এই অ্যাপের জন্য প্রয়োজন নেই। Firebase password policy-তে অন্তত ৮ অক্ষর, সম্ভব হলে ১২+ অক্ষর নির্ধারণ করুন।
3. **Google** enable করুন; প্রয়োজনীয় support email আপনার নিজের account থেকে নির্বাচন করুন।
4. Authentication → Settings → Authorized domains-এ **`pincraftly.vercel.app`** যোগ করুন। কেবল নিজের ব্যবহৃত অতিরিক্ত domain-ও যোগ করতে পারেন; wildcard নয়।
5. Templates-এ verification এবং password-reset email পরীক্ষা করুন। অ্যাপ signup-এর পর verification চায়; verify না করা email দিয়ে PinCraft session তৈরি হবে না।

ব্যবহারকারীর password Firebase SDK থেকে সরাসরি Firebase Authentication-এ যায়। PinCraft-এর server password গ্রহণ বা সংরক্ষণ করে না। App session-এ শুধু UID/display name থাকে; Firebase নিজে email/account data পরিচালনা করে।

## ২. Private Firestore আগে সুরক্ষিত করুন

বিদ্যমান default Firestore database ব্যবহার করুন। না থাকলে Console-এ উপযুক্ত free quota/অবস্থান বিবেচনা করে তৈরি করুন; billing upgrade চাইলে এখানে থামুন।

Repository-র **`firestore.rules`** সব browser read/write নিষিদ্ধ করে; অ্যাপের owner-scoped server API-ই data access করে। Rules publish না করে production-এ ব্যক্তিগত drafts/AI receipts/OAuth grants লেখা শুরু করবেন না।

আপনার নিজের Firebase CLI login করা কম্পিউটার থেকে:

```bash
firebase deploy --only firestore:rules,firestore:indexes --project pincraft-ly
```

এটি Functions deploy করার command নয়। `firestore.indexes.json`-এর owner/queue indexes-ও প্রয়োজন। Console-এ কোনো পুরোনো “test mode / allow all” rule রেখে দেবেন না।

## ৩. Vercel-এ পরিবেশের মান নিরাপদে import করুন

[Vercel → PinCraft → Environment Variables](https://vercel.com/gmrony135-9877s-projects/pincraft/settings/environment-variables) খুলুন।

Workspace-এর **`.env.vercel-import`** ফাইলটি private import-এর জন্য প্রস্তুত করা হয়েছে:

- আপনার সরবরাহ করা Firebase public identifiers এবং তিন AI provider-এর credentials রয়েছে।
- Session signing ও encrypted vault-এর নতুন random secrets একবার তৈরি করা হয়েছে। বিদ্যমান ফাইল পুনরায় চালিয়ে overwrite করা হয় না।
- কোনো demo/emulator configuration নেই।
- **Firebase Admin private key/email ইচ্ছাকৃতভাবে রাখা হয়নি।**

ফাইলটি নিজের ডিভাইসে download করে Vercel-এর `.env` import ব্যবহার করুন; **Production** scope নির্বাচন করুন। Server secrets-এ Sensitive/encrypted option ব্যবহার করুন। এই ফাইল chat, GitHub বা screenshot-এ দেবেন না এবং কোনো public folder-এ রাখবেন না। Import শেষে downloaded copy নিরাপদে সরান। Session/vault secret পুনরায় তৈরি করবেন না—vault-এর key বদলালে পুরোনো encrypted publishing grants আর খোলা যাবে না।

### Firebase Admin: শুধু secure settings-এ যোগ করুন

[Project service accounts](https://console.firebase.google.com/project/pincraft-ly/settings/serviceaccounts/adminsdk) / Google Cloud IAM থেকে আপনার অনুমোদিত server service account ব্যবহার করুন। Least-privilege identity সুপারিশ করা হচ্ছে: Auth user lookup-এর জন্য **Firebase Authentication Viewer**, Firestore CRUD-এর জন্য **Cloud Datastore User**; প্রয়োজন ছাড়া Project Owner/Editor দেবেন না।

নিজের কম্পিউটারে থাকা service-account JSON থেকে কেবল এই দুটি Vercel variable যোগ করুন:

| Vercel variable | JSON field |
|---|---|
| `FIREBASE_ADMIN_CLIENT_EMAIL` | `client_email` |
| `FIREBASE_ADMIN_PRIVATE_KEY` | সম্পূর্ণ `private_key` PEM |

Private key-তে actual line breaks অথবা literal `\n` দুটিই সমর্থিত। Vercel value-এর বাইরে অতিরিক্ত quotation mark যোগ করবেন না। **JSON/private key/chat-এ পাঠাবেন না।** Private service-account key অনুমোদিতভাবেই তৈরি করুন, account owner না হলে নতুন key তৈরি করবেন না।

Save করার পর Vercel-এ সর্বশেষ deployment **Redeploy** করুন—পুরোনো deployment নতুন env নিজে থেকে পায় না।

### কোন variable কোথায়

Public identifiers:

- `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_APP_ID`
- `APP_URL=https://pincraftly.vercel.app`

Server-only secrets, কখনো `NEXT_PUBLIC_*` নয়:

- `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`
- `AUTH_SESSION_SECRET`, `AUTOMATION_ENCRYPTION_KEY`
- `GEMINI_API_KEY`, `GROQ_API_KEY`
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`

Text model defaults:

- Gemini: `gemini-3.1-flash-lite`
- Groq: `openai/gpt-oss-120b` → `openai/gpt-oss-20b`

Model listing-এ দেখা গেলেও পুরোনো Gemini 2.5 Flash-এর ছোট inference পরীক্ষা 404 দিয়েছিল; সে কারণে tested model-কে default করা হয়েছে। Model availability/quota পরে বদলাতে পারে। Operator প্রয়োজনে `GEMINI_MODEL`, `GROQ_MODEL`, `GROQ_FALLBACK_MODEL` বদলাতে পারবেন। Browser থেকে arbitrary model/provider পাঠানো যায় না।

## ৪. নিজের account দিয়ে যাচাই করুন

1. `/api/health`-এ `bootstrap: ready` দেখুন। `authentication: configured` কেবল configuration উপস্থিত থাকার তথ্য, genuine login-এর প্রমাণ নয়।
2. `/login` → Create account → নিজের email/password → verification link → Sign in। Password reset-ও পরীক্ষা করুন।
3. Sign out করে **Continue with Google**-এ নিজের consent দিন। Agent কোনো genuine Google consent প্রদান করেনি।
4. `/ai-studio`-তে ছোট একটি keyword request এবং একটি artwork request চালান। Result-এর পাশে প্রকৃত provider/model থাকবে।
5. `/pin-generator` ও `/article-writer`-এ **Live AI + fallback** নির্বাচন করুন। Guest-এর **Offline template** আলাদা engine; সেটিকে live AI বলা হয় না।
6. Save → My Library-তে শুধু নিজের cloud draft দেখুন। Saving/AI generation কোনো Pinterest/Blog post publish করে না।

`/api/ai/status`-এর “configured” flags-ও connectivity/quota test নয়। Admin IAM, Firestore indexes বা provider quota ভুল হলে সাইট error দেখাবে, সফল হওয়ার ভান করবে না।

## AI সুবিধা ও সীমা

- Pin: পাঁচ title, description, hashtags, keyword suggestions ও image prompt।
- Article: সম্পূর্ণ 500–850 word draft, headings/list/keywords ও একটি ব্যাখ্যাসহ editorial SEO checklist।
- Studio: grouped keywords/hashtags, সাত দিনের content plan, editorial quality review এবং Pin/featured artwork।
- Text: সর্বোচ্চ তিন provider/model attempt; Gemini → Groq → alternate Groq model।
- Image: FLUX.1 schnell → FLUX.2 klein 4B; সর্বোচ্চ দুই attempt। REST FLUX.2-এ multipart ব্যবহার হয়।
- Safety refusal অন্য provider/model দিয়ে bypass করা হয় না।
- Cloudflare-wide outage/account quota exhaustion হলে model fallback-ও ব্যর্থ হতে পারে। “কখনো বন্ধ হবে না” এমন নিশ্চয়তা নেই।
- কোনো API key, provider error body বা private key browser-এ ফেরত দেওয়া হয় না।
- Image result সত্যিকারের WebP: Pin `1000×1500`, featured `1200×630`। **Download করতে হবে**; image bytes cloud Library/Firestore-এ সংরক্ষণ বা public hosting করা হয় না। Pin lettering চাইলে design editor-এ যোগ করুন।
- Keywords measured search-volume data নয়; quality score factual/plagiarism verification বা ranking guarantee নয়। Content plan নিজে থেকে schedule বা publish করে না।

### ব্যবহারের খরচ নিয়ন্ত্রণ

Default app caps: প্রতি verified account / UTC দিনে **৩০ text request, ৫ image request**; পুরো website-এ **১৫০ text, ২০ image request**। Failed requests-ও গণনা হয়। এক request-এর মধ্যে bounded fallback attempts থাকতে পারে। Provider quota ও monetary billing আলাদা; এগুলি free/unlimited ব্যবহারের প্রতিশ্রুতি নয়।

Server-side Firestore transactions caps, concurrency ও request-key idempotency enforce করে। Firestore unavailable হলে fail closed—provider call শুরু হয় না। Request cap বদলানোর optional variables `.env.example`-এ আছে।

Private text results স্বল্পমেয়াদি idempotency receipt হিসেবে থাকে; image bytes/prompt সংরক্ষিত হয় না। `expires_at` logical result-cache lifetime ২৪ ঘণ্টা; **Firestore TTL deletion স্বয়ংক্রিয়ভাবে enable করা হয়নি**। TTL/billing অনুমোদন বা operator cleanup ছাড়া receipt documents নিজে থেকে মুছে গেছে বলে ধরে নেবেন না।

## Native scheduled publishing এখনো আলাদা, বন্ধ সেটআপ

Browser বন্ধ থাকলেও কাজ করার Functions/Scheduler implementation repository-তে আছে, কিন্তু **production deployment, IAM, real account consent ও heartbeat যাচাই বাকি**। Cloud Functions/Scheduler-এর জন্য billing upgrade চাইলে আপনার নতুন অনুমতি ছাড়া এগোবেন না।

পরবর্তীতে অনুমোদিত deploy-এ native worker-এর Secret Manager bindings পাঁচটি:

`AUTOMATION_ENCRYPTION_KEY`, `PINTEREST_CLIENT_SECRET`, `BLOGGER_CLIENT_SECRET`, `GEMINI_API_KEY`, `GROQ_API_KEY`।

Website-এর vault key-ই Functions-এ ব্যবহার করতে হবে। Pinterest ও Blogger-এর নিজস্ব OAuth app/consent/destination selection-ও প্রয়োজন। Worker বর্তমানে public server-rendered Pin image ব্যবহার করে; download-only AI Studio artwork স্বয়ংক্রিয়ভাবে worker image হয়ে যায় না। অনিশ্চিত remote publication হলে review ছাড়া repost করা হয় না।

## আগে প্রকাশ করা keys rotate করুন

Chat-এ দেওয়া API keys নতুন করে rotate করা সুপারিশ করা হচ্ছে। Gemini/Groq/Cloudflare console-এ নতুন restricted key তৈরি করে Vercel (এবং ভবিষ্যতে অনুমোদিত Functions)-এর secure settings আপডেট করুন; তারপর পুরোনো key revoke করুন। এই কাজ করা হয়েছে বলে দাবি করা হচ্ছে না। Firebase web API key public identifier—Admin/service credentials থেকে এটি আলাদা।
