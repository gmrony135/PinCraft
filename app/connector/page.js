import { pageOpenGraph, webPageJsonLd } from '@/lib/seo.mjs';
import PageShell from '@/components/PageShell';
import Connector from '@/components/workspace/Connector';
const pageSeo = { title: "Connector", description: "Manage Blogger account permissions, verified blogs and explicitly authorized recurring posts. Pinterest remains manual.", path: "/connector" };

export const metadata = {
  title: "Connector",
  description: "Manage Blogger account permissions, verified blogs and explicitly authorized recurring posts. Pinterest remains manual.",
  alternates: { canonical: "/connector" },
  openGraph: pageOpenGraph(pageSeo),
  robots: {index:false,follow:true},
};
export default function Page(){return <PageShell jsonLd={webPageJsonLd(pageSeo)}><Connector/></PageShell>;}
