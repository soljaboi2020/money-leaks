/* =========================================================================
   Money Leaks — all client-side. Code computes the truth; Gemini only narrates.
     - Rule-based logic always runs (instant, free, offline).
     - Optional Gemini layer activates only if user adds a key in AI setup.
     - Graceful fallback to template insights when no key / call fails.
   ========================================================================= */

const $ = (id) => document.getElementById(id);
const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');
const fmt2 = (n) => '$' + n.toFixed(2);

const LS = {
  key: 'ml_gemini_key',
  rules: 'ml_learned_rules',
  lastTotal: 'ml_last_total',
  catHist: 'ml_cat_hist',
};

/* ----------------------------- CATEGORY RULES --------------------------- */
const CATEGORY_RULES = [
  ['Takeout & Delivery', ['uber eats','ubereats','doordash','grubhub','postmates','deliveroo','just eat','skip the dishes','seamless']],
  ['Coffee', ['starbucks','dunkin','dutch bros','peet','tim hortons','costa coffee','blue bottle','philz']],
  ['Restaurants', ['mcdonald','burger king','wendy','chipotle','taco bell','kfc','subway','popeyes','chick-fil','panera','restaurant','grill','pizza','sushi','cafe','diner','bar &','tavern','ihop','dennys','olive garden','cheesecake']],
  ['Groceries', ['walmart','kroger','safeway','aldi','trader joe','whole foods','publix','wegmans','costco','sams club','heb','food lion','sprouts','grocery','supermarket','meijer','giant eagle']],
  ['Subscriptions', ['netflix','spotify','hulu','disney+','disney plus','hbo','max.com','youtube premium','apple.com/bill','itunes','prime video','paramount','peacock','audible','patreon','onlyfans','dropbox','google storage','google one','icloud','adobe','microsoft 365','office 365','notion','canva','chatgpt','openai','midjourney','github','linkedin premium','nytimes','wsj']],
  ['Transport', ['uber','lyft','shell','chevron','exxon','bp ','mobil','marathon','speedway','7-eleven gas','parking','toll','metro','transit','amtrak','delta air','united air','american air','southwest','frontier','spirit air','uber trip']],
  ['Shopping', ['amazon','amzn','ebay','etsy','target','best buy','apple store','nike','adidas','zara','h&m','shein','temu','aliexpress','wayfair','ikea','home depot','lowes','macy','nordstrom','sephora','ulta']],
  ['Health & Fitness', ['cvs','walgreens','rite aid','pharmacy','planet fitness','la fitness','gym','equinox','peloton','gnc','dental','clinic','hospital','doctor','optometr']],
  ['Bills & Utilities', ['at&t','verizon','t-mobile','comcast','xfinity','spectrum','cox comm','electric','water util','gas company','pg&e','duke energy','insurance','geico','progressive','state farm','allstate','rent','mortgage','student loan']],
  ['Entertainment', ['steam','playstation','xbox','nintendo','epic games','riot','roblox','twitch','amc theat','cinemark','regal','ticketmaster','stubhub','live nation','fandango']],
  ['Cash & Transfers', ['venmo','cash app','cashapp','zelle','paypal','withdrawal','atm','wire transfer']],
];

function getLearnedRules() { try { return JSON.parse(localStorage.getItem(LS.rules)) || {}; } catch { return {}; } }
function saveLearnedRule(sub, cat) {
  const r = getLearnedRules(); r[sub.toLowerCase()] = cat;
  localStorage.setItem(LS.rules, JSON.stringify(r));
}

function categorize(desc) {
  const d = (desc || '').toLowerCase();
  const learned = getLearnedRules();
  for (const sub in learned) if (d.includes(sub)) return learned[sub];
  for (const [cat, words] of CATEGORY_RULES)
    for (const w of words) if (d.includes(w)) return cat;
  return 'Other';
}

