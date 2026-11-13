# 🚀 GitHub + Vercel Auto-Deploy সেটআপ গাইড

এই গাইডটা ফলো করলে **একবার** সেটআপ করলেই হবে — এরপর প্রতিবার কোড বদলালে
আমি auto commit + push করবো, আর Vercel নিজে থেকেই live site update করে দেবে।

---

## ধাপ ০ — যা যা লাগবে

| জিনিস | কোথায় পাবে | খরচ |
|---|---|---|
| GitHub অ্যাকাউন্ট | https://github.com/signup | ফ্রি |
| Vercel অ্যাকাউন্ট | https://vercel.com/signup (GitHub দিয়ে সাইন-ইন করো) | ফ্রি |

---

## ধাপ ১ — GitHub রিপো বানাও

1. https://github.com/new এ যাও
2. **Repository name**: `my-website` (বা পছন্দমতো নাম)
3. **Public** সিলেক্ট করো (Vercel ফ্রি প্ল্যানে public রিপো সবচেয়ে সহজ)
4. ⚠️ **"Add a README file" টিক দিও না**, "Add .gitignore" ও না — কারণ আমাদের ফাইল আগেই আছে
5. **Create repository** ক্লিক করো
6. রিপোর লিংক কপি করো — দেখতে এমন হবে:
   ```
   https://github.com/তোমার-ইউজারনেম/my-website.git
   ```

---

## ধাপ ২ — Personal Access Token (PAT) বানাও

কমান্ড লাইন থেকে পুশ করতে টোকেন লাগবে (পাসওয়ার্ড কাজ করে না)।

1. GitHub → **Settings** (উপরে ডানদিকে প্রোফাইল আইকন → Settings)
2. বাম দিকে একদম নিচে → **Developer settings**
3. **Personal access tokens** → **Tokens (classic)**
4. **Generate new token (classic)** ক্লিক
5. সেটিংস:
   - **Note**: `arena-agent-deploy`
   - **Expiration**: `90 days` (বা `No expiration` — নিরাপত্তার জন্য ৯০ দিন ভালো)
   - **Scopes**: ✅ `repo` (পুরো বক্সটা টিক দাও)
6. **Generate token** → টোকেনটা কপি করো (`ghp_...` দিয়ে শুরু)
   > 🔒 টোকেনটা কাউকে দিও না, স্ক্রিনশটেও দেখিও না। এটা একবারই দেখা যায়।

**টোকেনটা আমাকে দিলে** আমি সরাসরি push সেটআপ করে দেবো।

---

## ধাপ ৩ — লোকাল Git কানেক্ট করো

ওয়ার্কস্পেসে আমি এটা চালাবো (তুমি নিজেও পারো):

```bash
git remote add origin https://github.com/তোমার-ইউজারনেম/my-website.git
git branch -M main
```

পুশ করার সময় ইউজারনেম ও টোকেন চাইবে:

```bash
git push -u origin main
# Username: তোমার-ইউজারনেম
# Password: ghp_xxxxxxxxxxxxxxxx   ← PAT টোকেন পেস্ট করো
```

**একবার পুশ করার পর টোকেন সেভ করে রাখতে:**

```bash
git config --global credential.helper store
```

এরপর আর বারবার টোকেন দিতে হবে না — আমি auto push করতে পারবো।

---

## ধাপ ৪ — Vercel-এ Auto-Deploy চালু করো ⭐

এটা করলেই **push = live deploy**:

1. https://vercel.com/new এ যাও
2. **Continue with GitHub** → GitHub অ্যাকাউন্ট authorize করো
3. **Import Git Repository** সেকশনে তোমার `my-website` রিপো দেখাবে
   - না দেখালে **Adjust GitHub App Permissions** → রিপো সিলেক্ট করো → Save
4. রিপোর পাশে **Import** ক্লিক
5. কনফিগারেশন:
   - **Framework Preset**: `Other` (বা `HTML/CSS/JS`)
   - **Root Directory**: `./` (ডিফল্ট)
   - **Build Command**: খালি রাখো
   - **Output Directory**: খালি রাখো
6. **Deploy** ক্লিক করো

**ব্যাস! 🎉** এখন থেকে:

```
git push origin main  →  Vercel webhook ট্রিগার  →  ~৩০ সেকেন্ডে live site আপডেট
```

তোমার লাইভ সাইটের লিংক হবে: `https://my-website-xxxx.vercel.app`
(Vercel → Project → Settings → Domains থেকে নিজের ডোমেইনও যোগ করতে পারবে)

---

## ধাপ ৫ — প্রতিবার কোড বদলালে

আমি প্রতিবার ফাইল বদলানোর পর এটা চালাবো:

```bash
./scripts/auto-push.sh "feat: hero section যোগ করলাম"
```

স্ক্রিপ্টটা নিজেই `git add -A` → `commit` → `push origin main` করে দেবে।
তারপর Vercel auto-deploy হবে।

---

## 🔒 নিরাপত্তা টিপস

- `.env` ফাইল কখনো commit হয় না — `.gitignore`-এ আগেই ব্লক করা আছে
- টোকেন কোডে বা README-তে লিখো না
- টোকেন লিক হলে GitHub → Developer settings → Revoke দাও

---

## 🆘 সমস্যা হলে

| সমস্যা | সমাধান |
|---|---|
| `remote: Permission denied` | টোকেনে `repo` scope আছে কিনা চেক করো, অথবা টোকেন নতুন করে বানাও |
| `Updates were rejected` | `git pull origin main --rebase` তারপর আবার push |
| Vercel-এ রিপো দেখাচ্ছে না | Vercel → Settings → Git → GitHub App permissions → Add repos |
| Vercel build fail | Framework Preset = `Other`, Build Command = খালি |
| সাইট 404 দেখাচ্ছে | `index.html` root-এ আছে কিনা দেখো |

---

*তৈরি: 2026-11-13*
