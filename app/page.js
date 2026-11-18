import Link from 'next/link';
import { ArrowRight, ArrowUpRight, CalendarClock, Check, CirclePause, Clock3, FolderHeart, Link2, ShieldCheck, WandSparkles } from 'lucide-react';
import PageShell from '@/components/PageShell';
import HomeHeroAnimation from '@/components/home/HomeHeroAnimation';
import MonetagInPagePush from '@/components/ads/MonetagInPagePush';
import { CATEGORIES } from '@/lib/product.mjs';

export default function HomePage() {
  return (
    <PageShell className="!bg-white">
      <section className="relative overflow-hidden border-b border-neutral-100">
        <div className="pointer-events-none absolute -right-40 -top-44 h-[640px] w-[640px] rounded-full bg-brand-50/70 blur-3xl" />
        <div className="container-x relative grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.15fr_1fr] lg:gap-14 lg:py-20">
          <div>
            <p className="eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-brand-600" aria-hidden="true" />Blogger automatic · Pinterest manual</p>
            <h1 className="mt-5 text-[41px] font-extrabold leading-[1.05] tracking-[-0.055em] text-neutral-950 sm:text-[57px] lg:text-[64px]">
              Turn your ideas<br />into <span className="text-brand-600">well-made articles.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-neutral-500 sm:text-[16px]">
              Create a search-aware guide with a clear structure, original article imagery and relevant links from your own live Blogger site. Review every post before publication; Pinterest remains yours to manage.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/connector" prefetch={false} className="btn-primary">Connect Blogger<ArrowRight size={17} aria-hidden="true" /></Link>
              <Link href="/article-writer" prefetch={false} className="btn-outline">Create an article<ArrowUpRight size={16} aria-hidden="true" /></Link>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-semibold text-neutral-500">
              {['1,000–1,600 words', '3 original article images', '2–5 live internal links'].map(text => <li key={text} className="flex items-center gap-1.5"><Check size={13} className="text-brand-600" aria-hidden="true" />{text}</li>)}
            </ul>
            <p className="mt-4 max-w-xl text-[10.5px] leading-relaxed text-neutral-400">
              Article review and your explicit Blogger approval are required. Recurring posts need separate authorization; Pinterest uploads are never automatic. AI SEO descriptions and slugs are suggestions, not fields PinCraft claims to have applied.
            </p>
          </div>
          <HomeHeroAnimation />
        </div>
      </section>

      <section className="container-x py-12 sm:py-16">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand-700">One home for every step</p>
            <h2 className="mt-3 text-[28px] font-extrabold tracking-[-0.035em] sm:text-[35px]">Everything has its own place.</h2>
          </div>
          <Link href="/dashboard" prefetch={false} className="inline-flex min-h-11 items-center gap-2 text-[12px] font-bold text-brand-700">Open your workspace<ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[[Link2, 'Connector', 'Blogger permissions, verified blogs and recurring settings.', '/connector'], [CalendarClock, 'Publishing jobs', 'Owner-scoped Blogger checkpoints and manual Pinterest Pin jobs.', '/jobs'], [WandSparkles, 'Content Studio', 'A simple hub for writing, Pin artwork, planning and review.', '/content-studio'], [FolderHeart, 'My Library', 'Your saved drafts and confirmed publication links.', '/library']].map(([Icon, title, description, href]) => (
            <Link key={href} href={href} prefetch={false} className="group min-w-0 rounded-2xl border border-neutral-200 bg-white p-5 transition hover:border-brand-200 hover:shadow-sm">
              <Icon size={22} className="text-brand-600" aria-hidden="true" />
              <h3 className="mt-5 flex items-center justify-between gap-2 text-[15px] font-extrabold">{title}<ArrowUpRight size={15} className="text-neutral-400 group-hover:text-brand-600" aria-hidden="true" /></h3>
              <p className="mt-2 text-[12px] leading-relaxed text-neutral-500">{description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-y border-neutral-100 bg-[#fafafa]">
        <div className="container-x py-12 sm:py-16">
          <div className="max-w-2xl">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand-700">Categories to build around</p>
            <h2 className="mt-3 text-[28px] font-extrabold tracking-[-0.035em] sm:text-[35px]">Choose your focus. Keep it consistent.</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-neutral-500">Use a category in your writing tools or select 1–3 for recurring Blogger posts. Recurring work uses current relevant source signals, not fixed ideas presented as live trends. Missing evidence or failed checks can leave a slot unfilled.</p>
          </div>
          <ul className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((category, index) => <li key={category.id} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-[10px] font-bold text-brand-700">{String(index + 1).padStart(2, '0')}</span><span className="text-[12px] font-bold text-neutral-700">{category.label}</span></li>)}
          </ul>
        </div>
      </section>

      <section className="container-x grid gap-7 py-12 sm:py-16 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand-700">Built around permission</p>
          <h2 className="mt-3 text-[28px] font-extrabold tracking-[-0.035em] sm:text-[35px]">Automation without losing control.</h2>
          <p className="mt-4 max-w-lg text-[13px] leading-relaxed text-neutral-500">After explicit authorization, the backend checks reviewed jobs and recurring schedules while your browser is closed. It never uploads a Pin or signs in to Pinterest for you.</p>
        </div>
        <div className="space-y-5">
          {[[ShieldCheck, 'Your account is private', 'Only your own connected accounts, content and recorded events appear in your workspace. Empty states are never filled with fake statistics.'], [CirclePause, 'Clear checkpoints and review controls', 'A saved post ID is reused. Uncertain results stop for inspection, not blind reposting. Cancel a schedule already accepted by Blogger in Blogger itself.'], [Clock3, 'Honest scheduling', 'Choose an article time and a manual Pin target. Background checks can be delayed; the Pin target is a reminder, not an automatic upload or exact-minute promise.']].map(([Icon, title, text]) => (
            <div key={title} className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-neutral-50 text-brand-600"><Icon size={19} aria-hidden="true" /></span><div><h3 className="text-[13px] font-extrabold">{title}</h3><p className="mt-1.5 text-[12px] leading-relaxed text-neutral-500">{text}</p></div></div>
          ))}
        </div>
      </section>

      <section className="container-x pb-12 sm:pb-16">
        <div className="flex flex-col justify-between gap-6 rounded-3xl bg-neutral-900 p-7 text-white sm:p-10 lg:flex-row lg:items-center">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-200">Create your own workspace</p>
            <h2 className="mt-3 text-[27px] font-extrabold tracking-tight">Review your article. Take your Pin with you.</h2>
            <p className="mt-3 text-[12px] leading-relaxed text-neutral-400">Private drafts. Separate Blogger consent. Manual Pinterest upload.</p>
          </div>
          <Link href="/register" prefetch={false} className="btn-primary shrink-0">Create an account<ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </section>
      <MonetagInPagePush />
    </PageShell>
  );
}
