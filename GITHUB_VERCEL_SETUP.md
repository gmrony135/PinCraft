# 🚀 PinCraft — GitHub + Vercel Auto-Deploy

## 📌 লিংক

| | |
|---|---|
| **GitHub রিপো** | **https://github.com/gmrony135/PinCraft** |
| Vercel প্রজেক্ট | https://vercel.com/gmrony135-9877/pincraft |
| Vercel Git সেটিংস | https://vercel.com/gmrony135-9877/pincraft/settings/git |

---

## ✅ যা যা হয়ে গেছে

| কাজ | স্ট্যাটাস |
|---|---|
| Git রিপো (`main`) | ✅ |
| GitHub-এ কোড পুশ | ✅ ৩টি ফাইল-সেট, শেষ commit `main`-এ লাইভ |
| **Auto-push hook** (`.git/hooks/post-commit`) | ✅ commit হলেই নিজে থেকে GitHub-এ push হয় |
| Vercel প্রজেক্ট `pincraft` | ✅ তৈরি |
| Vercel অ্যাকাউন্ট কানেক্ট | ✅ `gmrony135-9877` (Hobby) |

---

## ⚠️ বাকি ১টা ধাপ — Vercel-এ GitHub কানেক্ট (তোমাকে করতে হবে)

Vercel API দিয়ে রিপো লিংক করার চেষ্টা করেছিলাম, কিন্তু Vercel বলল:

> *"Failed to link gmrony135/PinCraft. You need to add a Login Connection to your GitHub account first."*

Login Connection = Vercel-এ তোমার GitHub অ্যাকাউন্ট দিয়ে OAuth লগইন। এটা শুধু
ব্রাউজার থেকে করা যায়, API দিয়ে করা যায় না। **২ মিনিটের কাজ:**

### ধাপ ১ — রিপো কানেক্ট করো

1. এই লিংকে যাও → **https://vercel.com/gmrony135-9877/pincraft/settings/git**
2. **Connect Git Repository** বাটনে ক্লিক করো
3. **GitHub** → **Authorize Vercel** / **Login with GitHub** → Allow
4. লিস্টে **PinCraft** খুঁজে **Connect** করো
   - রিপো না দেখালে → **Adjust GitHub App Permissions** → PinCraft সিলেক্ট → Save

### ধাপ ২ — Production Branch চেক করো

একই পেজে **Production Branch** = `main` আছে কিনা দেখো (ডিফল্টেই থাকে)।

### ব্যাস 🎉 — এখন থেকে:

```
কোড বদল  →  git commit  →  auto-push hook  →  GitHub main
                                                   ↓
                                         Vercel webhook
                                                   ↓
                                    Live site ~৩০ সেকেন্ডে আপডেট
```

লাইভ লিংক ধাপ ১ শেষ হলেই Vercel ড্যাশবোর্ডে দেখবে
(`https://pincraft-xxxx.vercel.app` ধরনের)।

---

## 🔄 Auto-push কীভাবে চলে

`.git/hooks/post-commit` হুক ইনস্টল করা আছে — এই ওয়ার্কস্পেসে যতবার commit
হবে, সাথে সাথেই GitHub-এ push হয়ে যাবে। আলাদা কমান্ড লাগবে না।

ম্যানুয়ালি করতে চাইলে:

```bash
./scripts/auto-push.sh "feat: নতুন সেকশন যোগ করলাম"
```

---

## 🔒 নিরাপত্তা নোট (গুরুত্বপূর্ণ)

1. **টোকেন চ্যাটে শেয়ার হয়েছে** → সেটআপ শেষ হওয়ার পর обязательно revoke করো:
   GitHub → Settings → Developer settings → Tokens (classic) → `Delete`
2. প্রথম commit-এ ভুল করে `.git-credentials` ও `.gitconfig` ঢুকে গিয়েছিল।
   GitHub-এর **Push Protection** সেটা ব্লক করে দেয় — তাই টোকেন GitHub-এ
   পৌঁছায়নি। এরপর হিস্ট্রি রিরাইট করে (force না করেই) ফাইল দুটো বাদ দেওয়া
   হয়েছে এবং `.gitignore` + `.git/info/exclude`-এ ব্লক করা হয়েছে।
   ✅ বর্তমানে রিপোতে কোনো credential নেই — যাচাই করা হয়েছে।

---

## 🆘 সমস্যা হলে

| সমস্যা | সমাধান |
|---|---|
| Vercel-এ রিপো দেখাচ্ছে না | Settings → Git → Adjust GitHub App Permissions → repo add |
| `Permission denied` | টোকেনে `repo` scope আছে কিনা দেখো |
| `Updates were rejected` | `git pull --rebase origin main` তারপর push |
| Build fail | Framework Preset = `Other`, Build Command = খালি |
| সাইট 404 | `index.html` root-এ আছে কিনা দেখো (আছে) |

---
*আপডেট: 2026-11-13*
