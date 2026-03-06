// api/polygon.js — Vercel serverless function
// Proxies requests to Polygon.io so the API key stays server-side.
// Set POLYGON_API_KEY in Vercel → Project Settings → Environment Variables.

const POLYGON_BASE = "https://api.polygon.io";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "POLYGON_API_KEY environment variable is not set." });
    return;
  }

  // ?path=v2/snapshot/locale/us/markets/stocks/tickers?tickers=CMI,PCAR
  const { path } = req.query;
  if (!path) { res.status(400).json({ error: "Missing 'path' query param." }); return; }

  // Allowlist: only snapshot and ticker-details endpoints
  const allowed = [
    "v2/snapshot/locale/us/markets/stocks/tickers",
    "v3/reference/tickers/",
  ];
  if (!allowed.some(p => path.startsWith(p))) {
    res.status(403).json({ error: "Endpoint not allowed." });
    return;
  }

  try {
    // path may already contain query params (e.g. ?tickers=CMI,PCAR)
    const sep = path.includes("?") ? "&" : "?";
    const upstream = `${POLYGON_BASE}/${path}${sep}apiKey=${apiKey}`;
    const response = await fetch(upstream);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "Upstream Polygon request failed.", detail: err.message });
  }
}
