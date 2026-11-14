# Website connected, কিন্তু post যাচ্ছে না: publishing-entry fix

## Live diagnosis ও সীমা

Production read-only preflight-এ একটি connected Blogger authorization ও একটি verified owned website ছিল। কিন্তু `publish_jobs` ছিল **০টি**; owner-এর Cloud Library-তেও saved article draft পাওয়া যায়নি। Log-এ website verification দেখা গেছে, article submission/publication নয়। তাই কোনো article LIVE হয়েছে বলা হয়নি এবং demo article বসানো হয়নি।

Reviewed GitHub Actions gate আগে থেকেই enabled; actual run [43581615296](https://github.com/gmrony135/PinCraft/actions/runs/43581615296) সফল এবং production heartbeat মিলে গেছে। ঐ run-এর due/processed/failed সব ০ ছিল। ফলে এটি runner execution/Firestore access-এর evidence, owner-specific Google refresh বা article publication-এর নয়। পুরোনো Pinterest API workflow disabled আছে; সেটি চালু করা হয়নি।

## কী ঠিক করা হয়েছে

- সরাসরি **`/publish`**: নিজের existing title ও সম্পূর্ণ article paste করুন, অথবা নিজের Cloud Library article load করুন। কোনো AI regeneration, default sample বা automatic substitution নেই।
- Connector-এর verified website-এ **Publish article**; Cloud Library-তে **Review & publish**; saved article reader-এও একই reviewed composer আছে।
- একটিমাত্র connected, ready owned blog থাকলে account/blog নিজে থেকে নির্বাচিত হয়। একাধিক destination-এ explicit নির্বাচন প্রয়োজন। URL-এর `website`/`draft` কেবল hint; বর্তমান session owner-এর fetched records দিয়ে মিলতে হবে।
- Publish disabled থাকলে স্পষ্ট checklist: server setup, connected account, verified website, exact article HTML/title, Pin copy, artwork ও final authorization—কোনটি বাকি দেখায়। Reconnected/stale website auto-select হয় না; re-verification নির্দেশ দেয়।
- বাংলা/Indic hashtag-এর combining vowel signs আগে strict `letters/numbers` regex-এ বাদ পড়তে পারত। এখন client ও server একই rule ব্যবহার করে: letter/number/underscore দিয়ে শুরু, পরে combining marks অনুমোদিত। `#বাংলা`, `#রেসিপি`, decomposed accented letters বৈধ। Mark-only tag, hyphen, zero-width/control/markup এখনো প্রত্যাখ্যাত। **Owner-এর অনুপস্থিত submission ঠিক এই error-এ আটকে ছিল—এমন প্রমাণ পাওয়া যায়নি; এটি আলাদাভাবে reproduced validation bug।**
- Client ও server একই strict 50–100,000-byte balanced article-HTML validator ব্যবহার করে। Plain text/Markdown escaped হয়ে preview হয়; pasted scripts execute হয় না।
- Save সফল হলে actual **Job ID** দেখায়। তার status/error/remote ID ধরে Jobs-এ অনুসরণ করতে হবে। Ambiguous response-এ নতুন job বানিয়ে duplicate publication নয়।

## ব্যবহার

1. `https://pincraftly.vercel.app/publish` খুলুন। আগে Jobs-এ একই article-এর saved job আছে কি না দেখুন।
2. নিজের আসল title ও সম্পূর্ণ article paste করে **Review this article** চাপুন; অথবা নিজের saved article খুলুন। এটি review খোলে, publishing job বানায় না।
3. নির্বাচিত blog, exact HTML preview, Pin title/description/hashtags এবং নিজের downloaded artwork review করুন। Artwork নিজের device-এ saved/reviewed হলে সেই checkbox দিন; মিথ্যা confirmation দেবেন না।
4. Final Blogger authorization checkbox দিন। **Publish blog now** বা নিজের সময় দিয়ে **Schedule Blogger post** চাপুন।
5. **Job ID** পাওয়া নিশ্চিত করুন; Jobs-এ actual status দেখুন। `scheduled` মানে Blogger schedule গ্রহণ করেছে, LIVE নয়। ADMIN LIVE ও unauthenticated public-page match-এর পর actual article URL/manual Pin pack প্রকাশ পায়।
6. Pinterest-এ নিজে upload/board/native scheduling করবেন। Pinterest API বা automatic Pin publication যোগ হয়নি।

## এই fix-এর স্থানীয় যাচাই

সব provider/OAuth/public-page receipt এখানে **স্পষ্ট isolated test doubles**; production article নয়।

| যাচাই | ফল |
| --- | --- |
| Pure publishing-entry/Unicode/owner-destination/HTML checks | 12/12 |
| Guarded Auth + Firestore publishing backend | 50/50 |
| Production-build Next APIs + Chromium | 37/37 |
| Retained workspace/capacity/billing/backend regressions | 55/55 |
| Managed-user/session/auth regressions | 39/39 |
| Production Next build | PASS |

Browser checks include actual form review, explicit authorization, immutable job ID, draft→publish→public-verification checkpoints, future `publishDate`, uncertain-receipt duplicate protection, local PNG/ZIP export, wrong-owner Library URL isolation, no provider-token leakage, and 320/390/768/1440px containment. Legacy-regression tests run only in the explicitly isolated test process; production stays `blogger_manual_pin`.

## এখনো real acceptance কীভাবে হবে

Owner-এর নির্দিষ্ট genuine article submission production Firestore-এ থাকতে হবে। তারপর সেই job-এর saved post ID, Blogger LIVE status, public HTTPS article, আর matching manual Pin destination/copy যাচাই করতে হবে। এই fix-এর tests নিজেরা production consent, posts, secrets, billing, Rules বা IAM mutate করে না; workflow redispatch-ও করে না। Current production deployment/acceptance evidence আলাদাভাবে rollout receipt-এ রাখা হয়।
