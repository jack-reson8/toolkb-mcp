#!/usr/bin/env node
// toolkb CLI: same tools as the MCP server, printed to stdout.
import "./net.js";
import { getTranscript, transcriptMarkdown } from "./youtube.js";
import { pageToMarkdown } from "./web.js";
import { getReviews, reviewsMarkdown } from "./appstore.js";
const [cmd, target, ...rest] = process.argv.slice(2);
const opt = (k) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : undefined; };
const help = `toolkb – turn links into AI-ready Markdown
  toolkb yt <youtube-url> [--lang en] [--no-timestamps]
  toolkb web <url> [--max 60000]
  toolkb reviews <app-store-url|id> [--country us] [--pages 3] [--min 1] [--max 5]`;
try {
  if (cmd === "yt") console.log(transcriptMarkdown(await getTranscript(target, { lang: opt("lang") }), { timestamps: !rest.includes("--no-timestamps") }));
  else if (cmd === "web") console.log((await pageToMarkdown(target, { maxChars: +opt("max") || undefined })).markdown);
  else if (cmd === "reviews") console.log(reviewsMarkdown(await getReviews(target, { country: opt("country"), pages: opt("pages") }), { minRating: +opt("min") || 1, maxRating: +opt("max") || 5 }));
  else { console.log(help); process.exit(cmd ? 1 : 0); }
} catch (e) { console.error("Error: " + e.message); process.exit(1); }
