import { ArrowRight, Check, Clock3, Pin } from "lucide-react";
import { RECENT_ACTIVITY } from "@/lib/dashboard";

export default function RecentActivity() {
  const posted = RECENT_ACTIVITY.filter((pin) => pin.status === "Posted").length;

  return (
    <section aria-labelledby="recent-activity-heading" className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
        <div>
          <h2 id="recent-activity-heading" className="text-[18px] font-extrabold tracking-tight text-neutral-900">
            Recent Activity
          </h2>
          <p className="mt-1 text-[12.5px] text-neutral-500">A little progress, one pin at a time.</p>
        </div>
        <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[11.5px] font-semibold text-neutral-500">
          Latest 5 pins
        </span>
      </div>

      <p className="flex items-center gap-1.5 border-t border-neutral-100 px-5 py-2 text-[11px] font-medium text-neutral-500 sm:hidden">
        Swipe to see all columns <ArrowRight aria-hidden="true" size={12} />
      </p>

      <div
        role="region"
        aria-label="Recent activity table, scroll horizontally on small screens"
        tabIndex={0}
        data-testid="activity-scroll"
        className="overflow-x-auto overscroll-x-contain focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600"
      >
        <table className="w-full min-w-[720px] border-collapse text-left">
          <caption className="sr-only">Five sample pins with posting status, views, clicks and date.</caption>
          <thead>
            <tr className="border-y border-neutral-100 bg-neutral-50/80 text-[10.5px] font-bold uppercase tracking-[0.09em] text-neutral-500">
              <th scope="col" className="px-5 py-3.5 sm:pl-6">Pin Title</th>
              <th scope="col" className="px-4 py-3.5">Status</th>
              <th scope="col" className="px-4 py-3.5 text-right">Views</th>
              <th scope="col" className="px-4 py-3.5 text-right">Clicks</th>
              <th scope="col" className="px-5 py-3.5 text-right sm:pr-6">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {RECENT_ACTIVITY.map((pin) => (
              <tr key={pin.id} className="transition-colors hover:bg-neutral-50/60">
                <th scope="row" className="px-5 py-4 font-normal sm:pl-6">
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" className="grid h-10 w-9 shrink-0 place-items-center rounded-lg border border-brand-100 bg-brand-50 text-brand-600">
                      <Pin size={17} strokeWidth={1.8} />
                    </span>
                    <div>
                      <p className="text-[13px] font-bold leading-snug text-neutral-800">{pin.title}</p>
                      <p className="mt-1 text-[11px] text-neutral-500">{pin.topic}</p>
                    </div>
                  </div>
                </th>
                <td className="px-4 py-4">
                  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11px] font-bold ${pin.status === "Posted" ? "bg-emerald-50 text-emerald-700" : "bg-brand-50 text-brand-700"}`}>
                    {pin.status === "Posted" ? <Check aria-hidden="true" size={12} strokeWidth={2.5} /> : <Clock3 aria-hidden="true" size={12} />}
                    {pin.status}
                  </span>
                </td>
                <td className="px-4 py-4 text-right text-[13px] font-semibold tabular-nums text-neutral-700">{pin.views.toLocaleString("en-US")}</td>
                <td className="px-4 py-4 text-right text-[13px] font-semibold tabular-nums text-neutral-700">{pin.clicks.toLocaleString("en-US")}</td>
                <td className="whitespace-nowrap px-5 py-4 text-right text-[12px] font-medium text-neutral-500 sm:pr-6">{pin.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 bg-neutral-50/50 px-5 py-3.5 text-[11px] font-medium text-neutral-500 sm:px-6">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {posted} posted <span className="text-neutral-300">/</span> {RECENT_ACTIVITY.length - posted} scheduled
        </span>
        <span>Sample activity</span>
      </div>
    </section>
  );
}
