// YouTube playlist / channel -> list of videos (handles both the new lockupViewModel and legacy playlistVideoRenderer layouts).
import { getTranscript, transcriptMarkdown, clock } from "./youtube.js";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const get = async (u) => (await fetch(u, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } })).text();

/** Accepts a playlist URL/ID, a channel URL (/@handle, /channel/UC…) or a UC… id. Channels map to their uploads playlist (UU…). */
export async function resolvePlaylistId(input) {
  const s = String(input || "").trim();
  if (/^(PL|UU|OL|LL|FL|RD)[\w-]{10,}$/.test(s)) return s;
  if (/^UC[\w-]{22}$/.test(s)) return "UU" + s.slice(2);
  let u; try { u = new URL(s.startsWith("@") ? "https://www.youtube.com/" + s : s); } catch { throw new Error("Not a YouTube playlist or channel: " + s); }
  if (u.searchParams.get("list")) return u.searchParams.get("list");
  const ch = u.pathname.match(/\/channel\/(UC[\w-]{22})/); if (ch) return "UU" + ch[1].slice(2);
  if (/^\/(@[^/]+|c\/[^/]+|user\/[^/]+)/.test(u.pathname)) { const html = await get("https://www.youtube.com" + u.pathname.split("/").slice(0, u.pathname.startsWith("/@") ? 2 : 3).join("/"));
    const id = (html.match(/"externalId":"(UC[\w-]{22})"/) || html.match(/"channelId":"(UC[\w-]{22})"/) || [])[1]; if (id) return "UU" + id.slice(2); }
  throw new Error("Could not find a playlist or channel in: " + s);
}
function walk(node, out, cont) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const x of node) walk(x, out, cont); return; }
  const lv = node.lockupViewModel;
  if (lv && lv.contentId && /^[\w-]{11}$/.test(lv.contentId)) {
    const meta = lv.metadata?.lockupMetadataViewModel, ov = JSON.stringify(lv.contentImage || {}), dur = (ov.match(/"text":"(\d{1,2}(?::\d{2}){1,2})"/) || [])[1] || "";
    out.push({ id: lv.contentId, title: meta?.title?.content || "", duration: dur });
  }
  const pv = node.playlistVideoRenderer;
  if (pv && pv.videoId) out.push({ id: pv.videoId, title: pv.title?.runs?.[0]?.text || pv.title?.simpleText || "", duration: pv.lengthText?.simpleText || "" });
  const c = node.continuationCommand?.token || node.continuationEndpoint?.continuationCommand?.token; if (c) cont.push(c);
  for (const k in node) if (k !== "lockupViewModel" && k !== "playlistVideoRenderer") walk(node[k], out, cont);
}
/** Returns { id, url, title, videos:[{id,title,duration,url}] } (up to `limit` videos). */
export async function getPlaylist(input, { limit = 50 } = {}) {
  const id = await resolvePlaylistId(input), url = "https://www.youtube.com/playlist?list=" + id;
  const html = await get(url), m = html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s);
  if (!m) throw new Error("YouTube did not return this playlist (it may be private or region-locked).");
  const data = JSON.parse(m[1]), s = m[1];
  const title = (s.match(/"pageHeaderViewModel":\{"title":\{"dynamicTextViewModel":\{"text":\{"content":"([^"]+)"/) || s.match(/"title":\{"simpleText":"([^"]+)"/) || [])[1] || id;
  const key = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1], ver = (html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) || [])[1] || "2.20260101.00.00";
  const vids = [], cont = []; walk(data, vids, cont);
  const seen = new Set(); let list = vids.filter((v) => !seen.has(v.id) && seen.add(v.id));
  for (let page = 0; page < 20 && list.length < limit && cont.length && key; page++) {
    const r = await (await fetch("https://www.youtube.com/youtubei/v1/browse?key=" + key, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: ver, hl: "en" } }, continuation: cont.pop() }) })).json();
    const more = [], next = []; walk(r, more, next); cont.length = 0; cont.push(...next);
    const add = more.filter((v) => !seen.has(v.id) && seen.add(v.id)); if (!add.length) break; list = list.concat(add);
  }
  if (!list.length) throw new Error("No videos found in this playlist.");
  return { id, url, title, videos: list.slice(0, limit).map((v) => ({ ...v, url: "https://www.youtube.com/watch?v=" + v.id })) };
}
export function playlistMarkdown(p) {
  return ["# " + p.title, "", "- Playlist: " + p.url, "- Videos listed: " + p.videos.length, "", "| # | Title | Length | Link |", "|---|---|---|---|",
    ...p.videos.map((v, i) => `| ${i + 1} | ${v.title.replace(/\|/g, "/")} | ${v.duration || ""} | ${v.url} |`), "", "Tip: call youtube_transcript on any of these, or youtube_playlist with transcripts=true to get them all."].join("\n");
}
/** All transcripts of the playlist in one Markdown document (knowledge base). Videos without captions are listed as skipped. */
export async function playlistTranscripts(p, { max = 10, timestamps = true, maxChars = Infinity } = {}) {
  const parts = [], skipped = [], deferred = []; let size = 0;
  for (const v of p.videos.slice(0, max)) {
    if (size >= maxChars) { deferred.push(v); continue; }
    try { let md = transcriptMarkdown(await getTranscript(v.id), { timestamps }).replace(/^# /, "## ").replace(/^## Transcript$/m, "### Transcript");
      if (parts.length && size + md.length > maxChars) { deferred.push(v); size = maxChars; continue; }
      if (md.length > maxChars - size) md = md.slice(0, Math.max(2000, maxChars - size)) + "\n\n…[transcript truncated to fit the size limit – call youtube_transcript with " + v.url + " for the full text]";
      parts.push(md); size += md.length; }
    catch (e) { skipped.push(v.title + " – " + e.message.split(".")[0]); }
  }
  return ["# " + p.title + " – transcripts", "", "- Playlist: " + p.url, "- Included: " + parts.length + " of " + Math.min(max, p.videos.length) + " videos" + (p.videos.length > max ? " (first " + max + " of " + p.videos.length + ")" : ""),
    ...(skipped.length ? ["- Skipped (no captions): " + skipped.join("; ")] : []),
    ...(deferred.length ? ["- Not included to stay within the size limit – fetch these with youtube_transcript: " + deferred.map((v) => v.title + " (" + v.url + ")").join("; ")] : []), "", ...parts.map((x) => x + "\n\n---\n")].join("\n");
}
export { clock };
