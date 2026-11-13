# 🚀 PinCraft — Setup Status

## ✅ যা হয়ে গেছে

| কাজ | স্ট্যাটাস |
|---|---|
| লোকাল Git রিপো (`main` branch) | ✅ তৈরি |
| GitHub রিপোতে কোড পুশ | ✅ [gmrony135/PinCraft](https://github.com/gmrony135/PinCraft) |
| Auto-push hook (`post-commit`) | ✅ ইনস্টল — প্রতিবার commit → GitHub push |
| Vercel প্রজেক্ট তৈরি (`pincraft`) | ✅ তৈরি (এখনো GitHub-এ লিংক হয়নি) |
| Vercel অ্যাকাউন্ট | ✅ কানেক্টেড (`gmrony135-9877`) |

---

## ⚠️ শুধু ২টা ধাপ বাকি (তোমাকে করতে হবে)

API দিয়ে GitHub → Vercel অটো-লিংক করা যায়নি, কারণ Vercel-এ "Login Connection"
(অর্থাৎ GitHub অ্যাকাউন্ট OAuth) আগে লাগে — এটা শুধু ব্রাউজার থেকে করা যায়।

### ধাপ ১ — Vercel-এ GitHub কানেক্ট করো

1. https://vercel.com/gmrony135-9877/pincraft/settings/git এ যাও (অথবা
   https://vercel.com/dashboard → pincraft → Settings → Git)
2. **Connect Git Repository** ক্লিক করো
3. **GitHub** সিলেক্ট করো → **Authorize / Login with GitHub** → Allow দাও
4. রিপো লিস্টে `PinCraft` সিলেক্ট করে **Connect** ক্লিক করো
5. নিশ্চিত করো **Production Branch = `main`**

### ধাপ ২ — নিশ্চিত করো Production Branch `main`

Settings → Git → **Production Branch** এ `main` আছে কিনা দেখো।
এটা থাকলেই প্রতিবার `main`-এ push হলে production site auto-deploy হবে।

---

## 🎉 এরপর কী হবে

```
আমি কোড বদলাই  →  git commit  →  post-commit hook  →  GitHub main push
                                        ↓
                              Vercel webhook (GitHub App)
                                        ↓
                              Live site ~30 সেকেন্ডে আপডেট
```

লাইভ লিংক (ধাপ ১ শেষ হলে): `https://pincraft-<hash>.vercel.app`

---

## 🔄 Auto-push কীভাবে কাজে লাগবে

`.git/hooks/post-commit` ইনস্টল করা আছে। মানে এই ওয়ার্কস্পেসে যতবার কোড
commit হবে, সাথে সাথে GitHub-এ push হয়ে যাবে — আলাদা করে push কমান্ড লাগবে না।

ম্যানুয়ালি করতে চাইলে:

```bash
./scripts/auto-push.sh "feat: নতুন সেকশন যোগ করলাম"
```

---

## 🔒 নিরাপত্তা

- `.gitignore`-এ `.env`, `node_modules` ব্লক করা
- GitHub টোকেন শুধু ওয়ার্কস্পেসের credential store-এ আছে, কোডে নেই
- ⚠️ তুমি টোকেনটা চ্যাটে শেয়ার করেছো — সেটআপ শেষ হলে GitHub →
  Settings → Developer settings → Tokens → **Revoke** করে নতুন টোকেন বানিয়ে নেওয়া ভালো

---
*আপডেট: 2026-11-13*
