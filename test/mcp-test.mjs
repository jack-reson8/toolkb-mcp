// End-to-end: spawn the server over stdio with the official MCP client, list tools, call each on real links.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const client = new Client({ name: "toolkb-test", version: "0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ["src/server.js"], env: process.env }));
const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));
const cases = [
  ["youtube_transcript", { url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" }, (t) => t.includes("elephants")],
  ["youtube_transcript", { url: "https://www.youtube.com/watch?v=zjkBMFhNj_g", timestamps: false }, (t) => t.length > 40000 && !t.includes("&t=")],
  ["webpage_to_markdown", { url: "https://www.paulgraham.com/greatwork.html", max_chars: 5000 }, (t) => t.includes("# How to Do Great Work") && t.includes("[truncated]")],
  ["app_store_reviews", { app: "1232780281", pages: 1, min_rating: 5 }, (t) => t.includes("Notion") && !/### ★★★★☆/.test(t)],
  ["youtube_transcript", { url: "not a url" }, (t, r) => r.isError && t.includes("Not a YouTube")],
  ["webpage_to_markdown", { url: "ftp://x" }, (t, r) => r.isError],
];
let bad = 0;
for (const [name, args, check] of cases) {
  const r = await client.callTool({ name, arguments: args }); const t = r.content?.[0]?.text || "";
  const pass = check(t, r); if (!pass) bad++;
  console.log((pass ? "PASS " : "FAIL ") + name + " " + JSON.stringify(args).slice(0, 70) + " -> " + t.length + " chars" + (pass ? "" : " :: " + t.slice(0, 200)));
}
await client.close(); console.log(bad ? bad + " failing" : "all MCP cases pass"); process.exit(bad ? 1 : 0);
