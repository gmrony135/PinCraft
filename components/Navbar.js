"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Logo } from "./Brand";
import { Menu, X } from "lucide-react";

export const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Pin Generator", href: "/pin-generator" },
  { label: "Article Writer", href: "/article-writer" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "My Library", href: "/library" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // lock body scroll when the mobile menu is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b transition-all duration-200 ${
        scrolled
          ? "border-neutral-200/80 bg-white/85 backdrop-blur-xl"
          : "border-transparent bg-white"
      }`}
    >
      <nav className="container-x flex h-16 items-center justify-between gap-4">
        <Logo />

        {/* Desktop nav */}
        <ul className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                prefetch={false}
                className={`rounded-lg px-3.5 py-2 text-[14.5px] font-semibold transition-colors ${
                  l.href === "/"
                    ? "text-neutral-900"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                }`}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Link href="/login" prefetch={false} className="btn-primary btn-sm hidden sm:inline-flex">
            Login
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="grid h-11 w-11 place-items-center rounded-xl border-2 border-neutral-200 text-neutral-700 active:bg-neutral-50 lg:hidden"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="animate-fade-in border-t border-neutral-100 bg-white lg:hidden">
          <div className="container-x flex flex-col py-3">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                prefetch={false}
                onClick={() => setOpen(false)}
                className="flex min-h-[46px] items-center rounded-xl px-3 text-[15.5px] font-semibold text-neutral-800 active:bg-neutral-50"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/login"
              prefetch={false}
              onClick={() => setOpen(false)}
              className="btn-primary mt-2"
            >
              Login
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
