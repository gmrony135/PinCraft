import Link from 'next/link';
import {ArrowRight,ArrowUpRight,CalendarDays,ClipboardCheck,FileText,ImagePlus,KeyRound,Pin,Sparkles} from 'lucide-react';
import {STUDIO_TOOLS,WRITING_TOOLS} from '@/lib/studio-tools.mjs';

const icons={article:FileText,pin:Pin,image:ImagePlus,keywords:KeyRound,plan:CalendarDays,quality:ClipboardCheck};

export default function ContentStudioHub(){
 return <div className="container-x pb-14 pt-8 sm:pb-20 sm:pt-12" data-testid="content-studio-hub">
  <header className="max-w-2xl"><p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand-700"><Sparkles size={15} aria-hidden="true"/>Content Studio</p><h1 className="mt-4 text-[34px] font-extrabold leading-[1.1] tracking-[-0.04em] sm:text-[48px]">What would you like to create?</h1><p className="mt-4 text-[14px] leading-relaxed text-neutral-500">Pick a tool and get straight to work. Each step has its own focused space.</p></header>
  <section className="mt-9" aria-labelledby="studio-writing"><h2 id="studio-writing" className="text-[12px] font-bold text-neutral-500">Start writing</h2><div className="mt-4 grid gap-4 md:grid-cols-2">{WRITING_TOOLS.map(tool=>{
   const Icon=icons[tool.id];
   return <Link key={tool.id} href={tool.href} prefetch={false} aria-label={tool.label} className="group flex min-w-0 flex-col rounded-2xl border border-neutral-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md hover:shadow-neutral-900/5 sm:p-7"><div className="flex items-center justify-between gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700"><Icon size={24} aria-hidden="true"/></span><ArrowUpRight size={19} className="text-neutral-300 transition group-hover:text-brand-600" aria-hidden="true"/></div><p className="mt-6 text-[10px] font-bold uppercase tracking-wider text-neutral-400">{tool.detail}</p><h3 className="mt-2 text-[23px] font-extrabold tracking-tight">{tool.label}</h3><p className="mt-2 max-w-sm text-[13px] leading-relaxed text-neutral-500">{tool.description}</p></Link>;
  })}</div></section>
  <section className="mt-9" aria-labelledby="studio-support"><h2 id="studio-support" className="text-[12px] font-bold text-neutral-500">Plan, create & polish</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{STUDIO_TOOLS.map(tool=>{
   const Icon=icons[tool.id];
   return <Link key={tool.id} href={tool.href} prefetch={false} aria-label={tool.label} className="group flex min-w-0 flex-col rounded-2xl border border-neutral-200 bg-white p-5 transition hover:border-brand-200 hover:shadow-sm"><div className="flex items-center justify-between gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-neutral-50 text-neutral-700"><Icon size={20} aria-hidden="true"/></span><ArrowUpRight size={15} className="text-neutral-300 group-hover:text-brand-600" aria-hidden="true"/></div><h3 className="mt-5 text-[15px] font-extrabold">{tool.label}</h3><p className="mt-2 flex-1 text-[12px] leading-relaxed text-neutral-500">{tool.description}</p><p className="mt-5 text-[10px] font-semibold text-neutral-400">{tool.detail}</p></Link>;
  })}</div></section>
  <div className="mt-8 flex flex-col justify-between gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 sm:flex-row sm:items-center"><p className="text-[12px] leading-relaxed text-neutral-500"><strong className="text-neutral-800">Already have an article?</strong> Review and publish it to your connected Blogger blog. Creating or planning alone never publishes.</p><Link href="/publish" prefetch={false} className="inline-flex min-h-11 shrink-0 items-center gap-2 text-[12px] font-bold text-brand-700">Publish an existing article<ArrowRight size={14} aria-hidden="true"/></Link></div>
 </div>;
}
