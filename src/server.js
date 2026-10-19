#!/usr/bin/env node
// toolkb MCP server (stdio): link -> AI-ready Markdown tools for Claude, Codex, Cursor.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import "./net.js";
import { getTranscript, transcriptMarkdown } from "./youtube.js";
import { pageToMarkdown } from "./web.js";
import { getReviews, reviewsMarkdown } from "./appstore.js";
import { getPlaylist, playlistMarkdown, playlistTranscripts } from "./playlist.js";

const server = new McpServer({ name: "toolkb", version: "0.2.0" });
const ok = (text) => ({ content: [{ type: "text", text }] });
const fail = (e) => ({ isError: true, content: [{ type: "text", text: "Error: " + (e && e.message ? e.message : String(e)) }] });

server.registerTool("youtube_transcript", {
  title: "YouTube transcript",
  description: "Get the transcript of a YouTube video as Markdown with title, channel, duration and clickable [mm:ss] timestamps. Uses the video's uploaded or auto-generated captions. To get it in another language, pick a caption language with `lang` or ask the assistant to translate the result.",
  inputSchema: { url: z.string().describe("YouTube URL (watch, youtu.be, shorts, live) or 11-character video ID"), lang: z.string().optional().describe("Preferred caption language code, e.g. en, zh-Hans, ja"), timestamps: z.boolean().optional().describe("Include [mm:ss] timestamps (default true)") },
}, async ({ url, lang, timestamps }) => { try { return ok(transcriptMarkdown(await getTranscript(url, { lang }), { timestamps: timestamps !== false })); } catch (e) { return fail(e); } });

server.registerTool("youtube_playlist", {
  title: "YouTube playlist or channel",
  description: "List the videos of a YouTube playlist or channel (titles, lengths, links). With transcripts=true, return the transcripts of the first N videos in one Markdown document – a ready-made knowledge base for summaries, notes or Q&A.",
  inputSchema: { url: z.string().describe("Playlist URL or ID (PL…), or channel URL (/@handle, /channel/UC…) for its uploads"), limit: z.number().int().min(1).max(500).optional().describe("Max videos to list (default 50)"), transcripts: z.boolean().optional().describe("Also fetch transcripts (default false)"), max_transcripts: z.number().int().min(1).max(25).optional().describe("How many videos to transcribe when transcripts=true (default 10)"), timestamps: z.boolean().optional().describe("Timestamps in transcripts (default false here, to save space)"), max_chars: z.number().int().positive().optional().describe("Stop adding transcripts after this many characters (default 90000, fits Claude Code's tool output limit)") },
}, async ({ url, limit, transcripts, max_transcripts, timestamps, max_chars }) => { try { const p = await getPlaylist(url, { limit: limit || 50 }); return ok(transcripts ? await playlistTranscripts(p, { max: max_transcripts || 10, timestamps: timestamps === true, maxChars: max_chars || 90000 }) : playlistMarkdown(p)); } catch (e) { return fail(e); } });

server.registerTool("webpage_to_markdown", {
  title: "Web page to Markdown",
  description: "Fetch a web page and return its main content (article body, docs, blog post) as clean Markdown without navigation, ads or scripts. Links and images are made absolute.",
  inputSchema: { url: z.string().describe("http(s) URL of the page"), max_chars: z.number().int().positive().optional().describe("Truncate output after this many characters (default 60000)") },
}, async ({ url, max_chars }) => { try { return ok((await pageToMarkdown(url, { maxChars: max_chars })).markdown); } catch (e) { return fail(e); } });

server.registerTool("app_store_reviews", {
  title: "App Store reviews",
  description: "Fetch recent customer reviews of an iOS/macOS app from the Apple App Store (official public feed) as Markdown, with rating histogram. Useful for finding user pain points, feature requests and competitor weaknesses.",
  inputSchema: { app: z.string().describe("App Store URL (apps.apple.com/...id123) or numeric app ID"), country: z.string().optional().describe("Two-letter store country, default us"), pages: z.number().int().min(1).max(10).optional().describe("Pages of 50 reviews, 1-10 (default 3)"), min_rating: z.number().int().min(1).max(5).optional(), max_rating: z.number().int().min(1).max(5).optional() },
}, async ({ app, country, pages, min_rating, max_rating }) => { try { return ok(reviewsMarkdown(await getReviews(app, { country, pages }), { minRating: min_rating || 1, maxRating: max_rating || 5 })); } catch (e) { return fail(e); } });

await server.connect(new StdioServerTransport());
