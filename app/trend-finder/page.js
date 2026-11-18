import { pageOpenGraph, webPageJsonLd } from '@/lib/seo.mjs';
import PageShell from '@/components/PageShell';
import TrendFinder from '@/components/trend-finder/TrendFinder';

const pageSeo = { title: "AI Trend Finder Automation", description: "Explore daily Google Trends RSS snapshots for the United States, United Kingdom and Canada, view clearly labeled PinCraft estimates, and generate Pinterest Pin ideas. Publishing remains manual.", path: "/trend-finder" };

export const metadata = {
  title: "AI Trend Finder Automation",
  description: "Explore daily Google Trends RSS snapshots for the United States, United Kingdom and Canada, view clearly labeled PinCraft estimates, and generate Pinterest Pin ideas. Publishing remains manual.",
  alternates: { canonical: "/trend-finder" },
  openGraph: pageOpenGraph(pageSeo),
  robots: { index: true, follow: true },
};

export default function Page() {
  return <PageShell jsonLd={webPageJsonLd(pageSeo)}><TrendFinder /></PageShell>;
}
