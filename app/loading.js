import PageShell from '@/components/PageShell';
export default function Loading() {
  return <PageShell><div role="status" aria-live="polite" className="container-x py-12"><p className="text-sm font-semibold text-neutral-600">Loading page…</p><div aria-hidden="true" className="mt-6 animate-pulse space-y-4"><div className="h-10 w-2/3 rounded-xl bg-neutral-200" /><div className="h-5 w-full rounded-lg bg-neutral-100" /><div className="h-56 rounded-2xl bg-neutral-100" /></div></div></PageShell>;
}
