"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, LoaderCircle, Trash2, Check } from "lucide-react";
import { Panel, fieldClass, primaryClass, secondaryClass } from "@/components/workspace/WorkspaceUI";

const PINTEREST_CREATOR = "https://www.pinterest.com/pin-creation-tool/";

export default function PinQueuePanel() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({ title: "", description: "", link: "", imageUrl: "" });
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/pin-queue", { cache: "no-store", credentials: "same-origin" });
      if (response.status === 401) { setLoadError("Sign in to use your pin queue."); return; }
      if (!response.ok) throw new Error("load");
      setData(await response.json());
      setLoadError("");
    } catch {
      setLoadError("Your pin queue could not be loaded. Try again shortly.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function send(body, key) {
    setBusy(key); setMessage("");
    try {
      const response = await fetch("/api/pin-queue", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage(result.error || "Something went wrong. Please try again."); return false; }
      await load();
      return true;
    } catch {
      setMessage("Network error. Please try again.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function add(event) {
    event.preventDefault();
    if (await send({ action: "add", ...form }, "add")) setForm({ title: "", description: "", link: "", imageUrl: "" });
  }

  const remaining = data?.remaining ?? 0;
  const queued = data?.items.filter(item => item.status === "queued") || [];
  const posted = data?.items.filter(item => item.status === "posted") || [];

  return (
    <Panel title="Pin queue" description="Queue your own pins. PinCraft does not log in to Pinterest or post for you. Open Pinterest's pin creator, upload the image, paste the details, publish, then mark it posted here. You can mark up to 6 pins as posted per day (Dhaka time).">
      {loadError && <p role="alert" className="mt-4 text-[13px] font-semibold text-brand-700">{loadError}</p>}
      {data && (
        <>
          <p className="mt-4 text-[13px] font-bold text-neutral-800" data-testid="pin-queue-status">Posted today: {data.postedToday} of {data.dailyLimit} · Remaining: {remaining}</p>

          <form className="mt-5 grid gap-3 md:grid-cols-2" onSubmit={add}>
            <label className="block text-[12px] font-bold">Title<input required maxLength={100} className={`${fieldClass} mt-1.5`} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
            <label className="block text-[12px] font-bold">Destination link (https)<input required type="url" maxLength={2000} className={`${fieldClass} mt-1.5`} value={form.link} onChange={e => setForm({ ...form, link: e.target.value })} /></label>
            <label className="block text-[12px] font-bold md:col-span-2">Description<textarea maxLength={500} rows={2} className={`${fieldClass} mt-1.5`} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
            <label className="block text-[12px] font-bold md:col-span-2">Image link (https)<input required type="url" maxLength={2000} className={`${fieldClass} mt-1.5`} value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })} /></label>
            <div className="md:col-span-2"><button type="submit" disabled={busy === "add"} className={primaryClass}>{busy === "add" ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : null}Add to queue</button></div>
          </form>

          {message && <p role="alert" className="mt-3 text-[12px] font-semibold text-brand-700">{message}</p>}

          <h3 className="mt-7 text-[14px] font-extrabold">Ready to post ({queued.length})</h3>
          {queued.length === 0 && <p className="mt-2 text-[12px] text-neutral-500">Nothing queued. Add a pin above.</p>}
          <ul className="mt-3 grid gap-3">
            {queued.map(item => (
              <li key={item.id} className="flex flex-wrap gap-4 rounded-xl border border-neutral-200 p-4">
                <img src={item.imageUrl} alt="" width={96} height={128} loading="lazy" referrerPolicy="no-referrer" className="h-32 w-24 shrink-0 rounded-lg bg-neutral-100 object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[14px] font-extrabold">{item.title}</p>
                  {item.description && <p className="mt-1 break-words text-[12px] text-neutral-600">{item.description}</p>}
                  <p className="mt-1 break-all text-[11px] text-neutral-500">Link: {item.link}</p>
                  <p className="mt-1 break-all text-[11px] text-neutral-500">Image: <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" className="underline">open image</a> (save it, then upload in Pinterest)</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={PINTEREST_CREATOR} target="_blank" rel="noopener noreferrer" className={secondaryClass}>Open Pinterest pin creator<ExternalLink size={13} aria-hidden="true" /></a>
                    <button type="button" disabled={remaining === 0 || busy === item.id} onClick={() => send({ action: "posted", id: item.id }, item.id)} className={primaryClass}><Check size={13} aria-hidden="true" />Mark as posted</button>
                    <button type="button" disabled={busy === item.id} onClick={() => send({ action: "remove", id: item.id }, item.id)} className={secondaryClass}><Trash2 size={13} aria-hidden="true" />Remove</button>
                  </div>
                  {remaining === 0 && <p className="mt-2 text-[11px] text-neutral-500">Daily limit reached. You can mark this pin tomorrow.</p>}
                </div>
              </li>
            ))}
          </ul>

          {posted.length > 0 && <p className="mt-6 text-[12px] text-neutral-500">Posted: {posted.length} pin(s) in your recent queue.</p>}
        </>
      )}
      {!data && !loadError && <p className="mt-4 flex items-center gap-2 text-[12px] text-neutral-500"><LoaderCircle size={13} className="animate-spin" aria-hidden="true" />Loading your queue…</p>}
    </Panel>
  );
}
