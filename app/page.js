import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Features from "@/components/Features";
import IncomeFormula from "@/components/IncomeFormula";
import Footer from "@/components/Footer";
import WelcomePopup from "@/components/WelcomePopup";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <WelcomePopup />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <IncomeFormula />
      </main>
      <Footer />
    </>
  );
}
