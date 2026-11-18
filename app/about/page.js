import JsonLd from '@/components/seo/JsonLd';
import { pageOpenGraph, webPageJsonLd } from '@/lib/seo.mjs';
import Link from "next/link";
import { ArrowRight, BookOpen, Pin, ShieldCheck } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const pageSeo = { title: "About PinCraft", description: "PinCraft brings content tools, reviewed Blogger publishing and owner-controlled manual Pinterest jobs into one workspace.", path: "/about" };

export const metadata = {
  title: "About PinCraft",
  description: "PinCraft brings content tools, reviewed Blogger publishing and owner-controlled manual Pinterest jobs into one workspace.",
  alternates: { canonical: "/about" },
  openGraph: pageOpenGraph(pageSeo),
};
export default function AboutPage() {
  return <><Navbar /><main className="bg-[#fafafa]"><JsonLd data={webPageJsonLd(pageSeo)} /><div className="container-x py-12 sm:py-16"><div className="max-w-2xl"><span className="eyebrow"><Pin aria-hidden="true" size={14} /> Made for creators</span><h1 className="h1 mt-5">More ideas.<br />Less busywork.</h1><p className="lead mt-5">PinCraft brings pin titles, SEO articles, your saved library, reviewed Blogger publishing and manual Pinterest packs into one simple workspace.</p></div><div className="mt-8 grid gap-4 md:grid-cols-3">{[[Pin,"Start with a topic","Turn a topic into a pack of pin titles, a description, hashtags and an image idea."],[BookOpen,"Give ideas a home","Write a structured article and keep your content together in My Library."],[ShieldCheck,"Blogger automatic. Pinterest manual.","Blogger publishing needs separate account authorization and a configured background runner. Pin packs wait for a verified live article URL. Pin Generator can also prepare a private, owner-scoped Pin job with a signed image URL; you choose the board and Save through Pinterest’s official interface. Signed-in Library drafts remain private and guest saves stay on your device."]].map(([Icon,title,copy])=><section key={title} className="card p-6"><Icon aria-hidden="true" size={22} className="text-brand-600" /><h2 className="mt-4 text-[18px] font-extrabold">{title}</h2><p className="mt-2 text-[13px] leading-relaxed text-neutral-600">{copy}</p></section>)}</div><div className="mt-8 flex flex-wrap gap-3"><Link href="/pin-generator" prefetch={false} className="btn-primary">Generate a Pin <ArrowRight aria-hidden="true" size={17} /></Link><Link href="/contact" prefetch={false} className="btn-outline">Contact & feedback</Link></div></div></main><Footer /></>;
}
