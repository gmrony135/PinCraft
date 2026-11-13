import { ImageResponse } from "next/og";
import { getDatabase } from "@/lib/automation/db.mjs";
import { validImageSignature, validJobId } from "@/lib/automation/images.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(request, { params }) {
  const { id } = await params;
  if (!validJobId(id) || !validImageSignature(id, new URL(request.url).searchParams.get("sig") || "")) return new Response("Image not found", { status: 404 });
  try {
    const job = (await getDatabase().query("SELECT topic,content->>'title' AS title FROM pincraft_auto_jobs WHERE id=$1 AND content IS NOT NULL", [id])).rows[0];
    if (!job?.title) return new Response("Image not found", { status: 404 });
    const dark = parseInt(id.slice(0, 2), 16) % 2 === 1;
    const background = dark ? "#111111" : "#fff8f6";
    const foreground = dark ? "#ffffff" : "#111111";
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background, color: foreground, padding: "88px 80px", fontFamily: "sans-serif", position: "relative" }}>
        <div style={{ position: "absolute", right: -220, top: -190, width: 680, height: 680, display: "flex", borderRadius: "50%", background: dark ? "#30101b" : "#ffe5e5" }} />
        <div style={{ display: "flex", color: "#e60023", fontSize: 26, fontWeight: 700, letterSpacing: 5, marginBottom: 80 }}>PINCRAFT</div>
        <div style={{ display: "flex", fontSize: 24, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: dark ? "#ffc8d0" : "#8c1426", maxWidth: 800 }}>{job.topic.slice(0, 80)}</div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", fontSize: job.title.length > 75 ? 86 : 102, fontWeight: 700, lineHeight: 1.12, letterSpacing: -3, maxWidth: 840 }}>{job.title}</div>
        <div style={{ display: "flex", height: 8, width: 100, background: "#e60023", marginBottom: 55 }} />
        <div style={{ display: "flex", fontSize: 24, lineHeight: 1.5, maxWidth: 700, color: dark ? "#d2c5c8" : "#5b4b4f" }}>A fresh perspective. A little inspiration.<br />Read the full story.</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: `1px solid ${dark ? "#48343a" : "#e1c9ce"}`, marginTop: 75, paddingTop: 35, fontSize: 20, color: dark ? "#d2c5c8" : "#5b4b4f" }}><span>Ideas worth saving</span><span style={{ color: "#e60023", fontWeight: 700 }}>READ MORE →</span></div>
      </div>,
      { width: 1000, height: 1500, headers: { "Cache-Control": "public, max-age=86400, immutable", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" } }
    );
  } catch { return new Response("Image service unavailable", { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
