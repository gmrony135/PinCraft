# 🚀 PinCraft — Live Setup

## 🔗 লিংক

| কী | লিংক |
|---|---|
| **GitHub রিপো** | **https://github.com/gmrony135/PinCraft** |
| **Live website** | **https://pincraft-gmrony135-9877s-projects.vercel.app** |
| Vercel প্রজেক্ট | https://vercel.com/gmrony135-9877s-projects/pincraft |
| Deployment Protection সেটিংস | https://vercel.com/gmrony135-9877s-projects/pincraft/settings/deployment-protection |

---

## ✅ সব সেটআপ সম্পন্ন ও টেস্টেড

| কাজ | স্ট্যাটাস |
|---|---|
| GitHub রিপো + কোড | ✅ [gmrony135/PinCraft](https://github.com/gmrony135/PinCraft) |
| GitHub → Vercel লিংক | ✅ `repo: PinCraft`, `productionBranch: main` |
| **Auto-push** (commit → GitHub) | ✅ `.git/hooks/post-commit` ইনস্টল + টেস্টেড |
| **Auto-deploy** (GitHub → Vercel) | ✅ টেস্ট push দিয়ে যাচাই করা — deployment `READY`, production-এ promoted |
| Live URL | ✅ HTTP 200 |

### 🧪 লাইভ টেস্টের প্রমাণ

খালি একটা commit (`ci: trigger vercel auto-deploy test`) push করা হয়েছিল।
Vercel নিজেই সেটা ধরে নিয়ে ডিপ্লয় করেছে — কোনো ম্যানুয়াল কাজ ছাড়া:

```
commit 9183e0b (main)  →  Vercel auto-build  →  READY (~1.5s)  →  production alias assigned
```

Vercel-এর নিজের event log: *"You deployed pincraft from gmrony135/PinCraft
(9183e0b in main) to production"*

---

## ⚠️ ১টা ছোট কাজ বাকি — Deployment Protection বন্ধ করা

লাইভ লিংক খুললে এখন **"Login – Vercel"** পেজ দেখাচ্ছে (HTTP 200 কিন্তু পেজটা
Vercel-এর লগইন স্ক্রিন)। কারণ প্রজেক্টে **Vercel Authentication** চালু আছে
(`all_except_custom_domains`) — এটা ডিফল্টে চালু থাকে।

### সমাধান (৩০ সেকেন্ড)

1. যাও → **https://vercel.com/gmrony135-9877s-projects/pincraft/settings/deployment-protection**
2. **Vercel Authentication** সেকশনে যাও
3. ড্রপডাউন থেকে **`Only Preview Deployments`** সিলেক্ট করো
   (অথবা **`Disabled`** — সবাই সাইট দেখতে পারবে)
4. **Save** ক্লিক করো

এরপর `https://pincraft-gmrony135-9877s-projects.vercel.app` সবার জন্য খুলবে।

> 💡 Vercel API/connector দিয়ে এই সেটিংটা বদলানো যায় না — এটা Vercel
> ড্যাশবোর্ড থেকেই করতে হয়। তাই এই এক ক্লিকটা তোমার লাগবে।

---

## 🔄 এখন থেকে ওয়ার্কফ্লো

```
আমি কোড বদলাই
      ↓
git commit  (post-commit hook অটো চালায়)
      ↓
GitHub main-এ push  (অটো)
      ↓
Vercel webhook  (GitHub App, অটো)
      ↓
~৩০ সেকেন্ডে live site আপডেট  (অটো)
```

আমাকে আলাদা করে কিছু বলতে হবে না — কোড বদলালেই চেইনটা নিজে চলবে।

---

## 📁 প্রজেক্ট ফাইল

```
index.html              → মূল পেজ (Vercel এটাই serve করে)
vercel.json             → clean URLs + security headers
.gitignore              → .env, node_modules, credentials ব্লক
scripts/auto-push.sh    → ম্যানুয়াল commit+push
scripts/post-commit     → auto-push hook (ইনস্টলড)
GITHUB_VERCEL_SETUP.md  → এই ফাইল
```

---

## 🔒 নিরাপত্তা

- রিপোতে কোনো টোকেন/credential নেই (যাচাই করা)
- প্রথম commit-এ ভুলে ঢোকা `.git-credentials` GitHub Push Protection ব্লক করেছে,
  এরপর হিস্ট্রি পরিষ্কার করা হয়েছে
- ⚠️ **টোকেনটা চ্যাটে শেয়ার হয়েছে** → কাজ শেষ হলে revoke করে নতুন বানাও:
  GitHub → Settings → Developer settings → Tokens (classic) → Delete

---
*আপডেট: 2026-11-13*
