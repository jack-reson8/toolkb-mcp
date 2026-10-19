// Apple App Store reviews from Apple's public customer-reviews RSS feed (up to 10 pages x 50 reviews).
export function parseAppId(input) {
  const s = String(input || "").trim(), m = s.match(/id(\d{6,})/) || s.match(/^(\d{6,})$/);
  if (!m) throw new Error("Give an App Store URL (apps.apple.com/.../id123456789) or the numeric app ID.");
  return m[1];
}
export async function getReviews(input, { country = "us", pages = 3 } = {}) {
  const id = parseAppId(input), cc = String(country).toLowerCase().slice(0, 2), n = Math.max(1, Math.min(10, +pages || 3));
  const look = await (await fetch(`https://itunes.apple.com/lookup?id=${id}&country=${cc}`)).json();
  const app = look.results?.[0]; if (!app) throw new Error("No app with ID " + id + " in the " + cc.toUpperCase() + " store.");
  const reviews = [];
  for (let p = 1; p <= n; p++) {
    const r = await fetch(`https://itunes.apple.com/${cc}/rss/customerreviews/page=${p}/id=${id}/sortby=mostrecent/json`);
    if (!r.ok) break; const j = await r.json(); const e = [].concat(j.feed?.entry || []).filter((x) => x["im:rating"]);
    if (!e.length) break;
    for (const x of e) reviews.push({ rating: +x["im:rating"].label, title: x.title?.label || "", text: (x.content?.label || "").replace(/\s+/g, " ").trim(), version: x["im:version"]?.label || "", date: (x.updated?.label || "").slice(0, 10), author: x.author?.name?.label || "" });
  }
  return { app: { id, name: app.trackName, developer: app.artistName, rating: app.averageUserRating, ratings: app.userRatingCount, price: app.formattedPrice, genre: app.primaryGenreName, url: app.trackViewUrl }, country: cc, reviews };
}
export function reviewsMarkdown(d, { minRating = 1, maxRating = 5 } = {}) {
  const rs = d.reviews.filter((r) => r.rating >= minRating && r.rating <= maxRating), hist = [5, 4, 3, 2, 1].map((s) => s + "★ " + d.reviews.filter((r) => r.rating === s).length);
  const avg = d.reviews.length ? (d.reviews.reduce((a, r) => a + r.rating, 0) / d.reviews.length).toFixed(2) : "–";
  return ["# App Store reviews: " + d.app.name, "", "- Developer: " + d.app.developer, "- Store: " + d.country.toUpperCase() + " · " + d.app.genre + " · " + d.app.price, "- All-time rating: " + (d.app.rating ? d.app.rating.toFixed(2) : "?") + " from " + (d.app.ratings || 0).toLocaleString("en-US") + " ratings",
    "- Recent sample: " + d.reviews.length + " reviews, average " + avg + " (" + hist.join(", ") + ")", "- Shown below: " + rs.length + " reviews rated " + minRating + "–" + maxRating + "★, newest first", "- URL: " + d.app.url, "",
    "Tip for your AI: group these into recurring complaints, feature requests and praise, with counts and example quotes.", "", "## Reviews", "",
    ...rs.map((r) => `### ${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)} ${r.title}\n${r.date} · v${r.version}\n\n${r.text}\n`)].join("\n");
}
