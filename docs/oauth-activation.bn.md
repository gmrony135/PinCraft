# PinCraft: বাকি OAuth অনুমোদন চালুর নির্দিষ্ট চেকলিস্ট

> **Historical / superseded publishing instructions.** Current selected path: Blogger automatic + Pinterest manual, Firestore Spark + direct GitHub Actions runner. Follow [the current বাংলা setup guide](blogger-manual-pinterest-setup.bn.md). Do not activate the Pinterest API, old OIDC workflow or deferred Worker from this document. Historical results below are not evidence that the new runner or real owner publication is live.

এই নথি মালিকের জন্য। Vercel access দিয়ে Pinterest/Google developer portal-এর মালিকানা, developer terms গ্রহণ, app review বা ব্যক্তিগত consent দেওয়া যায় না। এখানে কোনো credentials বানিয়ে বসানো হয়নি। অ্যাপের callback, encrypted token storage, owner verification, reconnect, publishing controls এবং no-paid-upgrade scheduler-এর server configuration প্রস্তুত করা হয়েছে।

## ১. ইতিমধ্যে যা সেটআপ/যাচাই হয়েছে

- আলাদা URL: Home, Pin Generator, Article Writer, **Content Studio**, Connector, Automation, Dashboard, My Library ও Subscription।
- Email/Password signup/login/verification/reset এবং Google—শুধু Google দিয়ে প্রতিস্থাপন নয়। স্থানীয় real Firebase SDK/emulator-এ account flow পরীক্ষা করা হয়েছে। Read-only production config-এ Email/Password/Google enabled, signup allowed এবং `pincraftly.vercel.app` authorized পাওয়া গেছে; **এটি বাস্তব inbox delivery বা আপনার production login-এর প্রমাণ নয়**।
- আগের ১৬টি Production variable অক্ষত। GitHub workload scheduler-এর ৩টি non-secret Production setting connected Vercel দিয়ে যোগ করে নতুন **READY/PROMOTED production deployment-এ চালু করা হয়েছে**। এগুলি আবার বসাতে হবে না।
- Live সাইট **https://pincraftly.vercel.app**। নতুন application source `1c7af7d`; **৩৪২/৩৪২ local** এবং **২১/২১ public production** পরীক্ষা পাস করেছে। Local full-pipeline পরীক্ষায় external OAuth/AI/publication/wallet response স্পষ্ট test double—প্রকৃত public post নয়।
- [বাস্তব GitHub OIDC worker run](https://github.com/gmrony135/PinCraft/actions/runs/43561574146) সফল; Production database-এ একই execution ID ও `ok` finished heartbeat স্বাধীনভাবে পড়া হয়েছে। পরীক্ষার আগে কোনো enabled schedule/connected Pinterest authorization ছিল না; বাস্তব post হয়নি। এটি manual workload dispatch-এর প্রমাণ, ভবিষ্যৎ cron exact সময়ে চলার গ্যারান্টি নয়।
- Live Email/Password form-এর বাস্তব Firebase SDK-তে reserved `.invalid` address দিয়ে একটি প্রত্যাশিত ব্যর্থ-login পরীক্ষা হয়েছে: সঠিক credential error, কোনো fake session বা PinCraft-এ password storage নয়। এটি সফল ব্যক্তিগত signup/login বা inbox delivery-এর বিকল্প নয়।
- অনুমোদিত index setup আগেই READY; আবার deploy করা হয়নি। Production Firestore Rules read-only পরীক্ষা করা হয়েছে; পরিবর্তন করা হয়নি।
- সর্বোচ্চ ৬ Pin/account/day-এর global server cap; uncertain request, concurrent worker, reconnect ও legacy setting দিয়েও cap বাড়ানো যায় না।
- সাইটের `/privacy` ও `/terms` public policy পেজ; প্রকৃত মালিক/ব্যবসার তথ্য এবং প্রয়োজনীয় আইনগত policy নিজে যাচাই করে নিন। Google/Pinterest এই policy গ্রহণ করেছে বলে দাবি করা হচ্ছে না।
- ৯৯৳ / ৩০ দিন / মোট ২ Pinterest + ২ Blogger plan নিশ্চিত। Reviewer আপনি পরে দেবেন বলেছেন, তাই **টাকা পাঠানোর নির্দেশনা, reference submission ও activation বন্ধ**।

## ২. Pinterest: একবার মালিকের developer portal কাজ প্রয়োজন

খুলুন: **https://developers.pinterest.com/apps/**

1. যে verified-email business account দিয়ে অ্যাপ পরিচালনা করবেন, সেটিতে নিজে login করুন এবং প্রয়োজনীয় developer terms পড়ুন/গ্রহণ করুন। Password/session cookie আমাকে দেবেন না।
2. **Connect app**: নাম `PinCraft`; ওয়েবসাইট `https://pincraftly.vercel.app`। Trial access-এর আবেদন Pinterest নিজে review করে। কোনো নির্দিষ্ট approval date নিশ্চিত নয়।
3. Privacy policy: `https://pincraftly.vercel.app/privacy`; terms: `https://pincraftly.vercel.app/terms`। যোগাযোগ/মালিকের পরিচয়ের প্রয়োজনীয় তথ্য নিজের নামে সঠিকভাবে দিন—অনুমান করা কোনো email/business identity নয়।
4. Exact Redirect URI (extra slash নয়):

   ```text
   https://pincraftly.vercel.app/api/integrations/pinterest/callback
   ```

5. Official create-Pin contract ও identity/verification-এর প্রয়োজনীয় scopes:

   ```text
   pins:read,pins:write,boards:read,boards:write,user_accounts:read
   ```

   PinCraft board তৈরি করার UI দেয় না; তা সত্ত্বেও official v5 create-Pin permission contract-এ `boards:write` অন্তর্ভুক্ত আছে। Ads, billing, secret-board বা unrelated permissions চাওয়া হচ্ছে না।
6. অনুমোদিত App ID/secret পাওয়া গেলে **Vercel → PinCraft → Settings → Environment Variables**, Production-এ `PINTEREST_CLIENT_ID` এবং sensitive `PINTEREST_CLIENT_SECRET` যোগ করুন। এগুলি secure attachment/approved secret channel-এ সরবরাহ করলে connected Vercel দিয়ে আমি install করতে পারি; secret সাধারণ chat message, GitHub issue বা code-এ দেবেন না।
7. **Trial-এর Pin অন্যদের কাছে public নয়।** Production public posting-এর জন্য Pinterest-এর Standard access প্রয়োজন। তার জন্য actual OAuth flow ও API integration দেখানো নিজের live screen recording জমা দিতে হয়। আমাদের emulator/double video দিয়ে genuine integration বলে জমা দেওয়া যাবে না।
8. সত্যিকারের Standard approval পাওয়ার **পরেই** server variable `PINTEREST_ACCESS_TIER=standard` দিন এবং redeploy করুন। তার আগে account consent পরীক্ষা করা গেলেও unattended public posting locked থাকবে। এটি approval কেনার বা Firebase/Vercel paid upgrade-এর নির্দেশনা নয়।

App description-এর খসড়া (সত্যতার সঙ্গে মিলিয়ে ব্যবহার করুন):

> PinCraft helps a signed-in creator authorize an account they own, select an owned public Pinterest board and an administrator-owned Blogger website, choose content categories and a daily quantity, then explicitly enable scheduled publication. It publishes new original content, links each Pin to the creator's related article, enforces a hard maximum of six Pins per account per day, and provides pause/disconnect and confirmed publication history. It does not collect Pinterest passwords or session cookies and does not request advertising or wallet access.

Pinterest নতুন app-এর non-business data access-এ আলাদা সীমাবদ্ধতা প্রয়োগ করতে পারে। Access/board restrictions-এ error এলে reconnect/review প্রয়োজন; “connected” মানে সব ধরনের account ব্যবহার নিশ্চয়তা নয়।

## ৩. Blogger: Google Cloud-এ Web OAuth app

Project: **`pincraft-ly`**; নতুন paid project বা billing upgrade দরকার হলে থামুন।

1. API Library → **Blogger API v3** enable/verify করুন:
   https://console.cloud.google.com/apis/library/blogger.googleapis.com?project=pincraft-ly
2. Google Auth Platform-এর Branding/Audience/Data Access সেটআপে প্রকৃত app name, owner-controlled support/developer email এবং privacy/terms URL দিন। Firebase Google sign-in-এর client/consent মানেই Blogger publish permission নয়।
3. প্রয়োজনীয় Blogger scope:

   ```text
   https://www.googleapis.com/auth/blogger
   ```

4. Credentials → **OAuth client ID → Web application**:
   https://console.cloud.google.com/apis/credentials?project=pincraft-ly

   Authorized redirect URI:

   ```text
   https://pincraftly.vercel.app/api/integrations/blogger/callback
   ```

   যদি JavaScript origin field পূরণ করেন: `https://pincraftly.vercel.app`। Callback-এর জায়গায় Firebase `__/auth/handler` দেবেন না; সেটি ভিন্ন login integration।
5. Client ID ও secret Vercel Production-এ `BLOGGER_CLIENT_ID`, sensitive `BLOGGER_CLIENT_SECRET` হিসেবে দিন/secure attachment দিন। Google key file থেকে `client_id` খুঁজে Firebase Admin service-account client ID বসাবেন না—সেটি Web OAuth client নয়।
6. External **Testing** audience-এ নিজের account-কে test user করতে হতে পারে। Blogger scope-সহ Testing refresh token সাধারণত সাত দিনে শেষ হয়; “একবার consent, চিরকাল চলবে” নয়। অন্য বাস্তব users-এর production use-এর আগে Google-এর audience/publishing/verification এবং domain-ownership requirements পূরণ করুন। `vercel.app` shared hosting domain-এ নিজস্ব domain ownership প্রমাণ করা না গেলে owner-controlled custom domain প্রয়োজন হতে পারে—নতুন domain কেনা বা পরিবর্তনের অনুমোদন এখানে অনুমান করা হয়নি।

## ৪. Credentials বসার পরে সাইটে একবার নিজের consent

1. Redeploy শেষে canonical website-এ verified account দিয়ে sign in করুন।
2. **Connector → Connect Pinterest**, তারপর **Connect Blogger**। Official Pinterest/Google consent page নিজে Allow করুন। ব্যক্তিগত publishing token আমাকে পাঠানোর প্রয়োজন নেই।
3. Blogger-এর **Load my blogs → Verify & add website**। Google account-টির selected blog-এ administrator permission থাকতে হবে।
4. **Automation → New automation**: নিজের board, website, প্রয়োজনীয় categories, English/বাংলা, দৈনিক ১–৬ এবং timezone/slots নির্বাচন করুন। Save করলে paused থাকবে।
5. নিজের publishing permission ও app access প্রস্তুত হলে **Start automation → explicit consent**। Dashboard-এ actual last background check দেখুন; saved schedule বা “configured” flag দিয়ে real publishing প্রমাণ হয় না।
6. আপনার অনুমতি ছাড়া আমি কোনো প্রকৃত test post publish করিনি/করব না। প্রথম genuine operation হলে তার actual Blogger/Pin URL এবং আপনার consent-সহ আলাদাভাবে যাচাই করতে হবে।

## ৫. Scheduler: paid Firebase upgrade নয়

Repository-তে `.github/workflows/pincraft-automation.yml` **active**, Production-এর scheduler settings-ও deployed। একটি বাস্তব manual OIDC delivery এবং matched database heartbeat যাচাই হয়েছে; natural cron-triggered delivery এখনো আলাদাভাবে পর্যবেক্ষণ করা হয়নি। Repository public থাকলে public-hosted Actions থেকে স্বল্পমেয়াদি signed OIDC identity দিয়ে existing Vercel worker-এ best-effort ৩০ মিনিট পরপর call হয়। Browser বন্ধ থাকলেও এটি আলাদা server কাজ। কোনো long-lived GitHub/provider secret লাগে না। Repository private করলে free allowance/permissions নতুন করে যাচাই না করে চালু করবেন না। Native Firebase Functions/Scheduler deploy করা হয়নি।

## ৬. Billing reviewer পরে

আপনি যে **verified PinCraft account**-কে independently receiving bKash/Nagad wallet পরীক্ষা করতে দিতে চান, তার email/UID পরে নির্দিষ্ট করুন। Vercel/GitHub-এর owner দেখে আমি কাউকে approver বানাইনি। Reviewer configure এবং owner-এর deliberate enablement ছাড়া payment নির্দেশনা/collection চলবে না। PIN/OTP/password কখনো প্রয়োজন নেই।

## Official references

- Pinterest app registration: https://developers.pinterest.com/docs/getting-started/connect-app/
- Pinterest access tiers ও Standard demo: https://developers.pinterest.com/docs/key-concepts/access-tiers/
- Official v5 scopes/schema: https://raw.githubusercontent.com/pinterest/api-description/main/v5/openapi.yaml
- Blogger authorization: https://developers.google.com/blogger/docs/3.0/using#auth
- Google Web OAuth: https://developers.google.com/identity/protocols/oauth2/web-server
- Google refresh-token expiry: https://developers.google.com/identity/protocols/oauth2#expiration

এই নথি setup instructions—app approval, live consent, genuine email delivery বা successful public publication-এর receipt নয়।
