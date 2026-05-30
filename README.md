# 💸 MoneyLeaks

**Where did your money *actually* go?**

Drop in a bank-statement CSV and instantly see the truth: your total, in hours of work, the categories, the merchants you keep visiting, the subscriptions quietly draining you, and your biggest "money leaks."

## Why it's different
- **Your data never leaves your browser.** The CSV is parsed locally — nothing is uploaded to any server.
- **Emotional clarity, not another budgeting dashboard.** It's a mirror: *"You spent 17 hours of work on takeout."*
- **Code computes the numbers; AI only narrates.** Optional Google Gemini layer turns the facts into punchy insights and a (gentle) roast — but it never touches the math.

## Quick start
1. Open `index.html` (or visit the deployed site).
2. Click **"try it with sample data"** to see it instantly, or drop your own bank CSV.
3. (Optional) Add a free [Gemini API key](https://aistudio.google.com/apikey) in ⚙️ AI Setup for smarter insights + 🔥 roast mode.

## Stack
Vanilla HTML/CSS/JS · Tailwind (CDN) · PapaParse (CSV) · Chart.js · Google Gemini Flash (optional, bring-your-own-key). No backend, no build step.

## Run locally
```bash
# any static server works, e.g.
npx serve .
# then open the printed localhost URL
```
