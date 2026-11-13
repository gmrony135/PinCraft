import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ArticleWriter from "@/components/article-writer/ArticleWriter";

export const metadata = {
  title: "Auto Article Writer",
  description:
    "PinCraft writes a full 500–800 word SEO blog article for your pin automatically — headline, intro, sub-headings, quotes list and conclusion.",
  alternates: { canonical: "/article-writer" },
};

export default function ArticleWriterPage() {
  return (
    <>
      <Navbar />
      <main>
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
