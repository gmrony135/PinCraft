"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, ChevronDown, Library, LogOut, Menu, X } from "lucide-react";
import { Logo } from "./Brand";
import { useAuth } from "./providers/AppProvider";
import GoogleMark from "./auth/GoogleMark";

export const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Pin Generator", href: "/pin-generator" },
  { label: "Article Writer", href: "/article-writer" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "My Library", href: "/library" },
  { label: "Income", href: "/adsterra-income" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { user, openLogin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuButton = useRef(null);
  const account = useRef(null);
  const accountButton = useRef(null);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update(); window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  useEffect(() => { setOpen(false); setAccountOpen(false); }, [pathname]);
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1280px)");
    const collapse = () => { if (wide.matches) setOpen(false); };
    wide.addEventListener("change", collapse);
    return () => wide.removeEventListener("change", collapse);
  }, []);
  useEffect(() => {
    const clickOutside = (event) => { if (!account.current?.contains(event.target)) setAccountOpen(false); };
    const escape = (event) => { if (event.key === "Escape") { if (open) { setOpen(false); menuButton.current?.focus(); } if (accountOpen) { setAccountOpen(false); accountButton.current?.focus(); } } };
    document.addEventListener("pointerdown", clickOutside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", clickOutside); document.removeEventListener("keydown", escape); };
  }, [accountOpen, open]);

  function login() { setOpen(false); setAccountOpen(false); openLogin(); }
  async function logout() { setSigningOut(true); const ok = await signOut(); if (ok) setAccountOpen(false); setSigningOut(false); }
  const linkClass = (href, mobile = false) => `${mobile ? "flex min-h-11 items-center gap-2 rounded-xl px-3 text-[14px]" : "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[13px]"} font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 ${pathname === href ? "bg-brand-50 text-brand-700" : user && href === "/library" ? "text-brand-700 hover:bg-brand-50" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"}`;

  return (
    <header className={`sticky top-0 z-50 w-full border-b transition-colors ${scrolled ? "border-neutral-200/80 bg-white/95 backdrop-blur-xl" : "border-transparent bg-white"}`}>
      <nav aria-label="Main navigation" className="container-x flex h-16 items-center justify-between gap-2 sm:gap-3">
        <Logo size={28} className="shrink-0 !gap-1.5 [&>span]:!text-[18px] sm:!gap-2.5 sm:[&>span]:!text-[21px]" />
        <ul className="hidden items-center gap-0.5 xl:flex">
          {NAV_LINKS.map((link) => <li key={link.href}><Link href={link.href} prefetch={false} aria-current={pathname === link.href ? "page" : undefined} className={linkClass(link.href)}>{link.label}{user && link.href === "/library" && <CheckCircle2 aria-hidden="true" size={12} />}</Link></li>)}
        </ul>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {user ? <div ref={account} className="relative">
            <button ref={accountButton} type="button" onClick={() => { setAccountOpen((value) => !value); setOpen(false); }} aria-label={`Account: ${user.name}`} aria-expanded={accountOpen} aria-controls="account-options" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-brand-100 bg-brand-50/50 px-2 text-[12px] font-bold text-neutral-800 outline-none focus-visible:ring-2 focus-visible:ring-brand-600 sm:gap-2 sm:px-3"><span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-[10px] font-extrabold text-white">{user.name.trim().slice(0, 1).toUpperCase()}</span><span className="max-w-[48px] truncate sm:max-w-[120px]">{user.name}</span><ChevronDown aria-hidden="true" size={13} className="hidden sm:block" /></button>
            {accountOpen && <div id="account-options" className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-neutral-200 bg-white p-2 shadow-xl"><div className="border-b border-neutral-100 px-3 py-3"><p className="truncate text-[12px] font-bold text-neutral-800">{user.name}</p><p className="mt-1 truncate text-[11px] text-neutral-500">Firebase-verified Google session</p></div><Link href="/library" prefetch={false} onClick={() => setAccountOpen(false)} className="mt-1 flex min-h-11 items-center gap-2 rounded-xl px-3 text-[12px] font-bold text-neutral-700 hover:bg-neutral-50"><Library size={15} aria-hidden="true" /> My Library</Link><button type="button" onClick={logout} disabled={signingOut} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-[12px] font-bold text-brand-700 hover:bg-brand-50 disabled:opacity-50"><LogOut size={15} aria-hidden="true" />{signingOut ? "Signing out…" : "Sign out"}</button></div>}
          </div> : <button type="button" onClick={login} aria-label="Login with Google" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-2.5 text-[12px] font-bold text-white shadow-sm shadow-brand-600/20 outline-none transition-colors hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 sm:gap-2 sm:px-4"><span className="grid h-5 w-5 place-items-center rounded-full bg-white"><GoogleMark size={13} /></span><span className="hidden sm:inline">Login with Google</span><span className="sm:hidden">Login</span></button>}
          <button ref={menuButton} type="button" onClick={() => { setOpen((value) => !value); setAccountOpen(false); }} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-navigation" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-neutral-200 text-neutral-700 outline-none hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-brand-600 xl:hidden">{open ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}</button>
        </div>
      </nav>
      {open && <div id="mobile-navigation" className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-neutral-100 bg-white xl:hidden"><div className="container-x flex flex-col gap-1 py-3">{NAV_LINKS.map((link) => <Link key={link.href} href={link.href} prefetch={false} onClick={() => setOpen(false)} aria-current={pathname === link.href ? "page" : undefined} className={linkClass(link.href, true)}>{link.label}{user && link.href === "/library" && <CheckCircle2 aria-hidden="true" size={13} />}</Link>)}{!user && <button type="button" onClick={login} className="btn-primary mt-2 gap-2 text-[14px]"><span className="grid h-6 w-6 place-items-center rounded-full bg-white"><GoogleMark size={15} /></span>Login with Google</button>}</div></div>}
    </header>
  );
}
