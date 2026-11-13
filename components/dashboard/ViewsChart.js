"use client";

import { useState } from "react";
import { BarChart3, CalendarDays } from "lucide-react";
import { WEEKLY_VIEWS } from "@/lib/dashboard";

const MAX_VIEWS = 10000;
const TICKS = ["10k", "7.5k", "5k", "2.5k", "0"];
const TOTAL = WEEKLY_VIEWS.reduce((sum, day) => sum + day.views, 0);
const BEST_INDEX = WEEKLY_VIEWS.reduce((best, day, index, days) => day.views > days[best].views ? index : best, 0);

export default function ViewsChart() {
  const [selected, setSelected] = useState(BEST_INDEX);
  const [hovered, setHovered] = useState(null);
  const active = hovered ?? selected;
  const current = WEEKLY_VIEWS[active];

  return (
    <section aria-labelledby="views-heading" className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="views-heading" className="text-[18px] font-extrabold tracking-tight text-neutral-900">Last 7 Days Views</h2>
          <p className="mt-1 text-[12.5px] text-neutral-500">See how your pins performed, day by day.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-[11.5px] font-semibold text-neutral-600">
          <CalendarDays aria-hidden="true" size={14} /> Mon – Sun
        </span>
      </div>

      <div className="mb-9 mt-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[30px] font-extrabold leading-none tracking-[-0.04em] tabular-nums text-neutral-900">{TOTAL.toLocaleString("en-US")}</span>
          <span className="text-[12px] text-neutral-500">total views</span>
        </div>
        <p aria-live="polite" aria-atomic="true" data-testid="chart-selection" className="flex items-center gap-1.5 text-[12px] text-neutral-500">
          <span aria-hidden="true" className="mr-0.5 h-2 w-2 rounded-sm bg-brand-600" />
          <span className="font-bold text-neutral-700">{current.day}</span>
          <span>·</span>
          <span>{current.views.toLocaleString("en-US")} views</span>
        </p>
      </div>

      <figure aria-label="Bar chart of sample daily pin views from Monday to Sunday">
        <div className="relative ml-9 mr-1 h-[200px] sm:h-[230px]">
          {/* Axis/grid are decorative; each bar exposes the exact value. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {TICKS.map((tick, index) => (
              <div key={tick} className="absolute inset-x-0 border-t border-dashed border-neutral-200" style={{ top: `${index * 25}%` }}>
                <span className="absolute right-full -mt-2 mr-3 text-[10px] font-medium tabular-nums text-neutral-500">{tick}</span>
              </div>
            ))}
          </div>

          <div className="relative grid h-full grid-cols-7 gap-2 sm:gap-5 md:gap-8">
            {WEEKLY_VIEWS.map((day, index) => (
              <button
                key={day.day}
                type="button"
                aria-label={`${day.fullDay}: ${day.views.toLocaleString("en-US")} views`}
                aria-pressed={selected === index}
                data-testid="views-bar"
                data-views={day.views}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(null)}
                onClick={() => setSelected(index)}
                className="group relative flex h-full min-w-0 items-end justify-center rounded-t-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-4"
              >
                <span
                  aria-hidden="true"
                  className={`block w-full max-w-[66px] rounded-t-md border-t transition-colors duration-200 sm:rounded-t-lg ${active === index ? "border-brand-700 bg-brand-600" : "border-brand-600/30 bg-brand-600/70 group-hover:bg-brand-600/80"}`}
                  style={{ height: `${(day.views / MAX_VIEWS) * 100}%` }}
                />
                {active === index && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-neutral-900 px-2.5 py-1.5 text-[11px] font-bold tabular-nums text-white shadow-sm"
                    style={{ bottom: `calc(${(day.views / MAX_VIEWS) * 100}% + 9px)` }}
                  >
                    {day.views.toLocaleString("en-US")}
                    <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-neutral-900" />
                  </span>
                )}
                <span aria-hidden="true" className={`absolute top-full mt-3 text-[10.5px] font-semibold sm:text-[12px] ${active === index ? "text-brand-700" : "text-neutral-500"}`}>
                  {day.day}
                </span>
              </button>
            ))}
          </div>
        </div>

        <figcaption className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3.5 text-[11px] text-neutral-500">
          <span className="inline-flex items-center gap-1.5"><BarChart3 aria-hidden="true" size={13} /> Sample data · Monday to Sunday</span>
          <span>Tap or focus a bar for exact views.</span>
        </figcaption>
      </figure>
    </section>
  );
}
