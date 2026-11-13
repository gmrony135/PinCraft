import Link from "next/link";
import { Sparkles, FileText, LayoutDashboard, ArrowRight, Check } from "lucide-react";

const FEATURES = [
  {
    icon: Sparkles,
    title: "Viral Pin Generator",
    text: "Type a topic and get 5 scroll-stopping titles, an SEO description, 10 hashtags and a pin image idea — all copy-ready.",
    points: ["5 viral titles", "SEO description", "10 hashtags"],
    href: "/pin-generator",
    cta: "Open generator",
    tone: "brand",
  },
  {
    icon: FileText,
    title: "Auto Article Writer",
    text: "Turn any title into a 500–800 word SEO article with headings, sub-headings and a conclusion — written for Adsterra placement.",
    points: ["500–800 words", "H1 / H2 structure", "Ready to publish"],
    href: "/article-writer",
    cta: "Write an article",
    tone: "dark",
  },
  {
    icon: LayoutDashboard,
    title: "Automation Dashboard",
    text: "Explore sample pins, views, clicks and earnings. Save a local posting plan; live Pinterest scheduling is not connected yet.",
    points: ["Demo analytics", "Earnings chart", "Local posting plan"],
    href: "/dashboard",
    cta: "See dashboard",
    tone: "neutral",
  },
];

export default function Features() {
  return (
    <section className="container-x py-14 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <span className="eyebrow">Features</span>
        <h2 className="h2 mt-4">Your content workflow, in one place</h2>
        <p className="lead mt-3">
          Start with a topic, build an article, and plan your routine.
          Three focused tools, one simple workspace.
        </p>
      </div>

      <div className="mt-11 grid gap-5 md:grid-cols-3">
        {FEATURES.map((f, i) => {
          const Icon = f.icon;
          const iconWrap =
            f.tone === "brand"
              ? "bg-brand-600 text-white shadow-lg shadow-brand-600/25"
              : f.tone === "dark"
              ? "bg-neutral-900 text-white"
              : "bg-neutral-100 text-neutral-900";

          return (
            <article
              key={f.title}
              className="card group flex animate-fade-up flex-col p-6 transition-all duration-200 hover:-translate-y-1 hover:border-neutral-300 hover:shadow-xl"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <span className={`grid h-12 w-12 place-items-center rounded-2xl ${iconWrap}`}>
                <Icon size={22} />
              </span>

              <h3 className="mt-4 text-[18px] font-extrabold tracking-tight text-neutral-900">
                {f.title}
              </h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-neutral-500">
                {f.text}
              </p>

              <ul className="mt-4 space-y-1.5">
                {f.points.map((p) => (
                  <li
                    key={p}
                    className="flex items-center gap-2 text-[12.5px] font-semibold text-neutral-600"
                  >
                    <Check size={14} className="shrink-0 text-brand-600" />
                    {p}
                  </li>
                ))}
              </ul>

              <Link
                href={f.href}
                prefetch={false}
                className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 text-[13.5px] font-bold text-brand-600 transition-transform group-hover:gap-2.5"
              >
                {f.cta} <ArrowRight size={15} />
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
