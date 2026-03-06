# Industry Stock Terminal

A live stock dashboard built with React + Vite, powered by **Polygon.io** (free tier).
Your API key stays server-side via a Vercel serverless function — never exposed to the browser.

## Project Structure

```
stock-dashboard/
├── api/
│   └── polygon.js      ← Vercel serverless proxy (holds API key server-side)
├── src/
│   ├── main.jsx
│   └── App.jsx         ← React dashboard
├── index.html
├── vite.config.js
├── vercel.json
└── package.json
```

## Get a Free Polygon API Key

1. Sign up at https://polygon.io (free, no credit card)
2. Copy your default API key from the Dashboard

Free tier includes: end-of-day snapshots, ticker reference data, unlimited calls.

## Local Development

```bash
npm install
cp .env.example .env.local   # then set POLYGON_API_KEY=your_key
npm install -g vercel
vercel dev                    # runs both Vite + serverless function
```

## Deploy to Vercel

```bash
npm install -g vercel
vercel
vercel env add POLYGON_API_KEY   # paste your key, select all environments
vercel --prod
```

Or connect your GitHub repo via the Vercel dashboard and add `POLYGON_API_KEY`
under Project Settings → Environment Variables, then redeploy.
