import Link from "next/link";

// Permanent tutorial section. It has no close button and is never hidden by user state.
export const TUTORIAL_VIDEO_ID = "9GsuZqVCpI0";

export default function HowToWorkSection({ compact = false }) {
  return (
    <section aria-labelledby="how-to-work-title" className="container-x pt-8" data-testid="how-to-work">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-brand-700">Tutorial</p>
        <h2 id="how-to-work-title" className="mt-2 text-[20px] font-extrabold leading-tight tracking-[-0.03em] text-neutral-900">How to Work</h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-neutral-600">Watch the PinCraft tutorial to learn how to use the workspace step by step.</p>
        <div className={`mt-5 grid gap-4 ${compact ? "" : "lg:grid-cols-[1.4fr_1fr] lg:items-center"}`}>
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-black">
            <div className="aspect-video w-full">
              <iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${TUTORIAL_VIDEO_ID}`} title="PinCraft tutorial video" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
            </div>
          </div>
          {!compact && <p className="text-[13px] leading-relaxed text-neutral-600">Prefer a dedicated page? <Link href="/how-to-work" className="font-bold text-brand-700 underline underline-offset-2">Open How to Work</Link>.</p>}
        </div>
      </div>
    </section>
  );
}
