import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LoginPanel from "@/components/auth/LoginPanel";

export const metadata = { title: "Login", description: "Sign in to PinCraft with Google, or keep creating with the guest tools.", alternates: { canonical: "/login" }, robots: { index: false, follow: true } };

export default function LoginPage() {
  return <><Navbar /><main className="bg-[#fafafa]"><div className="container-x py-10 sm:py-16"><LoginPanel /><section id="setup" className="mx-auto mt-6 max-w-2xl scroll-mt-24 rounded-2xl border border-brand-100 bg-brand-50/40 p-6"><h2 className="text-[17px] font-extrabold text-neutral-900">Google Login setup requirements</h2><p className="mt-2 text-[13px] leading-relaxed text-neutral-600">This is the UI preview. Google sign-in becomes available only after the site owner configures a Google OAuth Web Client ID, adds this website as an authorized JavaScript origin, and sets a private session-signing secret on the server.</p><ul className="mt-4 list-disc space-y-2 pl-4 text-[12px] leading-relaxed text-neutral-600"><li>Authorized origin: <code className="break-all rounded bg-white px-1 py-0.5">https://pincraftly.vercel.app</code></li><li>Server configuration: <code>GOOGLE_CLIENT_ID</code> and <code>AUTH_SESSION_SECRET</code> (at least 32 random characters).</li><li>Google passwords and client secrets must never be entered into this page. There is no fake or local-profile Google login.</li></ul><p className="mt-4 text-[11px] leading-relaxed text-neutral-500">The UI is prepared for a verified Google session. Pinterest posting, blog publishing, live ad reporting, and account-synced storage remain separate integrations.</p></section></div></main><Footer /></>;
}
