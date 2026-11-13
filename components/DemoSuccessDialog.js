"use client";

import Link from "next/link";
import { ArrowRight, Check, FlaskConical, X } from "lucide-react";
import Modal from "./Modal";

export default function DemoSuccessDialog({ title, description, href, linkLabel, onClose }) {
  return (
    <Modal titleId="demo-success-title" onClose={onClose}>
      <div className="relative p-6 sm:p-8">
        <button type="button" aria-label="Close confirmation" onClick={onClose} autoFocus className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-xl text-neutral-500 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"><X aria-hidden="true" size={18} /></button>
        <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/20"><Check aria-hidden="true" size={27} strokeWidth={2.5} /></div>
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-brand-800"><FlaskConical aria-hidden="true" size={12} /> Demo preview</p>
        <h2 id="demo-success-title" className="text-[25px] font-extrabold leading-tight tracking-[-0.03em] text-neutral-900 [overflow-wrap:anywhere] sm:text-[28px]">{title}</h2>
        <p className="mt-3 text-[13px] leading-relaxed text-neutral-600">{description}</p>
        <div className="mt-6 flex flex-col gap-2.5">
          {href && <Link href={href} prefetch={false} onClick={onClose} className="btn-primary w-full text-[14px]">{linkLabel || "Continue"} <ArrowRight aria-hidden="true" size={16} /></Link>}
          <button type="button" onClick={onClose} className="btn-outline w-full text-[13px]">Got it</button>
        </div>
      </div>
    </Modal>
  );
}
