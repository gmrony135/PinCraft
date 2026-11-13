import Link from "next/link";
import { Logo } from "./Brand";

const LINKS = [
  { label: "Home", href: "/" },
  { label: "Pin Generator", href: "/pin-generator" },
  { label: "Article Writer", href: "/article-writer" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "My Library", href: "/library" },
  { label: "Adsterra Income", href: "/adsterra-income" },
];

export default function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-white">
      <div className="container-x py-11">
        <div className="grid gap-9 md:grid-cols-[1.4fr_1fr_1fr]">
          {/* brand */}
          <div>
            <Logo />
            <p className="mt-3 max-w-sm text-[13.5px] leading-relaxed text-neutral-500">
              Your Pinterest content workspace. Create pin ideas, write SEO
              articles, and keep your publishing plan together.
            </p>
            <p className="mt-2 max-w-sm text-[11px] leading-relaxed text-neutral-500">Guest saves are device-only. Signed-in drafts use private Firestore. Live publishing requires provider consent and server setup.</p>
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-neutral-50 px-3 py-1.5 text-[11.5px] font-bold text-neutral-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Built for beginners · Free to start
            </p>
          </div>

          {/* product */}
          <div>
            <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-400">
              Product
            </h3>
            <ul className="mt-1 space-y-0">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    prefetch={false}
                    className="flex min-h-[42px] items-center text-[13.5px] font-semibold text-neutral-600 transition-colors hover:text-brand-600"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* company */}
          <div>
            <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-400">
              Company
            </h3>
            <ul className="mt-1 space-y-0">
              {[
                { label: "About", href: "/about" },
                { label: "Contact", href: "/contact" },
                { label: "Login", href: "/login" },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    prefetch={false}
                    className="flex min-h-[42px] items-center text-[13.5px] font-semibold text-neutral-600 transition-colors hover:text-brand-600"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-9 flex flex-col items-center justify-between gap-3 border-t border-neutral-100 pt-6 sm:flex-row">
          <p className="text-[12.5px] text-neutral-400">
            © {new Date().getFullYear()} PinCraft. All rights reserved.
          </p>
          <p className="text-[12.5px] font-semibold text-neutral-400">
            Pin Create · Article Write · Plan Posts
          </p>
        </div>
      </div>
    </footer>
  );
}
