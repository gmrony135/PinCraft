import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdsterraIncome from "@/components/income/AdsterraIncome";

export const metadata = {
  title: "Adsterra Income",
  description: "Review your PinCraft income overview, save your Adsterra ad code locally, and explore a five-day demo traffic and earnings report.",
  alternates: { canonical: "/adsterra-income" },
};

export default function AdsterraIncomePage() {
  return (
    <>
      <Navbar />
      <main className="bg-[#fafafa]"><AdsterraIncome /></main>
      <Footer />
    </>
  );
}
