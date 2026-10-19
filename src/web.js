// Web page -> clean Markdown (Readability main-content extraction + Turndown).
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

export async function pageToMarkdown(url, { maxChars = 60000 } = {}) {
  const u = new URL(url); if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) URLs are supported.");
  const res = await fetch(u, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8" }, redirect: "follow" });
  if (!res.ok) throw new Error("Fetch failed: HTTP " + res.status);
  const type = res.headers.get("content-type") || "";
  if (!/html|xml/.test(type)) throw new Error("This URL is " + type.split(";")[0] + ", not a web page. (PDF support is planned.)");
  const html = await res.text(), { document } = parseHTML(html);
  document.querySelectorAll("script,style,noscript,iframe,svg").forEach((n) => n.remove());
  const base = res.url;
  document.querySelectorAll("a[href]").forEach((a) => { try { a.setAttribute("href", new URL(a.getAttribute("href"), base).href); } catch {} });
  document.querySelectorAll("img[src]").forEach((i) => { try { i.setAttribute("src", new URL(i.getAttribute("src"), base).href); } catch {} });
  const meta = (n) => document.querySelector(`meta[property="${n}"],meta[name="${n}"]`)?.getAttribute("content") || "";
  // Candidate main areas, measured before Readability mutates the DOM; used when Readability under-extracts (docs sites, app pages).
  const areas = ["main", "article", "[role=main]", "#content", ".content", "body"].map((sel) => document.querySelector(sel)).filter(Boolean)
    .map((n) => ({ html: n.innerHTML, len: (n.textContent || "").replace(/\s+/g, " ").length }));
  const bestArea = areas.filter((a) => a !== areas[areas.length - 1] || areas.length === 1).sort((a, b) => b.len - a.len)[0] || areas[areas.length - 1];
  let art = null; try { art = new Readability(document.cloneNode(true), { charThreshold: 200 }).parse(); } catch {}
  if (art && bestArea && (art.textContent || "").replace(/\s+/g, " ").length < bestArea.len * 0.4) art = { ...art, content: bestArea.html };
  const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
  td.remove(["form", "button", "input", "select"]);
  const title = (art && art.title) || document.title || meta("og:title") || base;
  let md = art && art.content ? td.turndown(art.content) : td.turndown(document.body ? document.body.innerHTML : html);
  md = md.replace(/\n{3,}/g, "\n\n").trim();
  const truncated = md.length > maxChars; if (truncated) md = md.slice(0, maxChars) + "\n\n…[truncated]";
  const head = ["# " + title, "", "- Source: " + base, (art && art.byline) ? "- Author: " + art.byline : "", meta("article:published_time") ? "- Published: " + meta("article:published_time") : "", (art && art.excerpt) ? "- Summary: " + art.excerpt.replace(/\s+/g, " ").slice(0, 300) : ""].filter(Boolean);
  return { title, url: base, chars: md.length, truncated, markdown: head.join("\n") + "\n\n---\n\n" + md };
}
