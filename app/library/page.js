import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MyLibrary from "@/components/library/MyLibrary";

export const metadata = {
  title: "My Library",
  description: "All your saved PinCraft pins and articles in one place. Copy a pin title, open a full article, or explore six examples in each collection.",
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
