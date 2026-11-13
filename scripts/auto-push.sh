#!/usr/bin/env bash
# ============================================================
# auto-push.sh — প্রতিবার কোড বদলালে auto commit + push
# Usage:
#   ./scripts/auto-push.sh "তোমার কমিট মেসেজ"
#   ./scripts/auto-push.sh            # auto message সহ
#
# প্রথমবার সেটআপ (একবারই লাগবে):
#   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
#   # তারপর নিচের PUSH_CMD অনুযায়ী টোকেন দিয়ে পুশ হবে
# ============================================================
set -e

BRANCH="main"
MESSAGE="${1:-Update website $(date '+%Y-%m-%d %H:%M')}"

# --- Remote check ---
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "❌ GitHub remote সেট করা নেই!"
  echo "   প্রথমে চালাও:"
  echo "   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git"
  exit 1
fi

echo "📝 Stage করা হচ্ছে..."
git add -A

# --- Commit (বদল না থাকলে skip) ---
if git diff --cached --quiet; then
  echo "ℹ️  কোনো বদল নেই, commit skip করা হলো।"
else
  git commit -m "$MESSAGE"
  echo "✅ Commit done: $MESSAGE"
fi

# --- Push ---
echo "🚀 GitHub main branch-এ push করা হচ্ছে..."
git push origin "$BRANCH"

echo "🎉 Push সফল! Vercel auto-deploy শুরু হবে ১-২ মিনিটে।"
echo "   Live site: Vercel Dashboard → তোমার প্রজেক্ট → Deployments"
