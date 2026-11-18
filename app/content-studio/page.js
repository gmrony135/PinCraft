import { pageOpenGraph, webPageJsonLd } from '@/lib/seo.mjs';
import PageShell from '@/components/PageShell';
import ContentStudioHub from '@/components/ai/ContentStudioHub';
const pageSeo = { title: "Content Studio", description: "Choose Article Writer, Pin Generator, a blog featured image, keywords, weekly planning or editorial review. One focused tool for each task.", path: "/content-studio" };

export const metadata = {
  title: "Content Studio",
  description: "Choose Article Writer, Pin Generator, a blog featured image, keywords, weekly planning or editorial review. One focused tool for each task.",
  alternates: { canonical: "/content-studio" },
  openGraph: pageOpenGraph(pageSeo),
  robots: {index:true,follow:true},
};
export default function Page(){return <PageShell jsonLd={webPageJsonLd(pageSeo)}><ContentStudioHub/></PageShell>;}
