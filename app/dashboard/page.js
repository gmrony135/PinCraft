import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AutomationDashboard from "@/components/dashboard/AutomationDashboard";

export const metadata = {
  title: "Automation Dashboard",
  description:
    "Configure real server-side Full Auto Mode: AI content, external blog publication, Pinterest posting and private cloud Library, with setup checks and provider-confirmed logs.",
  alternates: { canonical: "/dashboard" },
};

export default function DashboardPage() {
  return (
    <>
      <Navbar />
      <main className="bg-[#fafafa]">
        <AutomationDashboard />
      </main>
      <Footer />
    </>
  );
}
