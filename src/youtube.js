// YouTube transcript via the public player API (Android client): no API key, no download of the video itself.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const FALLBACK_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"; // YouTube's public web client key

export function parseVideoId(input) {
  const s = String(input || "").trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.endsWith("youtu.be")) return u.pathname.slice(1, 12);
    if (u.searchParams.get("v")) return u.searchParams.get("v").slice(0, 11);
    const m = u.pathname.match(/\/(shorts|embed|live|v)\/([\w-]{11})/);
    if (m) return m[2];
  } catch {}
  throw new Error("Not a YouTube video URL or ID: " + s);
}
const decode = (t) => t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/\s+/g, " ").trim();
export const clock = (sec) => { sec = Math.floor(sec); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0"); };

async function player(id) {
  let key = FALLBACK_KEY;
  try { const page = await (await fetch("https://www.youtube.com/watch?v=" + id, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } })).text(); key = (page.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1] || key; } catch {}
  const res = await fetch("https://www.youtube.com/youtubei/v1/player?key=" + key, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 14)" },
    body: JSON.stringify({ context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", hl: "en" } }, videoId: id }) });
  if (!res.ok) throw new Error("YouTube player request failed: HTTP " + res.status);
  return res.json();
}

/** Returns { meta, languages, language, segments:[{start,dur,text}] } */
export async function getTranscript(input, { lang } = {}) {
  const id = parseVideoId(input), pr = await player(id);
  const st = pr.playabilityStatus || {};
  if (st.status && st.status !== "OK") throw new Error("Video not available: " + (st.reason || st.status));
  const vd = pr.videoDetails || {}, tracks = pr.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const meta = { id, url: "https://www.youtube.com/watch?v=" + id, title: vd.title, channel: vd.author, seconds: +vd.lengthSeconds || 0, views: +vd.viewCount || 0 };
  const languages = tracks.map((t) => ({ code: t.languageCode, name: t.name?.runs?.[0]?.text || t.name?.simpleText || t.languageCode, auto: t.kind === "asr" }));
  if (!tracks.length) throw new Error("This video has no captions (neither uploaded nor auto-generated), so there is no transcript to extract.");
  const pick = (lang && tracks.find((t) => t.languageCode === lang && t.kind !== "asr")) || (lang && tracks.find((t) => t.languageCode.startsWith(lang)))
    || tracks.find((t) => t.kind !== "asr" && t.languageCode.startsWith("en")) || tracks.find((t) => t.kind !== "asr") || tracks[0];
  const url = pick.baseUrl.replace(/&fmt=\w+/, "");
  const xml = await (await fetch(url, { headers: { "User-Agent": UA } })).text();
  const segments = [...xml.matchAll(/<text start="([\d.]+)"(?: dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g)].map((m) => ({ start: +m[1], dur: +(m[2] || 0), text: decode(m[3]) })).filter((s) => s.text);
  if (!segments.length) throw new Error("YouTube returned an empty transcript for this video (it may be restricted). Try again later.");
  return { meta, languages, language: pick.languageCode + (pick.kind === "asr" ? " (auto-generated)" : ""), segments };
}

/** Markdown for LLMs: metadata header, then paragraphs every ~`every` seconds with [mm:ss] links. */
export function transcriptMarkdown(t, { timestamps = true, every = 30 } = {}) {
  const head = ["# " + (t.meta.title || t.meta.id), "", "- Channel: " + (t.meta.channel || "?"), "- URL: " + t.meta.url, "- Duration: " + clock(t.meta.seconds), "- Transcript language: " + t.language,
    "- Other caption languages: " + (t.languages.map((l) => l.code + (l.auto ? "*" : "")).join(", ") || "none"), "", "## Transcript", ""];
  const paras = []; let cur = null;
  for (const s of t.segments) { if (!cur || s.start - cur.start >= every) { cur = { start: s.start, parts: [] }; paras.push(cur); } cur.parts.push(s.text); }
  const body = paras.map((p) => (timestamps ? `[${clock(p.start)}](${t.meta.url}&t=${Math.floor(p.start)}s) ` : "") + p.parts.join(" "));
  return head.concat(body.join("\n\n")).join("\n");
}
