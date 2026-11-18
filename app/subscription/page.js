import { pageOpenGraph, webPageJsonLd } from '@/lib/seo.mjs';
import PageShell from '@/components/PageShell';
import Subscription from '@/components/workspace/Subscription';
import { manualPinterestMode } from '@/lib/publishing/mode.mjs';
export const dynamic='force-dynamic';
const pageSeo = { title: "Subscription", description: "One owned Blogger website to start; approved subscriptions for additional sites. Pinterest stays manual.", path: "/subscription" };

export const metadata = {
  title: "Subscription",
  description: "One owned Blogger website to start; approved subscriptions for additional sites. Pinterest stays manual.",
  alternates: { canonical: "/subscription" },
  openGraph: pageOpenGraph(pageSeo),
  robots: {index:true,follow:true},
};
export default function Page(){return <PageShell jsonLd={webPageJsonLd(pageSeo)}><Subscription manualPinterest={manualPinterestMode()}/></PageShell>;}
