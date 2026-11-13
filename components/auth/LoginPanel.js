"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { useAuth } from "../providers/AppProvider";
import GoogleMark from "./GoogleMark";

export default function LoginPanel() {
  const { user, openLogin } = useAuth();
  return (
    <section className="mx-auto max-w-2xl rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-9">
      <span className="eyebrow"><ShieldCheck size={14} aria-hidden="true" /> Your PinCraft account</span>
      <h1 className="mt-5 text-[32px] font-extrabold leading-tight tracking-[-0.04em] sm:text-[42px]">{user ? `Welcome, ${user.name}` : "A simpler way to create."}</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-neutral-500">Create pins, write articles, and keep your ideas together. You can use the guest tools now; Google sign-in uses Firebase Authentication after the site owner completes Firebase setup. Signed-in saves use your private Firestore Library.</p>
      {user ? <Link href="/library" prefetch={false} className="btn-primary mt-6"><CheckCircle2 size={17} /> Open My Library</Link> : <button type="button" onClick={openLogin} className="btn-primary mt-6 w-full sm:w-auto"><span className="grid h-7 w-7 place-items-center rounded-full bg-white"><GoogleMark size={17} /></span> Login with Google</button>}
      <Link href="/pin-generator" prefetch={false} className="ml-0 mt-3 inline-flex min-h-11 items-center gap-2 px-2 text-[12px] font-bold text-neutral-600 sm:ml-3">Continue as a guest <ArrowRight size={14} aria-hidden="true" /></Link>
    </section>
  );
}
