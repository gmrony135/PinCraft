import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AutomationDashboard from "@/components/dashboard/AutomationDashboard";

export const metadata = {
  title: "Automation Dashboard",
  description:
    "Your PinCraft workspace: view pin performance, choose daily auto-post preferences, and review recent activity in one clean dashboard.",
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
