"use client";

import { Pin } from "lucide-react";

const Bold = ({ text }) => {
  // render **bold** segments inside generated copy
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-bold text-neutral-900">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};

export default function ArticleView({ article }) {
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
      {/* blog post header */}
      <header className="border-b border-neutral-100 px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-center gap-2 text-[11.5px] font-bold">
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-brand-700">
            {article.niche}
          </span>
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-500">
            {article.readMinutes} min read
          </span>
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-500">
            SEO {article.seoScore.total}/100
          </span>
        </div>

        <h1 className="mt-3 text-[26px] font-extrabold leading-[1.15] tracking-[-0.03em] text-neutral-900 sm:text-[34px]">
          {article.title}
        </h1>

        <div className="mt-3 flex items-center gap-2 text-[12px] font-semibold text-neutral-400">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-white">
            <Pin size={12} />
          </span>
          By PinCraft · {new Date(article.createdAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </div>
      </header>

      {/* body — clean reading style */}
      <div className="px-5 py-6 sm:px-8 sm:py-8">
        <p className="text-[16px] leading-[1.8] text-neutral-700 sm:text-[17px]">
          {article.intro}
        </p>

        {article.sections.map((section, i) => (
          <section key={i} className="mt-7">
            <h2 className="text-[20px] font-extrabold leading-snug tracking-[-0.02em] text-neutral-900 sm:text-[22px]">
              {section.heading}
            </h2>
            <div className="mt-2.5 space-y-3.5">
              {section.paragraphs.map((para, j) => (
                <p
                  key={j}
                  className="text-[15.5px] leading-[1.8] text-neutral-700 sm:text-[16.5px]"
                >
                  <Bold text={para} />
                </p>
              ))}
            </div>
          </section>
        ))}

        {/* quotes / list section */}
        <section className="mt-7 rounded-2xl border border-brand-100 bg-brand-50/40 p-4 sm:p-5">
          <h2 className="text-[19px] font-extrabold leading-snug tracking-[-0.02em] text-neutral-900 sm:text-[21px]">
            {article.listSection.heading}
          </h2>
          <p className="mt-1.5 text-[13px] font-semibold text-brand-700">
            {article.listSection.intro}
          </p>
          <ul className="mt-3 space-y-2.5">
            {article.listSection.items.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
                <span className="text-[15px] leading-relaxed text-neutral-700">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* conclusion */}
        <section className="mt-7">
          <h2 className="text-[20px] font-extrabold leading-snug tracking-[-0.02em] text-neutral-900 sm:text-[22px]">
            Final thoughts
          </h2>
          <p className="mt-2.5 text-[15.5px] leading-[1.8] text-neutral-700 sm:text-[16.5px]">
            {article.conclusion}
          </p>
        </section>

        {/* keywords footer */}
        <footer className="mt-7 border-t border-neutral-100 pt-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-400">
            SEO keywords
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {article.keywords.map((k) => (
              <span
                key={k}
                className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11.5px] font-semibold text-neutral-600"
              >
                {k}
              </span>
            ))}
          </div>
        </footer>
      </div>
    </article>
  );
}
