import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PinGenerator from "@/components/pin-generator/PinGenerator";

export const metadata = {
  title: "Viral Pin Generator",
  description:
    "Just type your topic — PinCraft instantly creates 5 viral pin titles, an SEO description, 10 hashtags and a pin image idea.",
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
