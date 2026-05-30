# CLAUDE.md — `money-leaks` Project Context

> Per **Rule #3** (from `/src/CLAUDE.md`): every project keeps its own `CLAUDE.md` so future sessions regain full context.

---

## 📛 Project Name & Description
- **Name:** `money-leaks` (working brand: **MoneyLeaks** — "Where did your money actually go?")
- **Type:** Static web app — HTML + CSS + vanilla JS, Tailwind via CDN. **100% client-side**, no backend, no build step. Same architecture pattern as `ebay-listing-optimizer`.
- **Goal:** User drops a bank-statement CSV → instantly sees an emotional "reveal" of where their money went: big total, work-hours framing, category breakdown, merchant intelligence, detected subscriptions, and a "money leaks" engine. Optional Google Gemini layer turns the computed facts into punchy insights + a roast.
- **Core principle (the whole trust model):** **Code computes the truth; AI only narrates.** Gemini never does math or categorization — it receives an already-computed `facts` object and writes language. Every prompt carries a guardrail: *"Never invent, change, or recompute any number."*
- **Privacy pitch (key differentiator):** the CSV is parsed in-browser with PapaParse; **no data is ever uploaded**. This is the selling point for a finance app.

## 📅 Created / Change Log
- **2026-05-21** — Initial scaffold. Phase 1 + select Phase 2/3 features built in one pass.
- **2026-05-21** — **Editorial redesign.** Per Malachi's art direction, rebuilt the UI to a
  "minimal editorial fintech" aesthetic (Apple/Stripe/Linear/Monarch, financial-publication feel).
  **Dropped Tailwind CDN** in favour of a handcrafted CSS system (`style.css`) with a bespoke
  spacing rhythm — avoids the "AI template" look. New: warm-charcoal palette (#0F1115) with muted
  green/red/blue accents, Newsreader serif headers + Inter tabular numbers, hairline dividers (no
  floating cards), oversized figures. Added **forensic Leak Cards** (the signature UI — category as
  an investigative finding: amount, % vs last month, hours of work, behavioural detail, primary
  merchant), a **thin daily-spending trend line** (Chart.js, single muted accent, no axes/grid), an
  editorial one-line headline ("Your biggest leak was …"), and **per-category month-over-month**
  (`ml_cat_hist` in localStorage). Gemini voice tuned to "calm, observant, no emojis." All files
  CRLF (Rule #2).

- **2026-05-30** — **Polish pass (yellow items from the redesign brief).** Stayed in the editorial
  lane — explicitly rejected the "neon glow / glassmorphism / icons-per-row" red items from the
  brief because they conflict with the original editorial direction Malachi committed to. Added:
  (a) **category pill badges** on leak cards — low-opacity tint of the severity color + same color
  text, tiny + bold + pill-shaped (subtle, not rainbow blocks); (b) **AI mode status pill** on the
  "Your money story" header; (c) **micro-hover lift** on leak cards (translateY -1px + brighter bg);
  (d) **quiet hovers** on subscription + merchant rows (color-only); (e) **focus states** extended
  to mapper-grid selects and the income-period select; (f) **skeleton states** for the four lower
  grids (leak cards, categories, subscriptions, merchants) — pulse-only via opacity (no shimmer
  sweep, which is the "AI template smell"), 420ms display before real content lands; (g) **editorial
  empty states** for leak-cards (when no leaks surface) and subscriptions (when none detected) —
  dashed hairline frame, single muted glyph, italic serif title, restrained prose ("Nothing
  surfaced." / "No clear patterns this period."). Header reveal still feels instant — the big total
  count-up is the moment, the lists do the brief editorial pause. All CRLF (Rule #2).
- **2026-05-21** — **Landing polish + dashboard UI pass.** Added a real nav (droplet logo mark +
  wordmark; links: How it works / Sample / Settings — auth/pricing/history deliberately deferred,
  see note below). Income input wrapped in a contained tool-card. Upload zone became a raised card
  on deeper charcoal with a cloud-upload icon, a hover border + soft accent ring on dragover, and a
  progress-bar → green-checkmark loading sequence (`runBusy`). Leak cards gained: semantic severity
  accents (high=red / warn=amber / good=green / neutral=blue, a 2px top edge — not rainbow blocks),
  a per-category **micro-sparkline** (`sparkSVG`), a grouping divider between the headline figure and
  secondary metrics, a hover state, and an (i) **tooltip** on "Hours of work." Bigger/bolder serif
  headline, roomier lede. Very subtle radial background tint (calm, not a glow-bomb). A signature
  preview Leak Card already sits on the landing as "the reward." All CRLF (Rule #2).
  - **Deferred on purpose:** nav links for Dashboard / History / Pricing / Sign In imply accounts +
    a backend + a pricing page that don't exist yet. Wiring dead links = the "empty SaaS template"
    smell the design brief explicitly warns against. Add them when the Plaid/auth/paid-tier phase
    lands.

## 🗂️ Folder Structure
```
/src/source/personal/money-leaks/
├── CLAUDE.md      ← this file
├── README.md      ← public-facing intro
├── index.html     ← UI: landing/upload, results sections, settings + share modals
├── style.css      ← small overrides on top of Tailwind CDN
├── script.js      ← ALL logic (see below)
├── vercel.json    ← cleanUrls + security headers (matches ebay project)
└── .gitignore
```

## 🧠 script.js — what lives where
- **CATEGORY_RULES** — keyword dictionary mapping merchant substrings → category. First match wins. Edit here to improve categorization.
- **getLearnedRules / saveLearnedRule** — user re-categorizations persist in `localStorage` (`ml_learned_rules`) and win over the dictionary. *(Auto-learn storage is wired; UI to trigger a recategorize is a TODO — see below.)*
- **categorize() / cleanMerchant()** — assign category + produce a clean display merchant name.
- **CSV pipeline:** `handleFile` → PapaParse → `guessColumns` (auto-detects date/desc/amount headers) → if unsure, `showMapper` lets the user pick columns → `buildAnalysis`.
- **buildAnalysis()** — builds the `MODEL` (source-of-truth facts): total, per-category, per-merchant, subscriptions, leaks, period, month-over-month vs `ml_last_total`. Filters out income/deposits/refunds; treats outflows as positive spend.
- **detectSubscriptions()** — recurring-charge heuristic: same merchant, ≥2 similar-amount charges, or a known subscription merchant.
- **detectLeaks()** — pure pattern detection: late-night food, delivery>groceries, coffee habit, weekend bump, duplicate charges, impulse-shop merchant.
- **Gemini layer:** `callGemini` hits `gemini-1.5-flash` `generateContent` with `responseMimeType: application/json`. `generateAIInsights('insights'|'roast')`. Falls back to `offlineInsights()` templates if no key or call fails.
- **Share card:** `drawShareCard()` renders a Spotify-Wrapped-style PNG on a `<canvas>` for download/sharing.
- **loadDemo()** — realistic sample CSV so the app is testable with zero setup ("try with sample data").

## 🔑 Gemini / AI setup
- User pastes their own **free Gemini API key** in the ⚙️ AI Setup modal. Stored only in `localStorage` (`ml_gemini_key`). Same BYO-key model as the ebay project.
- Model: **gemini-1.5-flash** (cheap, fast, enough for all narration). Pro not needed.
- App is **fully functional with no key** (offline template insights). AI is pure polish.

## 🚀 Deploy (Rule #5 flow)
- ✅ **2026-05-30 — Repo created + pushed:** https://github.com/soljaboi2020/money-leaks (public).
  Created via `gh repo create` (gh CLI already auth'd as soljaboi2020, `repo` scope). Container had
  no SSH host key for github.com, so first push used HTTPS with `gh auth token` inline (token NOT
  stored in remote URL — one-shot for the initial push). Local git identity set via
  `git config --local` (per master rule: never touch global git config).
- ⏳ **Vercel import — needs Malachi.** Vercel can't auto-import a new repo without his OAuth
  approval. He goes to https://vercel.com/new → import `soljaboi2020/money-leaks` → leave all
  defaults (Other framework, no build cmd, output dir `./`) → Deploy. After that, every push to
  `main` auto-deploys (Rule #5). Default URL: `money-leaks-<hash>.vercel.app` or `money-leaks.vercel.app`.
- ⚠️ Future Claude pushes need the same inline-token pattern (`gh auth setup-git` can't persist to
  `/root/.gitconfig` — "Device or resource busy"). Use:
  `TOKEN=$(gh auth token); git push "https://x-access-token:${TOKEN}@github.com/soljaboi2020/money-leaks.git" main; unset TOKEN`
- `vercel.json` mirrors ebay project (cleanUrls + security headers).

## ✅ Done (Phase 1 + bits of 2/3)
Frictionless CSV onboarding · column auto-detect + manual mapper · the reveal (big total, count-up) · salary→work-hours framing · category chart + bars · merchant intelligence · subscription detector · money-leaks engine · month-over-month delta · emotional insights (offline + Gemini) · roast mode · shareable card · demo data.

## 📋 TODO / roadmap (from Malachi's feature spec)
- **Recategorize UI** — clickable transactions so users can fix a category (storage already exists via `saveLearnedRule`). High priority for retention.
- Financial **personality profile** (#10) — Gemini call from facts.
- **Weekly check-ins** (#11) — needs a backend/email (would break the no-server model; consider later).
- **Goals** (#12), **spending timeline / life-replay** (#9).
- **Plaid auto-sync** (#15) — the paid tier; requires a serverless function (like ebay's `api/`). Only after validation.
- **Couples mode** (#16), **tax/business expense detection** (#17).
- Multi-currency, more bank presets, better duplicate detection.

## ⚠️ Notes / gotchas
- Many bank CSVs lack transaction **time** → late-night-leak detection silently skips when hours are all 0/midnight. Don't treat its absence as a bug.
- Amount-sign handling is heuristic (negative = spend; positive income keywords skipped). Some banks use separate debit/credit columns — the mapper helps but a future pass could detect this.
- Tailwind via CDN logs a production warning in console — fine for MVP, matches ebay project.
