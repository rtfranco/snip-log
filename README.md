# Snip/Log

Paste a screenshot, get a structured note with steps. Every page is also
freely editable — write your own notes, add steps by hand, or start a
blank page.

This repo has two parts:

- `src/` — the React app (deploys to GitHub Pages, free, static)
- `worker/` — a small Cloudflare Worker that holds your Anthropic API key
  and proxies requests to it (free tier, no server to maintain)

You need both. GitHub Pages can only serve static files — it can't hide a
secret key — so the worker is what makes it safe to call Claude's API from
a public website.

---

## 1. Get an Anthropic API key

Create one at [console.anthropic.com](https://console.anthropic.com) if
you don't already have one. Keep it secret — never put it directly in the
frontend code.

## 2. Deploy the Worker (the API proxy)

```bash
cd worker
npm install -g wrangler   # one-time, if you don't have it
wrangler login
wrangler secret put ANTHROPIC_API_KEY
# paste your key when prompted
wrangler deploy
```

Wrangler will print a URL like:
`https://snip-log-proxy.your-subdomain.workers.dev`

Copy that — you need it in the next step.

**Optional but recommended:** open `worker/src/index.js` and set
`ALLOWED_ORIGIN` to your actual GitHub Pages URL (e.g.
`"https://yourname.github.io"`) instead of `"*"`, so only your site can
call the proxy. Redeploy with `wrangler deploy` after changing it.

## 3. Push this repo to GitHub

```bash
cd ..   # back to the project root
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/snip-log.git
git push -u origin main
```

## 4. Point the app at your Worker

In your GitHub repo: **Settings → Secrets and variables → Actions →
New repository secret**

- Name: `VITE_API_PROXY_URL`
- Value: the Worker URL from step 2

The GitHub Actions workflow (`.github/workflows/deploy.yml`) reads this
secret at build time and bakes it into the app.

## 5. Turn on GitHub Pages

In your repo: **Settings → Pages → Build and deployment → Source** →
select **GitHub Actions**.

Push to `main` (or re-run the workflow from the Actions tab) and the site
will build and deploy automatically. It'll be live at:

`https://<your-username>.github.io/snip-log/`

## 6. Check the repo name matches

`vite.config.js` has `base: "/snip-log/"`. If you name your GitHub repo
something other than `snip-log`, update that line to match — it has to be
`/<your-repo-name>/`.

---

## Running it locally

```bash
npm install
cp .env.example .env
# edit .env with your Worker URL (or run the worker locally, see below)
npm run dev
```

To run the worker locally instead of deploying it first:

```bash
cd worker
wrangler dev
```

That serves it at `http://localhost:8787`, which is already the default
`API_PROXY_URL` fallback in `src/App.jsx`, so local dev works without any
`.env` file at all.

---

## Notes on how data is stored

- Notes and images are saved in the browser's `localStorage` — private to
  that browser on that device, nothing leaves your machine except the
  image sent to Claude for analysis.
- That means notes won't sync between your phone and laptop, for example.
  If you want that later, swap the `storage` object at the top of
  `src/App.jsx` for calls to a real backend + database.
