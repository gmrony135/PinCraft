import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PinGenerator from "@/components/pin-generator/PinGenerator";

export const metadata = {
  title: "Viral Pin Generator",
  description:
    "Create Pin titles, an SEO description, hashtags and a download-only artwork option. Choose from ten product categories or enter your own topic.",
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
