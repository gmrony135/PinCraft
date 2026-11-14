import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MyLibrary from "@/components/library/MyLibrary";

export const metadata = {
  title: "My Library",
  description: "Your private saved articles and Pins, separate device drafts, and confirmed Blogger publication links.",
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
