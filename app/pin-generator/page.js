import JsonLd from '@/components/seo/JsonLd';
import { pageOpenGraph, webPageJsonLd } from '@/lib/seo.mjs';
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PinGenerator from "@/components/pin-generator/PinGenerator";

const pageSeo = { title: "Viral Pin Generator", description: "Explore ten product categories, create Pin titles and descriptions, or generate download-only 1000 \u00d7 1500 artwork without creating Pin copy first.", path: "/pin-generator" };

export const metadata = {
  title: "Viral Pin Generator",
  description: "Explore ten product categories, create Pin titles and descriptions, or generate download-only 1000 \u00d7 1500 artwork without creating Pin copy first.",
  alternates: { canonical: "/pin-generator" },
  openGraph: pageOpenGraph(pageSeo),
};

export default function PinGeneratorPage() {
  return (
    <>
      <Navbar />
      <main><JsonLd data={webPageJsonLd(pageSeo)} />
        <PinGenerator />
      </main>
      <Footer />
    </>
  );
}
