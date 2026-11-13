import { PenLine, Sparkles, Send, TrendingUp, ArrowRight } from "lucide-react";

const STEPS = [
  {
    n: "01",
    icon: PenLine,
    title: "Give Topic",
    text: "Type any topic — “Sad Quotes”, “Home Decor”, “Dinner Recipes”. One box, five seconds.",
    accent: "bg-neutral-900",
  },
  {
    n: "02",
    icon: Sparkles,
    title: "PinCraft Creates Viral Pin",
    text: "5 viral titles, 1 SEO description, 10 hashtags and a pin image idea — instantly.",
    accent: "bg-brand-600",
  },
  {
    n: "03",
    icon: Send,
    title: "Auto Article + Auto Post",
    text: "Generate a 500–800 word article. Preview the publishing flow; live blog and Pinterest posting need integration.",
    accent: "bg-neutral-900",
  },
  {
    n: "04",
    icon: TrendingUp,
    title: "Traffic → Income",
    text: "Publish to your own connected blog to pursue Pinterest traffic and ad income. Results and earnings are not guaranteed.",
    accent: "bg-brand-600",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-y border-neutral-100 bg-neutral-50/60">
      <div className="container-x py-14 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">How it works</span>
          <h2 className="h2 mt-4">One topic. A clearer content routine.</h2>
          <p className="lead mt-3">
            Try the content tools now. The final publishing and monetization
            steps need connected accounts and a live blog.
          </p>
        </div>

        <div className="relative mt-12">
          {/* connecting line (desktop) */}
          <div className="pointer-events-none absolute left-0 right-0 top-[38px] hidden lg:block">
            <div className="mx-[12.5%] h-[2px] bg-gradient-to-r from-neutral-200 via-brand-200 to-neutral-200" />
          </div>

          <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <li
                  key={s.n}
                  className="relative animate-fade-up"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="card h-full p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                    <div className="flex items-center justify-between">
                      <span
                        className={`grid h-11 w-11 place-items-center rounded-xl text-white ${s.accent}`}
                      >
                        <Icon size={20} />
                      </span>
                      <span className="text-[26px] font-extrabold leading-none text-neutral-200">
                        {s.n}
                      </span>
                    </div>
                    <h3 className="mt-4 text-[16px] font-bold tracking-tight text-neutral-900">
                      {s.title}
                    </h3>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-neutral-500">
                      {s.text}
                    </p>
                  </div>

                  {/* arrow between cards on mobile/tablet */}
                  {i < STEPS.length - 1 && (
                    <div className="flex justify-center py-1 lg:hidden">
                      <ArrowRight size={16} className="rotate-90 text-neutral-300" />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
