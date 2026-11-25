import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ArticleWriter from "@/components/article-writer/ArticleWriter";
import GeneratorBanner from "@/components/ads/GeneratorBanner";

export const metadata = {
  title: "Auto Article Writer",
  description:
    "Create a reviewed 1,000–1,600-word article draft with SEO suggestions and three AI illustrations; publication also requires relevant live Blogger links.",
  alternates: { canonical: "/article-writer" },
  robots: { index: false, follow: true },
};

export default function ArticleWriterPage() {
  return (
    <>
      <Navbar />
      <main>
        <GeneratorBanner />
        <Suspense
          fallback={
            <div className="container-x py-24 text-center text-[14px] font-semibold text-neutral-400">
              Loading article writer…
            </div>
          }
        >
          <ArticleWriter />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
