import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PinGenerator from "@/components/pin-generator/PinGenerator";

export const metadata = {
  title: "Viral Pin Generator",
  description:
    "Explore ten product categories, create Pin titles and descriptions, or generate download-only 1000 × 1500 artwork without creating Pin copy first.",
  alternates: { canonical: "/pin-generator" },
};

export default function PinGeneratorPage() {
  return (
    <>
      <Navbar />
      <main>
        <PinGenerator />
      </main>
      <Footer />
    </>
  );
}
