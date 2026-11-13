"use client";

import { useRef } from "react";
import useDialog from "../useDialog";
import Link from "next/link";
import { BookOpen, Clock3, FileText, Info, X } from "lucide-react";
import ContentCopyButton from "./ContentCopyButton";

function RichText({ value }) {
  return String(value || "").split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith("**") && part.endsWith("**") ? <strong key={index} className="font-bold text-neutral-900">{part.slice(2, -2)}</strong> : part);
}

function PlainArticle({ text, title }) {
  return text.split(/\n\s*\n/).filter(Boolean).map((block, index) => {
    if (block.trim() === `# ${title}`) return null;
    if (/^#{1,6}\s/.test(block)) return <h3 key={index} className="pt-3 text-[20px] font-extrabold leading-snug tracking-tight text-neutral-900">{block.replace(/^#{1,6}\s+/, "")}</h3>;
    const lines = block.split("\n");
    if (lines.every((line) => /^[-*]\s/.test(line))) return <ul key={index} className="list-disc space-y-2 pl-5">{lines.map((line, i) => <li key={i}><RichText value={line.replace(/^[-*]\s+/, "")} /></li>)}</ul>;
    return <p key={index} className="whitespace-pre-line"><RichText value={block} /></p>;
  });
}

export default function ArticleReader({ article, onClose }) {
  const dialogRef = useRef(null);

  useDialog(dialogRef);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="library-reader-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-1.5rem)] max-w-3xl overflow-hidden rounded-2xl border border-neutral-200 bg-white p-0 text-neutral-800 shadow-2xl backdrop:bg-neutral-900/55 backdrop:backdrop-blur-sm sm:w-[calc(100%-3rem)]"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-100 bg-white px-4 py-3 sm:px-6">
          <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-600"><BookOpen aria-hidden="true" size={16} className="shrink-0 text-brand-600" /><span className="hidden sm:inline">Article reader</span><span className="sm:hidden">Reader</span></span>
          <div className="flex items-center gap-1.5">
            {article.plainText && <ContentCopyButton text={article.plainText} label="Copy article" ariaLabel="Copy full library article" compact />}
            <button type="button" onClick={onClose} aria-label="Close article" autoFocus className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-neutral-500 outline-none transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-brand-600"><X aria-hidden="true" size={20} /></button>
          </div>
        </div>

        <div data-testid="article-reader-scroll" className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-8 pt-6 sm:px-9 sm:pb-10 sm:pt-8">
          <article className="[overflow-wrap:anywhere]">
            <div className="flex flex-wrap items-center gap-2 text-[10.5px] font-semibold">
              <span className="rounded-full bg-brand-50 px-2.5 py-1.5 text-brand-700">{article.category}</span>
              <span className="inline-flex items-center gap-1 text-neutral-500"><Clock3 aria-hidden="true" size={12} /> {article.readMinutes} min read</span>
              <span className="inline-flex items-center gap-1 text-neutral-500"><FileText aria-hidden="true" size={12} /> {article.wordCount.toLocaleString("en-US")} words</span>
            </div>
            <h2 id="library-reader-title" className="mt-4 text-[26px] font-extrabold leading-[1.18] tracking-[-0.035em] text-neutral-900 sm:text-[34px]">{article.title}</h2>
            <p className="mb-6 mt-3 border-b border-neutral-100 pb-5 text-[11px] text-neutral-500">{article.isDemo ? "Demo article · Preview content, not saved to your library" : article.storage === "cloud" ? "From your private Cloud Library · Stored in Firestore" : "From your saved library · Stored on this device"}</p>

            {article.structured ? (
              <>
                {article.intro && <p className="text-[16px] leading-[1.85] text-neutral-700 sm:text-[17px]"><RichText value={article.intro} /></p>}
                {article.sections.map((section, index) => <section key={index} className="mt-7"><h3 className="text-[20px] font-extrabold leading-snug tracking-tight text-neutral-900 sm:text-[21px]">{section.heading}</h3><div className="mt-3 space-y-3.5">{section.paragraphs.map((paragraph, i) => <p key={i} className="text-[15px] leading-[1.85] text-neutral-700 sm:text-[16px]"><RichText value={paragraph} /></p>)}</div></section>)}
                {article.listSection?.items.length > 0 && <section className="mt-7 rounded-2xl border border-brand-100 bg-brand-50/40 p-4 sm:p-5"><h3 className="text-[19px] font-extrabold leading-snug tracking-tight text-neutral-900">{article.listSection.heading || "Ideas to save"}</h3>{article.listSection.intro && <p className="mt-2 text-[12px] font-medium leading-relaxed text-brand-800"><RichText value={article.listSection.intro} /></p>}<ul className="mt-4 list-disc space-y-2.5 pl-4 text-[15px] leading-relaxed text-neutral-700 marker:text-brand-600">{article.listSection.items.map((item, index) => <li key={index}><RichText value={item} /></li>)}</ul></section>}
                {article.conclusion && <section className="mt-7"><h3 className="text-[20px] font-extrabold tracking-tight text-neutral-900">Final thoughts</h3><p className="mt-3 text-[15px] leading-[1.85] text-neutral-700 sm:text-[16px]"><RichText value={article.conclusion} /></p></section>}
              </>
            ) : article.plainText ? (
              <div className="space-y-4 text-[15px] leading-[1.85] text-neutral-700 sm:text-[16px]"><PlainArticle text={article.plainText} title={article.title} /></div>
            ) : (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4"><p className="flex items-start gap-2 text-[13px] leading-relaxed text-neutral-600"><Info aria-hidden="true" size={16} className="mt-0.5 shrink-0" />This saved item contains a title, but no article body. You can write the full post in Article Writer.</p><Link href={`/article-writer?title=${encodeURIComponent(article.title)}`} prefetch={false} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-4 text-[12px] font-bold text-white">Write this article</Link></div>
            )}
          </article>
        </div>
      </div>
    </dialog>
  );
}
