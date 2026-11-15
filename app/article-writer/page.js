import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ArticleWriter from "@/components/article-writer/ArticleWriter";

export const metadata = {
  title: "Auto Article Writer",
  description:
    "Create a reviewed 1,000–1,600-word article draft with SEO suggestions and three AI illustrations; publication also requires relevant live Blogger links.",
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
