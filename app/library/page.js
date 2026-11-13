import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MyLibrary from "@/components/library/MyLibrary";

export const metadata = {
  title: "My Library",
  description: "Your private Full Auto cloud results, plus separate device-saved Pins and Articles. Read full articles, copy Pin content and open confirmed live publications.",
  alternates: { canonical: "/library" },
};

export default function LibraryPage() {
  return (
    <>
      <Navbar />
      <main className="bg-[#fafafa]"><MyLibrary /></main>
      <Footer />
    </>
  );
}