const MERCHANT_ALIASES = [
  [['amzn','amazon'], 'Amazon'], [['uber eats','ubereats'], 'Uber Eats'], [['uber'], 'Uber'],
  [['lyft'], 'Lyft'], [['starbucks'], 'Starbucks'], [['mcdonald'], "McDonald's"],
  [['doordash'], 'DoorDash'], [['grubhub'], 'Grubhub'], [['netflix'], 'Netflix'],
  [['spotify'], 'Spotify'], [['walmart'], 'Walmart'], [['target'], 'Target'],
  [['costco'], 'Costco'], [['whole foods'], 'Whole Foods'], [['trader joe'], "Trader Joe's"],
  [['dunkin'], 'Dunkin'], [['dutch bros'], 'Dutch Bros'], [['shell'], 'Shell'],
  [['chevron'], 'Chevron'], [['adobe'], 'Adobe'], [['verizon'], 'Verizon'],
  [['chatgpt','openai'], 'ChatGPT'], [['hbo','max.com'], 'HBO Max'], [['planet fitness'], 'Planet Fitness'],
  [['steam'], 'Steam'], [['amc'], 'AMC Theatres'], [['safeway'], 'Safeway'],
];
function cleanMerchant(desc) {
  const lower = (desc || '').toLowerCase();
  for (const [keys, name] of MERCHANT_ALIASES)
    for (const k of keys) if (lower.includes(k)) return name;
  let s = (desc || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/^(sq \*|tst\*|pp\*|paypal \*|amzn mktp us\*?|amazon\.com\*?)/i, '');
  s = s.replace(/[*#]?\d{2,}\w*/g, '').replace(/\*+/g, ' ').replace(/\b[A-Z]{2}\b\s*$/, '');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return (s.slice(0, 24) || 'Unknown').replace(/\b\w/g, c => c.toUpperCase());
}

/* ------------------------------ CSV PARSING ----------------------------- */
let RAW_ROWS = [];
let HEADERS = [];

function beginIntake(file) {
  $('dzFileName').textContent = file.name || 'statement.csv';
  $('dzIdle').hidden = true; $('dzBusy').hidden = false;
  runBusy(() => handleFile(file));
}

// progress bar fill -> green checkmark -> reveal. Feels intentional, not a flicker.
function runBusy(done) {
  const bar = $('progressBar'), check = $('dzCheck'), title = $('dzBusyTitle');
  check.hidden = true; title.innerHTML = 'Analyzing<span class="ell">…</span>';
  bar.classList.remove('run'); void bar.offsetWidth; bar.classList.add('run');
  setTimeout(() => { title.textContent = 'Done'; check.hidden = false; }, 620);
  setTimeout(done, 800);
}

function resetIntake() {
  $('dzBusy').hidden = true; $('dzIdle').hidden = false;
  $('progressBar').classList.remove('run'); $('dzCheck').hidden = true;
}

function handleFile(file) {
  Papa.parse(file, {
    header: true, skipEmptyLines: true,
    complete: (res) => {
      RAW_ROWS = res.data; HEADERS = res.meta.fields || [];
      const guess = guessColumns(HEADERS);
      if (guess.date && guess.desc && guess.amount) buildAnalysis(guess);
      else showMapper(guess);
    },
    error: () => alert('Could not read that file. Make sure it is a CSV exported from your bank.')
  });
}

function guessColumns(headers) {
  const lower = headers.map(h => (h || '').toLowerCase());
  const find = (cands) => { for (const c of cands) { const i = lower.findIndex(h => h.includes(c)); if (i >= 0) return headers[i]; } return null; };
  return {
    date: find(['date','posted','transaction date']),
    desc: find(['description','name','memo','payee','merchant','details']),
    amount: find(['amount','debit','value','withdrawal']),
  };
}

function showMapper(guess) {
  $('results').hidden = false; $('landing').hidden = true; $('mapper').hidden = false;
  ['mapDate','mapDesc','mapAmount'].forEach(id => {
    const sel = $(id); sel.innerHTML = '';
    HEADERS.forEach(h => { const o = document.createElement('option'); o.value = h; o.textContent = h; sel.appendChild(o); });
  });
  if (guess.date) $('mapDate').value = guess.date;
  if (guess.desc) $('mapDesc').value = guess.desc;
  if (guess.amount) $('mapAmount').value = guess.amount;
}
$('mapApply').onclick = () => { $('mapper').hidden = true; buildAnalysis({ date: $('mapDate').value, desc: $('mapDesc').value, amount: $('mapAmount').value }); };

/* ----------------------------- THE ANALYSIS ---------------------------- */
let MODEL = null;

function parseAmount(v) {
  if (v == null) return 0;
  let s = String(v).replace(/[$,\s]/g, '').replace(/[()]/g, m => m === '(' ? '-' : '');
  return parseFloat(s) || 0;
}

function buildAnalysis(cols) {
  const txns = [];
  for (const row of RAW_ROWS) {
    const desc = row[cols.desc];
    let amt = parseAmount(row[cols.amount]);
    if (!desc || !amt) continue;
    if (amt > 0 && /payroll|salary|deposit|refund|interest|transfer in|credit/i.test(desc)) continue;
    const spend = amt < 0 ? -amt : amt;
    const date = new Date(row[cols.date]);
    txns.push({ desc, amount: spend, date: isNaN(date) ? null : date, cat: categorize(desc), merchant: cleanMerchant(desc) });
  }
  if (!txns.length) { alert('No spending transactions found — try the column mapper or a different export.'); return; }

  const total = txns.reduce((s, t) => s + t.amount, 0);
  const byCat = {}; const byMerchant = {};
  for (const t of txns) {
    byCat[t.cat] = (byCat[t.cat] || 0) + t.amount;
    if (!byMerchant[t.merchant]) byMerchant[t.merchant] = { amount: 0, count: 0, cat: t.cat };
    byMerchant[t.merchant].amount += t.amount; byMerchant[t.merchant].count++;
  }
  const cats = Object.entries(byCat).map(([name, amount]) => ({ name, amount })).sort((a,b)=>b.amount-a.amount);
  const merchants = Object.entries(byMerchant).map(([name,d]) => ({ name, ...d })).sort((a,b)=>b.amount-a.amount);

  const hourly = getHourly();
  const hoursOf = (amt) => hourly ? Math.round(amt / hourly) : null;

  const subs = detectSubscriptions(txns);
  const subMonthly = subs.reduce((s, x) => s + x.amount, 0);

  // month-over-month (read previous BEFORE overwriting)
  const prevCats = getCatHist();
  const prevTotal = parseFloat(localStorage.getItem(LS.lastTotal)) || null;
  saveCatHist(cats); localStorage.setItem(LS.lastTotal, String(total));

  const dailySeries = buildDailySeries(txns);
  const dates = txns.filter(t=>t.date).map(t=>t.date).sort((a,b)=>a-b);
  const period = dates.length ? `${dates[0].toLocaleDateString('en-US',{month:'long',day:'numeric'})} – ${dates[dates.length-1].toLocaleDateString('en-US',{month:'long',day:'numeric'})}` : 'This period';

  MODEL = { total, txns, txnCount: txns.length, cats, merchants, hourly, hoursOf,
            subs, subMonthly, prevCats, prevTotal, dailySeries, period };
  MODEL.leakCards = buildLeakCards(MODEL);
  renderResults();
}

function getHourly() {
  const val = parseFloat($('incomeInput').value);
  if (!val) return null;
  const p = $('incomePeriod').value;
  if (p === 'hour') return val;
  if (p === 'month') return val / (4.33 * 40);
  if (p === 'year') return val / (52 * 40);
  return null;
}

function getCatHist() { try { return JSON.parse(localStorage.getItem(LS.catHist)) || {}; } catch { return {}; } }
function saveCatHist(cats) { localStorage.setItem(LS.catHist, JSON.stringify(Object.fromEntries(cats.map(c=>[c.name,c.amount])))); }

function detectSubscriptions(txns) {
  const groups = {};
  for (const t of txns) (groups[t.merchant.toLowerCase()] = groups[t.merchant.toLowerCase()] || []).push(t);
  const subs = [];
  for (const key in groups) {
    const g = groups[key];
    const isKnown = g.some(t => t.cat === 'Subscriptions');
    const amounts = g.map(t => t.amount);
    const avg = amounts.reduce((a,b)=>a+b,0)/amounts.length;
    const similar = amounts.every(a => Math.abs(a - avg) < Math.max(2, avg * 0.15));
    if (isKnown || (g.length >= 2 && similar && avg < 200))
      subs.push({ name: g[0].merchant, amount: avg, count: g.length });
  }
  return subs.sort((a,b)=>b.amount-a.amount);
}

function buildDailySeries(txns) {
  const dated = txns.filter(t=>t.date);
  if (dated.length < 3) return null;
  const byDay = {};
  for (const t of dated) { const k = t.date.toISOString().slice(0,10); byDay[k] = (byDay[k]||0)+t.amount; }
  const days = Object.keys(byDay).sort();
  return { labels: days, values: days.map(d => byDay[d]) };
}

/* ----- forensic leak cards: a category as an investigative finding ----- */
function buildLeakCards(m) {
  const cur = Object.fromEntries(m.cats.map(c => [c.name, c.amount]));
  const candidates = ['Takeout & Delivery','Coffee','Shopping','Subscriptions','Restaurants','Entertainment','Transport','Cash & Transfers'];
  const cards = [];
  for (const cat of candidates) {
    const amt = cur[cat]; if (!amt || amt < 25) continue;
    const inCat = m.txns.filter(t => t.cat === cat);
    const count = inCat.length;
    const primary = m.merchants.find(x => x.cat === cat);
    const hours = m.hourly ? m.hoursOf(amt) : null;
    const prev = m.prevCats[cat];
    const pct = (prev && prev > 0) ? Math.round((amt - prev) / prev * 100) : null;
    const late = inCat.filter(t => t.date && t.date.getHours() >= 21).length;

    let detail;
    if ((cat === 'Takeout & Delivery' || cat === 'Restaurants') && late >= 2) detail = { k: 'Orders after 9PM', v: late };
    else if (cat === 'Subscriptions') detail = { k: 'Yearly pace', v: fmt(amt * 12) };
    else if (cat === 'Shopping') detail = { k: 'Avg per order', v: fmt(amt / count) };
    else detail = { k: 'Transactions', v: count };

    // intentional, semantic severity (not rainbow): up sharply = high, down = good, else watch
    let severity;
    if (pct != null && pct >= 15) severity = 'high';
    else if (pct != null && pct < 0) severity = 'good';
    else if (cat === 'Transport' || cat === 'Bills & Utilities') severity = 'neutral';
    else severity = 'warn';

    // per-category daily series for the micro-sparkline
    const byDay = {};
    for (const t of inCat) if (t.date) { const k = t.date.toISOString().slice(0,10); byDay[k] = (byDay[k]||0)+t.amount; }
    const keys = Object.keys(byDay).sort();
    const spark = keys.length >= 2 ? keys.map(k => byDay[k]) : null;

    cards.push({ cat, amt, pct, hours, count, detail, severity, spark, primary: primary ? primary.name : null });
  }
  return cards.sort((a,b) => b.amt - a.amt).slice(0, 4);
}

function sparkSVG(values) {
  if (!values || values.length < 2) return '';
  const w = 60, h = 18, max = Math.max(...values), min = Math.min(...values), rng = (max - min) || 1;
  const pts = values.map((v,i) => `${(i/(values.length-1)*w).toFixed(1)},${(h-((v-min)/rng)*h).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
}

/* ------------------------------- RENDER -------------------------------- */
let trendChart = null;

function renderResults() {
  $('landing').hidden = true; $('results').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const m = MODEL;

  // header info populates instantly — the big number IS the reveal moment
  $('revealPeriod').textContent = m.period;
  countUp($('bigTotal'), m.total);

  const delta = $('totalSub');
  if (m.prevTotal) {
    const d = m.total - m.prevTotal;
    delta.textContent = d < 0 ? `${fmt(Math.abs(d))} less than last time` : `${fmt(d)} more than last time`;
    delta.className = 'delta ' + (d < 0 ? 'down' : 'up');
  } else {
    delta.textContent = `${m.txnCount} transactions`;
    delta.className = 'delta';
  }
  $('headlineInsight').textContent = headline(m);
  renderTrend(m.dailySeries);

  // skeleton phase for the 4 lower grids, then populate after a beat.
  // The brief pulse signals "the forensic pass is running" — editorial loading.
  showSkeletons();
  setTimeout(() => {
    renderLeakCards(m.leakCards);
    renderCatList(m.cats, m.total);
    renderSubs(m.subs, m.subMonthly);
    renderMerchants(m.merchants);
    renderInsights(offlineInsights(m), 'offline');
    if (getKey()) generateAIInsights('insights');
  }, 420);
}

// editorial skeleton scaffolds — pulsing hairline shapes, no shimmer sweep
function showSkeletons() {
  $('leakCards').classList.remove('is-empty');
  $('leakCards').innerHTML = Array.from({length: 4}).map(() => `
    <div class="leak leak-skel">
      <div class="skel sk-cat"></div>
      <div class="skel sk-amt"></div>
      <div class="skel sk-line"></div>
      <div class="skel sk-line short"></div>
    </div>`).join('');
  $('catList').innerHTML = Array.from({length: 5}).map(() => `
    <div class="skel-cat">
      <div class="skel sk-name"></div>
      <div class="skel sk-amt"></div>
      <div class="skel sk-track"></div>
    </div>`).join('');
  $('subList').innerHTML = Array.from({length: 3}).map(() => `
    <div class="skel-row">
      <div class="skel sk-name"></div>
      <div class="skel sk-amt"></div>
    </div>`).join('');
  $('merchantList').innerHTML = Array.from({length: 6}).map(() => `
    <div class="skel-row">
      <div class="skel sk-name"></div>
      <div class="skel sk-amt"></div>
    </div>`).join('');
}

function headline(m) {
  const top = m.leakCards[0];
  if (!top) return 'Your spending looks steady this period.';
  const phrase = {
    'Takeout & Delivery':'convenience spending', 'Coffee':'a daily coffee habit',
    'Restaurants':'eating out', 'Shopping':'impulse shopping', 'Subscriptions':'subscriptions',
    'Entertainment':'entertainment', 'Transport':'getting around', 'Cash & Transfers':'cash & transfers'
  }[top.cat] || top.cat.toLowerCase();
  const hrs = m.hourly ? ` — about ${m.hoursOf(top.amt)} hours of work` : '';
  return `Your biggest leak was ${phrase}: ${fmt(top.amt)}${hrs}.`;
}

function countUp(el, target) {
  const dur = 750, start = performance.now();
  (function step(now){ const p = Math.min(1,(now-start)/dur); const e = 1-Math.pow(1-p,3);
    el.textContent = fmt(target*(0.15+0.85*e)); if(p<1) requestAnimationFrame(step); else el.textContent = fmt(target); })(start);
}

function renderTrend(series) {
  if (trendChart) { trendChart.destroy(); trendChart = null; }
  if (!series) { $('trendChart').style.display = 'none'; return; }
  $('trendChart').style.display = '';
  const ctx = $('trendChart');
  trendChart = new Chart(ctx, {
    type: 'line',
    data: { labels: series.labels, datasets: [{
      data: series.values, borderColor: '#6FA98C', borderWidth: 1.5,
      pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: '#6FA98C',
      tension: .35, fill: true,
      backgroundColor: (c) => { const {ctx, chartArea} = c.chart; if(!chartArea) return 'transparent';
        const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        g.addColorStop(0,'rgba(111,169,140,.18)'); g.addColorStop(1,'rgba(111,169,140,0)'); return g; }
    }] },
    options: {
      animation: { duration: 900 }, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: {
        backgroundColor:'#14161B', borderColor:'rgba(255,255,255,.1)', borderWidth:1,
        titleColor:'#9CA1AA', bodyColor:'#ECEAE3', padding:10, displayColors:false,
        callbacks: { title: (i)=> new Date(i[0].label).toLocaleDateString('en-US',{month:'short',day:'numeric'}),
                     label: (i)=> fmt(i.raw) } } },
      scales: {
        x: { display: false }, y: { display: false, beginAtZero: true }
      }
    }
  });
}

function renderLeakCards(cards) {
  const el = $('leakCards');
  if (!cards || !cards.length) {
    // editorial empty state — calm, observant, no exclamation marks
    el.classList.add('is-empty');
    el.innerHTML = `
      <svg class="empty-icon" viewBox="0 0 24 24" aria-hidden="true" style="margin:0 auto var(--s-2)">
        <path d="M4 12h16M4 12l4-4M4 12l4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity=".5"/>
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.25" opacity=".25"/>
      </svg>
      <p class="empty-title">No structural leaks identified.</p>
      <p class="empty-copy">Spending distributes evenly across categories this period — no single drain dominates. Either the account is being run with discipline, or the statement window is too narrow to surface a pattern.</p>`;
    return;
  }
  el.classList.remove('is-empty');
  el.innerHTML = cards.map(c => {
    const chg = c.pct == null ? '' :
      `<span class="chg ${c.pct >= 0 ? 'up':'down'}">${c.pct >= 0 ? '↑':'↓'} ${Math.abs(c.pct)}% vs last month</span>`;
    const hrs = c.hours != null
      ? `<div class="leak-line"><span class="k">Hours of work <span class="info" tabindex="0" data-tip="Your ${c.cat} spending ÷ your hourly take-home pay.">i</span></span><span class="v num">${c.hours}</span></div>`
      : '';
    return `
    <article class="leak sev-${c.severity}">
      <div class="leak-top">
        <span class="leak-cat">${c.cat}</span>
        ${sparkSVG(c.spark)}
      </div>
      <span class="leak-amt num">${fmt(c.amt)}</span>
      ${chg}
      <div class="leak-divider"></div>
      <div class="leak-meta">
        ${hrs}
        <div class="leak-line"><span class="k">${c.detail.k}</span><span class="v num">${c.detail.v}</span></div>
      </div>
      ${c.primary ? `<p class="leak-source">Primary source · <b>${c.primary}</b></p>` : ''}
    </article>`;
  }).join('');
}

function renderCatList(cats, total) {
  $('catNote').textContent = `${cats.length} categories · ${fmt(total)}`;
  $('catList').innerHTML = cats.slice(0, 8).map((c, i) => `
    <div class="cat-row">
      <span class="cat-name">${c.name}</span>
      <span class="cat-val">${fmt(c.amount)} · ${Math.round(c.amount/total*100)}%</span>
      <div class="cat-track"><div class="cat-fill ${i===0?'lead':''}" data-w="${Math.round(c.amount/total*100)}"></div></div>
    </div>`).join('');
  requestAnimationFrame(() => document.querySelectorAll('.cat-fill').forEach(el => el.style.width = el.dataset.w + '%'));
}

function renderSubs(subs, monthly) {
  $('subTotal').textContent = subs.length ? `${fmt(monthly)}/mo · ${fmt(monthly*12)}/yr` : 'None detected';
  if (!subs.length) {
    $('subList').innerHTML = `
      <div class="empty-frame">
        <svg class="empty-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".5"/>
        </svg>
        <p class="empty-title">No recurring monthly charges detected.</p>
        <p class="empty-copy">The account isn't tied to standing subscription commitments — or the statement window is too narrow to confirm a billing cycle.</p>
      </div>`;
    return;
  }
  $('subList').innerHTML = subs.map(s => `
    <div class="sub-row"><span>${s.name}</span>${s.count>1?`<span class="ct">×${s.count}</span>`:''}<span class="amt num">${fmt2(s.amount)}</span></div>`).join('');
}

function renderMerchants(merchants) {
  $('merchantList').innerHTML = merchants.slice(0, 8).map(m => `
    <div class="merch-row"><span>${m.name}</span><span class="ct">×${m.count}</span><span class="amt num">${fmt(m.amount)}</span></div>`).join('');
}

function renderInsights(list, mode) {
  $('insightList').innerHTML = list.map(t => `<li>${t}</li>`).join('');
  $('aiMode').textContent = mode;
}

/* ------------------- OFFLINE INSIGHTS (no AI fallback) ------------------ */
function offlineInsights(m) {
  const out = [];
  const top = m.cats[0];
  if (top) out.push(`<b>${top.name}</b> was your largest category at ${fmt(top.amount)} — ${Math.round(top.amount/m.total*100)}% of everything you spent.`);
  const takeout = m.cats.find(c=>c.name==='Takeout & Delivery');
  if (takeout && m.hourly) out.push(`Takeout cost ${fmt(takeout.amount)} — roughly ${m.hoursOf(takeout.amount)} hours of work.`);
  const topM = m.merchants[0];
  if (topM) out.push(`You paid <b>${topM.name}</b> most often — ${topM.count} times for ${fmt(topM.amount)}.`);
  if (m.subMonthly > 0) out.push(`Subscriptions quietly add up to <b>${fmt(m.subMonthly*12)} a year</b>.`);
  if (m.prevTotal && m.total < m.prevTotal) out.push(`You spent ${fmt(m.prevTotal-m.total)} less than last time.`);
  return out.slice(0, 5);
}

/* ----------------------------- GEMINI LAYER ----------------------------- */
function getKey() { return localStorage.getItem(LS.key) || ''; }

function factsForAI(m) {
  return {
    total: Math.round(m.total), transactions: m.txnCount,
    hourlyWage: m.hourly ? Math.round(m.hourly) : null,
    totalWorkHours: m.hourly ? m.hoursOf(m.total) : null,
    topCategories: m.cats.slice(0,6).map(c => ({ name:c.name, amount:Math.round(c.amount) })),
    topMerchants: m.merchants.slice(0,6).map(x => ({ name:x.name, amount:Math.round(x.amount), visits:x.count })),
    biggestLeaks: m.leakCards.map(c => ({ category:c.cat, amount:Math.round(c.amt), changePct:c.pct, primary:c.primary })),
    subscriptionsPerYear: Math.round(m.subMonthly*12),
    spentLessThanLastTime: m.prevTotal ? m.total < m.prevTotal : null
  };
}

async function callGemini(prompt) {
  const key = getKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }],
      generationConfig:{ temperature:0.85, responseMimeType:'application/json' } }) });
  if (!res.ok) throw new Error('Gemini ' + res.status);
  const data = await res.json();
  return JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
}

const GUARDRAIL = `CRITICAL: Never invent, change, or recompute any number. Use the values in FACTS exactly as given. If a value is null, don't mention it.`;
const VOICE = `Voice: calm, observant, quietly confrontational — a financial publication, not a hype app. Specific, restrained, intelligent. No emojis, no exclamation marks.`;

async function generateAIInsights(mode) {
  if (!getKey() || !MODEL) return;
  $('aiMode').textContent = mode === 'roast' ? 'roasting…' : 'thinking…';
  const facts = factsForAI(MODEL);
  const prompt = mode === 'roast'
    ? `You are roasting someone's spending — they opted in. Dry, witty, a little brutal, never cruel about income or necessities; only tease convenience and impulse habits. ${GUARDRAIL}
Write exactly 4 short lines. Output JSON: {"insights": string[]}.
FACTS: ${JSON.stringify(facts)}`
    : `Turn these spending FACTS into 4 sharp, memorable observations a person would screenshot. ${VOICE} ${GUARDRAIL}
Output JSON: {"insights": string[]}.
FACTS: ${JSON.stringify(facts)}`;
  try {
    const { insights } = await callGemini(prompt);
    if (Array.isArray(insights) && insights.length) { renderInsights(insights, mode === 'roast' ? 'roasted' : 'AI'); return; }
    throw new Error('empty');
  } catch { renderInsights(offlineInsights(MODEL), 'offline'); }
}

/* ------------------------------- SHARE CARD ----------------------------- */
function drawShareCard() {
  const c = $('shareCanvas'), ctx = c.getContext('2d'); const m = MODEL;
  ctx.fillStyle = '#0F1115'; ctx.fillRect(0,0,c.width,c.height);
  // masthead
  ctx.fillStyle = '#ECEAE3'; ctx.font = '600 16px Inter, sans-serif';
  ctx.save(); ctx.translate(40,56);
  ctx.fillText('M O N E Y   L E A K S', 0, 0); ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.beginPath(); ctx.moveTo(40,76); ctx.lineTo(500,76); ctx.stroke();

  ctx.fillStyle = '#686D76'; ctx.font = '500 14px Inter, sans-serif';
  ctx.fillText(m.period.toUpperCase(), 40, 130);
  ctx.fillStyle = '#9CA1AA'; ctx.font = '400 18px Inter, sans-serif';
  ctx.fillText('Total spent', 40, 178);
  ctx.fillStyle = '#ECEAE3'; ctx.font = '600 78px Inter, sans-serif';
  ctx.fillText(fmt(m.total), 38, 256);
  if (m.hourly) { ctx.fillStyle='#6FA98C'; ctx.font='500 19px Inter, sans-serif';
    ctx.fillText(`${m.hoursOf(m.total)} hours of work`, 40, 292); }

  ctx.fillStyle = '#686D76'; ctx.font = '500 13px Inter, sans-serif';
  ctx.fillText('THE LEAKS', 40, 350);
  m.leakCards.slice(0,3).forEach((card,i) => {
    const y = 392 + i*58;
    ctx.fillStyle = '#9CA1AA'; ctx.font = '400 12px Inter, sans-serif';
    ctx.fillText(card.cat.toUpperCase(), 40, y-18);
    ctx.fillStyle = '#ECEAE3'; ctx.font = '600 30px Inter, sans-serif';
    ctx.fillText(fmt(card.amt), 40, y+10);
    if (card.primary) { ctx.fillStyle='#686D76'; ctx.font='400 14px Inter, sans-serif'; ctx.textAlign='right';
      ctx.fillText(card.primary, 500, y+8); ctx.textAlign='left'; }
    ctx.strokeStyle='rgba(255,255,255,.05)'; ctx.beginPath(); ctx.moveTo(40,y+26); ctx.lineTo(500,y+26); ctx.stroke();
  });

  ctx.fillStyle = '#686D76'; ctx.font = '400 13px Inter, sans-serif';
  ctx.fillText('made with Money Leaks · data never left the browser', 40, c.height-30);
}

/* -------------------------------- EVENTS -------------------------------- */
const dz = $('dropzone'), fi = $('fileInput');
dz.onclick = () => fi.click();
fi.onchange = (e) => e.target.files[0] && beginIntake(e.target.files[0]);
['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('dragging'); }));
['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('dragging'); }));
dz.addEventListener('drop', e => e.dataTransfer.files[0] && beginIntake(e.dataTransfer.files[0]));

$('tryDemo').onclick = (e) => { e.stopPropagation(); loadDemo(); };
$('navSample').onclick = () => { if (!$('landing').hidden) loadDemo(); };
$('resetBtn').onclick = () => { $('results').hidden = true; $('landing').hidden = false; resetIntake(); window.scrollTo({top:0}); };

$('roastBtn').onclick = () => { if (getKey()) generateAIInsights('roast'); else { openSettings(); $('keyStatus').textContent = 'Add a Gemini key to unlock roast mode.'; } };
$('shareBtn').onclick = () => { drawShareCard(); $('shareModal').hidden = false; };
$('shareClose').onclick = () => $('shareModal').hidden = true;
$('downloadCard').onclick = () => { const a=document.createElement('a'); a.download='money-leaks.png'; a.href=$('shareCanvas').toDataURL('image/png'); a.click(); };

function openSettings(){ $('geminiKey').value = getKey(); $('settingsModal').hidden = false; }
$('settingsBtn').onclick = openSettings;
$('settingsClose').onclick = () => $('settingsModal').hidden = true;
$('saveKey').onclick = () => { localStorage.setItem(LS.key, $('geminiKey').value.trim()); $('keyStatus').textContent = 'Saved. AI features unlocked.'; if (MODEL) generateAIInsights('insights'); };
$('clearKey').onclick = () => { localStorage.removeItem(LS.key); $('geminiKey').value=''; $('keyStatus').textContent = 'Cleared. Running offline.'; };

/* ------------------------------- DEMO DATA ------------------------------ */
function loadDemo() {
  const today = new Date();
  const d = (daysAgo, h=12) => { const x=new Date(today); x.setDate(x.getDate()-daysAgo); x.setHours(h); return x.toISOString().slice(0,10); };
  const rows = [
    ['Date','Description','Amount'],
    [d(2,23),'UBER EATS SAN FRANCISCO',-42.18],[d(5,22),'DOORDASH*MCDONALDS',-23.40],[d(9,23),'UBER EATS',-31.07],
    [d(12,22),'GRUBHUB ORDER',-28.55],[d(18,23),'UBER EATS',-36.90],[d(23,22),'DOORDASH*TACO BELL',-19.25],
    [d(1,8),'STARBUCKS STORE 4412',-6.45],[d(3,8),'STARBUCKS',-7.10],[d(6,9),'DUTCH BROS',-6.75],[d(8,8),'STARBUCKS',-5.95],
    [d(11,8),'STARBUCKS',-6.45],[d(14,8),'DUNKIN #338',-4.20],[d(17,8),'STARBUCKS',-7.30],[d(21,8),'STARBUCKS',-6.45],
    [d(4,14),'WHOLE FOODS MARKET',-62.13],[d(15,14),'TRADER JOE\'S #112',-48.77],[d(27,14),'SAFEWAY',-71.20],
    [d(7,19),'AMZN MKTP US*2K4GH',-34.99],[d(10,20),'AMAZON.COM*4421',-12.49],[d(16,21),'AMZN MKTP US',-58.00],
    [d(20,18),'AMAZON.COM',-22.30],[d(25,19),'TARGET 00012',-86.40],[d(13,16),'TARGET',-54.10],
    [d(1,0),'NETFLIX.COM',-15.49],[d(1,0),'SPOTIFY USA',-11.99],[d(2,0),'ADOBE *CREATIVE CLOUD',-54.99],
    [d(3,0),'HBO MAX',-15.99],[d(5,0),'AMAZON PRIME*',-14.99],[d(7,0),'CHATGPT SUBSCRIPTION',-20.00],
    [d(6,17),'SHELL OIL 5523',-48.00],[d(19,17),'CHEVRON',-52.30],[d(22,9),'UBER TRIP',-18.40],
    [d(24,20),'AMC THEATRES',-32.00],[d(26,21),'STEAM PURCHASE',-29.99],
    [d(28,12),'VERIZON WIRELESS',-85.00],[d(15,0),'PLANET FITNESS',-24.99],
    [d(0,12),'PAYROLL DIRECT DEPOSIT',3450.00],
  ];
  const csv = rows.map(r => r.map(c => typeof c==='string' && c.includes(',') ? `"${c}"` : c).join(',')).join('\n');
  if (!$('incomeInput').value) { $('incomeInput').value = 3450; $('incomePeriod').value = 'month'; }
  $('dzFileName').textContent = 'SAMPLE_OCT_2024.csv';
  $('dzIdle').hidden = true; $('dzBusy').hidden = false;
  runBusy(() => Papa.parse(csv, { header:true, skipEmptyLines:true, complete:(res)=>{ RAW_ROWS=res.data; HEADERS=res.meta.fields;
    buildAnalysis({date:'Date',desc:'Description',amount:'Amount'}); } }));
}
