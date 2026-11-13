# 🌐 আমার ওয়েবসাইট

> এই প্রজেক্টটি GitHub + Vercel দিয়ে auto-deploy সেটআপ করা আছে।
> প্রতিবার কোড বদলালে GitHub-এ push হলেই Vercel-এ live website auto-update হয়ে যাবে।

## 🚀 Auto Push + Auto Deploy কীভাবে কাজ করে

```
আমি কোড বদলাই  →  git commit  →  git push (main)  →  Vercel auto-deploy  →  Live website update
```

## 📁 প্রজেক্ট স্ট্রাকচার

```
.
├── index.html          # মূল ওয়েবসাইট (prompt অনুযায়ী বানানো হবে)
├── vercel.json         # Vercel কনফিগ
├── .gitignore          # Git ignore rules
├── scripts/
│   └── auto-push.sh    # এক ক্লিকে commit + push
└── GITHUB_VERCEL_SETUP.md  # সম্পূর্ণ সেটআপ গাইড (বাংলা)
```

## ⚙️ প্রথমবার সেটআপ (একবারই)

সম্পূর্ণ ধাপগুলো দেখো → [GITHUB_VERCEL_SETUP.md](./GITHUB_VERCEL_SETUP.md)

সংক্ষেপে:
1. GitHub-এ নতুন রিপো বানাও
2. `git remote add origin https://github.com/USERNAME/REPO.git`
3. Vercel-এ গিয়ে GitHub রিপো Import করো → Auto-deploy চালু!

## 🔄 প্রতিবার কোড বদলানোর পর

```bash
./scripts/auto-push.sh "কী বদলালে লিখো"
```

অথবা আমি (Arena Agent) প্রতিবার কোড বদলানোর পর নিজে commit + push করে দেবো।

---
*সেটআপ তারিখ: 2026-11-13*
