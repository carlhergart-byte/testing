import { useState, useEffect, useCallback, useRef } from "react";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";

// ---------------------------------------------------------------------------
// All Polygon calls go through /api/polygon (Vercel serverless function).
// The real API key is stored as POLYGON_API_KEY in Vercel env vars — never
// sent to the browser.
// ---------------------------------------------------------------------------
async function polygonFetch(path) {
  const res = await fetch(`/api/polygon?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  if (data.status === "ERROR") throw new Error(data.error || "Polygon API error");
  return data;
}

// ---------------------------------------------------------------------------
// Industry definitions & curated ticker lists
// ---------------------------------------------------------------------------
const INDUSTRIES = {
  "Heavy-Duty Trucking": { icon: "🚛", fallbackSector: "Industrials" },
  "Semiconductor":       { icon: "💾", fallbackSector: "Technology" },
  "Clean Energy":        { icon: "⚡", fallbackSector: "Utilities" },
  "Aerospace & Defense": { icon: "🛩️", fallbackSector: "Industrials" },
  "Biotech & Pharma":    { icon: "🧬", fallbackSector: "Healthcare" },
  "Banking & Finance":   { icon: "🏦", fallbackSector: "Financials" },
  "Retail":              { icon: "🛍️", fallbackSector: "Consumer" },
  "Oil & Gas":           { icon: "🛢️", fallbackSector: "Energy" },
};

const INDUSTRY_TICKERS = {
  "Heavy-Duty Trucking": ["CMI","PCAR","ALSN","REVG","OSK","AGCO","WKHS","CNH"],
  "Semiconductor":       ["NVDA","AMD","INTC","TSM","ASML","AVGO","QCOM","AMAT"],
  "Clean Energy":        ["ENPH","FSLR","NEE","PLUG","SEDG","BE","RUN","STEM"],
  "Aerospace & Defense": ["LMT","RTX","NOC","GD","BA","HEI","RKLB","TDG"],
  "Biotech & Pharma":    ["MRNA","BNTX","REGN","GILD","VRTX","CRSP","ILMN","BIIB"],
  "Banking & Finance":   ["JPM","BAC","WFC","GS","MS","C","USB","TFC"],
  "Retail":              ["AMZN","WMT","TGT","COST","HD","LOW","TJX","ROST"],
  "Oil & Gas":           ["XOM","CVX","COP","SLB","EOG","MPC","PSX","VLO"],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildSparkline(changePct) {
  const pts = [];
  let v = 100;
  for (let i = 0; i < 19; i++) {
    v += (Math.random() - (changePct < 0 ? 0.52 : 0.48)) * 2.5;
    pts.push({ v });
  }
  pts.push({ v: changePct > 0 ? 103 + Math.random() * 2 : 97 - Math.random() * 2 });
  return pts;
}

function fmtCap(n) {
  if (!n) return "—";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6)  return `${(n / 1e6).toFixed(0)}M`;
  return n.toString();
}

function fmtVol(n) {
  if (!n) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toString();
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function App() {
  const [selectedIndustry, setSelectedIndustry] = useState("Heavy-Duty Trucking");
  const [stocks, setStocks]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [sortBy, setSortBy]       = useState("mktCapRaw");
  const [sortDir, setSortDir]     = useState("desc");
  const [filter, setFilter]       = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const sparklines = useRef({});

  const fetchStocks = useCallback(async (industry) => {
    setLoading(true);
    setError(null);
    setStocks([]);

    try {
      const tickers = INDUSTRY_TICKERS[industry];
      const tickerParam = tickers.join(",");

      // ── 1. Batch snapshot (price, change, volume) ──────────────────────────
      // Free tier: end-of-day snapshot for a comma-separated list of tickers
      const snapshotData = await polygonFetch(
        `v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickerParam}`
      );
      const snapshotMap = {};
      (snapshotData.tickers || []).forEach(t => { snapshotMap[t.ticker] = t; });

      // ── 2. Reference / ticker details (name, market cap, SIC sector) ───────
      const detailsData = await polygonFetch(
        `v3/reference/tickers?ticker=${tickerParam}&limit=50`
      );
      const detailsMap = {};
      (detailsData.results || []).forEach(d => { detailsMap[d.ticker] = d; });

      // ── 3. Map to display rows ─────────────────────────────────────────────
      const mapped = tickers
        .map(ticker => {
          const snap    = snapshotMap[ticker];
          const details = detailsMap[ticker] || {};
          if (!snap) return null;

          const price     = snap.day?.c   ?? snap.prevDay?.c ?? 0;
          const prevClose = snap.prevDay?.c ?? 0;
          const change    = prevClose ? price - prevClose : 0;
          const changePct = prevClose ? (change / prevClose) * 100 : 0;
          const volume    = snap.day?.v   ?? 0;
          const mktCap    = details.market_cap ?? 0;

          if (!sparklines.current[ticker]) {
            sparklines.current[ticker] = buildSparkline(changePct);
          }

          return {
            ticker,
            name:      details.name || ticker,
            price,
            change,
            changePct,
            mktCap:    fmtCap(mktCap),
            mktCapRaw: mktCap,
            volume:    fmtVol(volume),
            volumeRaw: volume,
            sector:    details.sic_description || INDUSTRIES[industry].fallbackSector,
            dayHigh:   snap.day?.h,
            dayLow:    snap.day?.l,
          };
        })
        .filter(Boolean);

      if (mapped.length === 0) {
        throw new Error("No snapshot data returned. Markets may be closed or tickers unrecognised.");
      }

      setStocks(mapped);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStocks(selectedIndustry); }, [selectedIndustry, fetchStocks]);

  // ── Sorting ────────────────────────────────────────────────────────────────
  const parseSort = (s, col) => s[col] ?? 0;

  const sorted = [...stocks]
    .filter(s => !filter ||
      s.ticker.toLowerCase().includes(filter.toLowerCase()) ||
      s.name.toLowerCase().includes(filter.toLowerCase()) ||
      s.sector.toLowerCase().includes(filter.toLowerCase())
    )
    .sort((a, b) => {
      const av = parseSort(a, sortBy), bv = parseSort(b, sortBy);
      return sortDir === "asc" ? av - bv : bv - av;
    });

  const gainers = stocks.filter(s => s.changePct > 0).length;
  const losers  = stocks.filter(s => s.changePct < 0).length;
  const avgChg  = stocks.length
    ? (stocks.reduce((a, x) => a + x.changePct, 0) / stocks.length).toFixed(2)
    : "0.00";

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  const SortIcon = ({ col }) => (
    <span style={{ opacity: sortBy === col ? 1 : 0.25, fontSize: "9px", marginLeft: "3px" }}>
      {sortBy === col ? (sortDir === "desc" ? "▼" : "▲") : "↕"}
    </span>
  );

  const COLS = [
    { label: "Ticker",  col: "ticker",    align: "left" },
    { label: "Company", col: "name",      align: "left" },
    { label: "Sector",  col: "sector",    align: "left" },
    { label: "Price",   col: "price",     align: "right" },
    { label: "Change",  col: "changePct", align: "right" },
    { label: "Mkt Cap", col: "mktCapRaw", align: "right" },
    { label: "Volume",  col: "volumeRaw", align: "right" },
    { label: "Trend",   col: null,        align: "right" },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#0a0c10", fontFamily: "'IBM Plex Mono','Courier New',monospace", color: "#c8d0dc" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=IBM+Plex+Sans:wght@400;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:#0f1218}
        ::-webkit-scrollbar-thumb{background:#1e2e3e;border-radius:2px}
        .row-h:hover{background:#111820!important}
        .ind-btn{transition:all .13s ease}
        .ind-btn:hover{border-color:#2a5888!important;color:#90b8d8!important}
        .sort-th:hover{color:#7ab8e8!important;cursor:pointer}
        @keyframes fadeUp{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        .fr{animation:fadeUp .2s ease forwards;opacity:0}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
        .pls{animation:pulse 1.4s ease infinite}
        .rib:hover{color:#7ab8e8!important;border-color:#1e4060!important}
      `}</style>

      {/* ── Topbar ── */}
      <div style={{ borderBottom:"1px solid #111a24", padding:"13px 28px", display:"flex", alignItems:"center", justifyContent:"space-between", background:"#0c0f14" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
          <div style={{ width:"7px", height:"7px", borderRadius:"50%", background: loading?"#d4903a":"#3db87a", boxShadow:`0 0 7px ${loading?"#d4903a":"#3db87a"}` }} className={loading?"pls":""} />
          <span style={{ fontFamily:"'IBM Plex Sans',sans-serif", fontSize:"12px", fontWeight:600, letterSpacing:"0.14em", color:"#607a96", textTransform:"uppercase" }}>
            Industry Stock Terminal
          </span>
          <span style={{ fontSize:"10px", color:"#1e3048", marginLeft:"4px" }}>· Polygon.io</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:"14px" }}>
          {lastUpdated && <span style={{ fontSize:"10px", color:"#253545" }}>Updated {lastUpdated.toLocaleTimeString()}</span>}
          <button className="rib" onClick={() => fetchStocks(selectedIndustry)} disabled={loading}
            style={{ background:"transparent", border:"1px solid #141e2c", borderRadius:"3px", padding:"4px 12px", color:"#2a4056", fontSize:"10px", fontFamily:"inherit", cursor:loading?"not-allowed":"pointer", transition:"all .13s" }}>
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      <div style={{ padding:"22px 28px", maxWidth:"1300px", margin:"0 auto" }}>

        {/* ── Industry pills ── */}
        <div style={{ marginBottom:"20px" }}>
          <div style={{ fontSize:"9px", color:"#1e3040", letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:"8px" }}>Select Industry</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:"7px" }}>
            {Object.keys(INDUSTRIES).map(ind => (
              <button key={ind} className="ind-btn"
                onClick={() => { setFilter(""); setSelectedIndustry(ind); }}
                style={{
                  background: selectedIndustry===ind ? "#0e1824" : "transparent",
                  border:`1px solid ${selectedIndustry===ind ? "#1a4060" : "#111e2c"}`,
                  color: selectedIndustry===ind ? "#5aa0d8" : "#304858",
                  padding:"5px 13px", borderRadius:"3px", fontSize:"11px",
                  cursor:"pointer", fontFamily:"inherit", letterSpacing:"0.02em",
                }}>
                {INDUSTRIES[ind].icon} {ind}
              </button>
            ))}
          </div>
        </div>

        {/* ── Stats ── */}
        {!loading && stocks.length > 0 && (
          <div style={{ display:"flex", gap:"12px", marginBottom:"16px", flexWrap:"wrap" }}>
            {[
              { label:"Gainers",    val:gainers,   color:"#3db87a" },
              { label:"Losers",     val:losers,    color:"#e05555" },
              { label:"Avg Change", val:`${Number(avgChg)>=0?"+":""}${avgChg}%`, color:Number(avgChg)>=0?"#3db87a":"#e05555" },
              { label:"Tracked",   val:stocks.length, color:"#6aaae0" },
            ].map(s => (
              <div key={s.label} style={{ background:"#0c0f14", border:"1px solid #111e2c", borderRadius:"4px", padding:"9px 16px" }}>
                <div style={{ fontSize:"9px", color:"#203040", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:"4px" }}>{s.label}</div>
                <div style={{ fontSize:"18px", color:s.color, fontWeight:500 }}>{s.val}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Filter ── */}
        <div style={{ marginBottom:"11px" }}>
          <input value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Filter by ticker, name, or sector…"
            style={{ background:"#0c0f14", border:"1px solid #111e2c", borderRadius:"3px", padding:"7px 13px", color:"#6a8aaa", fontSize:"11px", fontFamily:"inherit", width:"270px", outline:"none" }} />
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{ background:"#180d0d", border:"1px solid #3a1818", borderRadius:"4px", padding:"13px 16px", color:"#c06060", fontSize:"11px", marginBottom:"14px" }}>
            ⚠ {error}
          </div>
        )}

        {/* ── Skeleton ── */}
        {loading && (
          <div style={{ background:"#0c0f14", border:"1px solid #111e2c", borderRadius:"4px", overflow:"hidden" }}>
            {[...Array(8)].map((_,i) => (
              <div key={i} style={{ display:"flex", gap:"18px", padding:"13px 16px", borderBottom:"1px solid #0e1620", opacity:1-i*0.1 }}>
                {[55,170,120,65,88,55,75,76].map((w,j) => (
                  <div key={j} className="pls" style={{ height:"9px", width:w, background:"#111e2c", borderRadius:"2px", animationDelay:`${j*70}ms` }} />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ── Table ── */}
        {!loading && stocks.length > 0 && (
          <div style={{ background:"#0c0f14", border:"1px solid #111e2c", borderRadius:"4px", overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", minWidth:"820px" }}>
              <thead>
                <tr style={{ borderBottom:"1px solid #111e2c", background:"#090c10" }}>
                  {COLS.map(h => (
                    <th key={h.label} onClick={() => h.col && handleSort(h.col)}
                      className={h.col ? "sort-th" : ""}
                      style={{ padding:"9px 14px", textAlign:h.align, fontSize:"9px",
                        color: sortBy===h.col ? "#5aa0d8" : "#1e3448",
                        fontWeight:500, letterSpacing:"0.12em", textTransform:"uppercase",
                        userSelect:"none", whiteSpace:"nowrap", transition:"color .12s" }}>
                      {h.label}{h.col && <SortIcon col={h.col} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((s, i) => {
                  const up = s.changePct >= 0;
                  const spark = sparklines.current[s.ticker] || buildSparkline(0);
                  return (
                    <tr key={s.ticker} className="row-h fr"
                      style={{ borderBottom:"1px solid #0e1620", animationDelay:`${i*28}ms` }}>
                      <td style={{ padding:"11px 14px" }}>
                        <span style={{ color:"#5aa0d8", fontWeight:600, fontSize:"12px", letterSpacing:"0.06em" }}>{s.ticker}</span>
                      </td>
                      <td style={{ padding:"11px 14px", maxWidth:"200px" }}>
                        <span style={{ color:"#6a8aaa", fontSize:"11px", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", display:"block" }}>{s.name}</span>
                      </td>
                      <td style={{ padding:"11px 14px" }}>
                        <span style={{ background:"#0e1620", border:"1px solid #162436", borderRadius:"2px", padding:"2px 7px", fontSize:"9px", color:"#3a5a72", letterSpacing:"0.05em", textTransform:"uppercase", whiteSpace:"nowrap" }}>
                          {(s.sector||"—").split(" ").slice(0,3).join(" ")}
                        </span>
                      </td>
                      <td style={{ padding:"11px 14px", textAlign:"right" }}>
                        <span style={{ color:"#b8ccd8", fontSize:"12px", fontWeight:500 }}>
                          ${s.price < 1 ? s.price.toFixed(4) : s.price.toFixed(2)}
                        </span>
                      </td>
                      <td style={{ padding:"11px 14px", textAlign:"right" }}>
                        <span style={{ color:up?"#3db87a":"#e05555", fontSize:"11px", fontWeight:500 }}>
                          {up?"+":""}{s.change.toFixed(2)}{" "}
                          <span style={{ opacity:0.75 }}>({up?"+":""}{s.changePct.toFixed(2)}%)</span>
                        </span>
                      </td>
                      <td style={{ padding:"11px 14px", textAlign:"right" }}>
                        <span style={{ color:"#486070", fontSize:"11px" }}>{s.mktCap}</span>
                      </td>
                      <td style={{ padding:"11px 14px", textAlign:"right" }}>
                        <span style={{ color:"#2a4056", fontSize:"10px" }}>{s.volume}</span>
                      </td>
                      <td style={{ padding:"7px 14px" }}>
                        <div style={{ width:76, height:30, display:"inline-block" }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={spark}>
                              <Line type="monotone" dataKey="v" stroke={up?"#3db87a":"#e05555"} strokeWidth={1.5} dot={false} />
                              <Tooltip content={() => null} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sorted.length === 0 && (
              <div style={{ padding:"36px", textAlign:"center", color:"#162030", fontSize:"11px" }}>No matches for "{filter}"</div>
            )}
          </div>
        )}

        <div style={{ marginTop:"10px", fontSize:"9px", color:"#162028", letterSpacing:"0.05em" }}>
          Data via Polygon.io free tier · End-of-day / 15-min delayed · Sparklines indicative only · Not financial advice
        </div>
      </div>
    </div>
  );
}
