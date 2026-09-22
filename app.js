import * as db from './db.js';
import { buildSeedRecipes, SEED_VERSION, migrateRecipes } from './seed.js';
import * as C from './calc.js';

export const APP_VERSION = '1.0.5';

/* ───────────────────────── utils ───────────────────────── */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const clone = (o) => JSON.parse(JSON.stringify(o));
const pad2 = (n) => String(n).padStart(2, '0');
const fmtDate = (ts) => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}`; };
const fmtDateY = (ts) => { const d = new Date(ts); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; };
const fmtTime = (ts) => { const d = new Date(ts); return `${d.getHours()}:${pad2(d.getMinutes())}`; };
function fmtDayTime(ts) {
  const d = new Date(ts), n = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(n)) / 86400000);
  const pre = diff === 0 ? '今日 ' : diff === 1 ? (d.getHours() < 12 ? '明朝 ' : '明日 ') : diff === -1 ? '昨日 ' : `${fmtDate(ts)} `;
  return pre + fmtTime(ts);
}
function fmtDur(ms) {
  if (ms == null) return '';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}時間${r}分` : `${h}時間`;
}
function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}
const fmtMin = (m) => (m >= 120 && m % 60 === 0 ? `${m / 60}時間` : `${m}分`);
const rangeMin = (a, b) => (b && b !== a ? `${a}〜${fmtMin(b)}` : fmtMin(a));
const stars = (v) => (v == null ? '' : `★${v}`);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ───────────────────────── icons ───────────────────────── */
const svg = (p, vb = '0 0 24 24') => `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'),
  book: svg('<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5"/><path d="M8 7h7"/>'),
  fire: svg('<path d="M12 3c1 3 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z"/>'),
  note: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  star: svg('<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>'),
  starFill: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg>',
  timer: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  more: svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/>'),
};
const CAT_EMOJI = { 食パン: '🍞', ハード系: '🥖', 高加水: '🥖', 惣菜パン: '🍛', 菓子パン: '🥐', ベーグル: '🥯', ピザ: '🍕', その他: '🥨' };

/* ───────────────────────── state ───────────────────────── */
const S = {
  recipes: [], bakes: [], meta: {},
  route: { name: 'home' },
  ui: {
    scale: {}, variant: {}, plan: {}, showPct: false, dtab: {},
    filter: { q: '', cat: '', flags: new Set() },
    recFilter: '',
    edit: null,
  },
};

async function loadAll() {
  S.recipes = await db.getAll('recipes');
  S.bakes = await db.getAll('bakes');
  const metas = await db.getAll('meta');
  S.meta = Object.fromEntries(metas.map((m) => [m.key, m.value]));
}
async function setMeta(key, value) { S.meta[key] = value; await db.put('meta', { key, value }); }
function upsert(arr, obj) { const i = arr.findIndex((x) => x.id === obj.id); if (i >= 0) arr[i] = obj; else arr.push(obj); }
async function saveRecipe(r) { r.updatedAt = Date.now(); await db.put('recipes', r); upsert(S.recipes, r); }
async function saveBake(b) { b.updatedAt = Date.now(); await db.put('bakes', b); upsert(S.bakes, b); }

const recipeById = (id) => S.recipes.find((r) => r.id === id);
const bakeById = (id) => S.bakes.find((b) => b.id === id);
const variantOf = (r, vid) => r.variants.find((v) => v.id === vid) || r.variants.find((v) => v.id === r.defaultVariantId) || r.variants[0];
const doneBakes = () => S.bakes.filter((b) => b.status !== 'active').sort((a, b) => b.startedAt - a.startedAt);
const bakesOf = (rid) => doneBakes().filter((b) => b.recipeId === rid);
const activeBakes = () => S.bakes.filter((b) => b.status === 'active').sort((a, b) => b.startedAt - a.startedAt);
const lastBake = (rid) => bakesOf(rid)[0];
const lastMemoBake = (rid) => bakesOf(rid).find((b) => (b.nextMemo || '').trim());
const routeLabel = (b) => {
  const v = b.snapshot.variant; const out = [];
  C.eachStep(v.steps, (s) => { if (s.type === 'branch') { const o = s.options.find((x) => x.id === b.progress.choices[s.id]); if (o) out.push(o.label); } });
  return out.join('・');
};

function recipeFlags(r) {
  const flours = new Set();
  r.variants.forEach((v) => v.ingredientGroups.filter((g) => g.kind === 'flour').forEach((g) => g.items.forEach((i) => flours.add(i.name))));
  return {
    hb: r.variants.some((v) => v.hb && v.hb.mode !== 'none'),
    cold: r.variants.some((v) => C.hasCold(v.steps)),
    flours,
  };
}

/* ───────────────────────── router ───────────────────────── */
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, qs] = h.split('?');
  const [name, id, id2] = path.split('/');
  return { name, id: id && decodeURIComponent(id), id2, q: Object.fromEntries(new URLSearchParams(qs || '')) };
}
const go = (h) => { if (location.hash === h) render(); else location.hash = h; };
let lastRouteKey = '';

function render(keepScroll = false) {
  S.route = parseRoute();
  const r = S.route;
  const key = location.hash;
  const scrollY = window.scrollY;
  let html = '';
  try {
    switch (r.name) {
      case 'recipes': html = vRecipes(); break;
      case 'recipe': html = vRecipe(r.id); break;
      case 'make': html = r.id ? vMake(r.id) : vMakeList(); break;
      case 'records': html = vRecords(); break;
      case 'record': html = vRecord(r.id); break;
      case 'edit': html = vEdit(r.id, r.q.v); break;
      default: html = vHome();
    }
  } catch (e) {
    console.error(e);
    html = `<div class="pad"><div class="card warn">表示エラー: ${esc(e.message)}</div><button class="btn" data-act="nav" data-href="#/home">ホームへ</button></div>`;
  }
  $('#view').innerHTML = html;
  const inMake = r.name === 'make' && !!r.id;
  document.body.classList.toggle('making', inMake);
  $$('#tabs [data-tab]').forEach((t) => {
    const tab = t.dataset.tab;
    const on = tab === r.name || (tab === 'recipes' && (r.name === 'recipe' || r.name === 'edit')) || (tab === 'records' && r.name === 'record') || (tab === 'home' && !['recipes', 'recipe', 'edit', 'make', 'records', 'record'].includes(r.name));
    t.classList.toggle('on', on);
  });
  setWake(inMake);
  if (key !== lastRouteKey && !keepScroll) window.scrollTo(0, 0);
  else window.scrollTo(0, scrollY);
  lastRouteKey = key;
  renderTimerBar();
  hydratePhotos();
  tick();
}
const rerender = () => render(true);

/* ───────────────────────── common pieces ───────────────────────── */
const section = (title, body, extra = '') => `<section class="sec"><div class="sec-h"><h2>${title}</h2>${extra}</div>${body}</section>`;
const subhead = (title, sub = '', right = '', backHref = '') => `
  <header class="subhead">
    <button class="icon-btn" data-act="${backHref ? 'nav' : 'back'}" ${backHref ? `data-href="${backHref}"` : ''} aria-label="戻る">${ICON.back}</button>
    <div class="subhead-t"><div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>
    <div class="subhead-r">${right}</div>
  </header>`;

function hbBadge(hb) {
  if (!hb) return '';
  const cls = hb.recommendation === 'not_recommended' ? 'b-mute' : hb.mode === 'none' ? 'b-mute' : 'b-hb';
  const label = hb.mode === 'none' ? `HB${C.HB_REC_LABEL[hb.recommendation] || '不使用'}` : C.HB_MODE_LABEL[hb.mode];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}
const statusBadge = (s) => `<span class="badge b-status s-${esc(s)}">${esc(s)}</span>`;

/* ───────────────────────── HOME ───────────────────────── */
function vHome() {
  const act = activeBakes();
  const withLast = S.recipes.map((r) => ({ r, last: lastBake(r.id), memo: lastMemoBake(r.id) })).filter((x) => x.last).sort((a, b) => b.last.startedAt - a.last.startedAt);
  const favs = S.recipes.filter((r) => r.favorite || r.status === '定番');
  const recent = doneBakes().slice(0, 4);

  const activeHtml = act.map(activeCard).join('');
  const contHtml = withLast.slice(0, 3).map(({ r, last, memo }) => `
    <article class="card memo-card tap" data-act="nav" data-href="#/recipe/${r.id}">
      <div class="memo-top"><div class="memo-name">${esc(r.name)}</div><div class="memo-meta">前回 ${fmtDate(last.startedAt)}${last.rating != null ? ` · <span class="star">${stars(last.rating)}</span>` : ''}</div></div>
      ${memo ? `<div class="memo-next"><span class="lbl">次回メモ</span>${esc(memo.nextMemo)}</div>` : '<div class="muted small">次回メモなし</div>'}
    </article>`).join('');
  const favHtml = favs.length
    ? `<div class="hscroll">${favs.map((r) => `<button class="chip-card" data-act="nav" data-href="#/recipe/${r.id}"><span class="e">${CAT_EMOJI[r.category] || '🍞'}</span><span>${esc(r.name)}</span>${r.status === '定番' ? '<span class="badge b-status s-定番">定番</span>' : ''}</button>`).join('')}</div>`
    : '<p class="muted small">レシピ画面の ☆ でお気に入りに追加できます。</p>';
  const recentHtml = recent.map(bakeRow).join('');
  const starter = !S.bakes.length ? `
    <div class="card welcome">
      <div class="welcome-t">まずは1回焼いてみましょう</div>
      <p class="small">レシピを開いて「作る」を押すと、その時点のレシピが記録用に固定（スナップショット）され、工程ナビとタイマーが始まります。</p>
      ${S.recipes.map((r) => `<button class="list-btn" data-act="nav" data-href="#/recipe/${r.id}"><span class="e">${CAT_EMOJI[r.category] || '🍞'}</span>${esc(r.name)}<span class="chev">›</span></button>`).join('')}
    </div>` : '';

  return `
  <header class="hero">
    <div class="hero-row">
      <div><div class="hero-sub">BREAD NOTE</div><h1>パンノート</h1></div>
      <button class="icon-btn light" data-act="open-settings" aria-label="設定">${ICON.gear}</button>
    </div>
    <div class="hero-note">作って、記録して、次をもっと良く。</div>
  </header>
  <div class="pad">
    ${act.length ? section('進行中', activeHtml) : ''}
    ${starter}
    ${withLast.length ? section('前回からの続き', contHtml) : ''}
    ${section('お気に入り・定番', favHtml)}
    ${recent.length ? section('最近焼いたパン', `<div class="card list">${recentHtml}</div>`, `<button class="link" data-act="nav" data-href="#/records">すべて</button>`) : ''}
  </div>`;
}

function activeCard(b) {
  const { list } = C.flattenSteps(b.snapshot.variant.steps, b.progress.choices);
  const idx = Math.max(0, list.findIndex((x) => x.step.id === b.progress.currentStepId));
  const cur = list[idx]?.step;
  const timers = b.timers.filter((t) => !t.dismissed);
  return `
  <article class="card active-card tap" data-act="nav" data-href="#/make/${b.id}">
    <div class="ac-top"><span class="pulse"></span><span class="ac-name">${esc(b.snapshot.recipeName)}</span><span class="muted small">#${b.seq}</span></div>
    <div class="ac-step">STEP ${idx + 1}：${esc(cur?.title || '')}</div>
    ${timers.map((t) => `<div class="ac-timer">${ICON.timer}<span>${esc(t.label)}</span>${cdSpan(t, 'ac-cd')}</div>`).join('')}
    <div class="ac-go">続きから ›</div>
  </article>`;
}

function bakeRow(b) {
  const photo = b.photoIds?.[0];
  return `
  <button class="bake-row" data-act="nav" data-href="#/record/${b.id}">
    <div class="thumb sm">${photo ? `<img data-photo="${photo}" alt="">` : `<span>${CAT_EMOJI[b.snapshot.category] || '🍞'}</span>`}</div>
    <div class="br-body">
      <div class="br-t">${esc(b.snapshot.recipeName)} <span class="muted">#${b.seq}</span></div>
      <div class="br-s">${fmtDateY(b.startedAt)}${b.snapshot.variant && b.snapshot.variantName && b.snapshot.variantName !== '基本' ? ` · ${esc(b.snapshot.variantName)}` : ''}${routeLabel(b) ? ` · ${esc(routeLabel(b))}` : ''}${b.status === 'aborted' ? ' · <span class="warn-t">途中終了</span>' : ''}</div>
      ${b.nextMemo ? `<div class="br-memo">次回：${esc(b.nextMemo.split('\n')[0])}</div>` : ''}
    </div>
    <div class="br-r">${b.rating != null ? `<span class="star">${stars(b.rating)}</span>` : ''}</div>
  </button>`;
}

/* ───────────────────────── RECIPES ───────────────────────── */
function vRecipes() {
  const f = S.ui.filter;
  const allFlours = new Set();
  S.recipes.forEach((r) => recipeFlags(r).flours.forEach((x) => allFlours.add(x)));
  const cats = C.CATEGORIES.filter((c) => S.recipes.some((r) => r.category === c));
  const flagDefs = [['fav', '☆ お気に入り'], ['teiban', '定番'], ['hb', 'HB使用'], ['cold', '冷蔵発酵'], ['sameday', '当日完成'], ...[...allFlours].map((x) => [`flour:${x}`, x])];
  return `
  <header class="pagehead"><h1>レシピ</h1><span class="muted small">${S.recipes.length}件</span></header>
  <div class="pad">
    <div class="search"><input type="search" placeholder="名前・材料・粉で検索" value="${esc(f.q)}" data-on="filter-q" enterkeyhint="search"></div>
    <div class="chips">
      <button class="chip ${!f.cat ? 'on' : ''}" data-act="filter-cat" data-v="">すべて</button>
      ${cats.map((c) => `<button class="chip ${f.cat === c ? 'on' : ''}" data-act="filter-cat" data-v="${esc(c)}">${esc(c)}</button>`).join('')}
    </div>
    <div class="chips sm">${flagDefs.map(([k, l]) => `<button class="chip sm ${f.flags.has(k) ? 'on' : ''}" data-act="filter-flag" data-v="${esc(k)}">${esc(l)}</button>`).join('')}</div>
    <div class="rlist">${recipeListHtml()}</div>
  </div>`;
}

function recipeListHtml() {
  const f = S.ui.filter;
  const q = f.q.trim().toLowerCase();
  const list = S.recipes.filter((r) => {
    const fl = recipeFlags(r);
    if (f.cat && r.category !== f.cat) return false;
    for (const k of f.flags) {
      if (k === 'fav' && !r.favorite) return false;
      if (k === 'teiban' && r.status !== '定番') return false;
      if (k === 'hb' && !fl.hb) return false;
      if (k === 'cold' && !fl.cold) return false;
      if (k === 'sameday' && !(r.tags || []).includes('当日完成')) return false;
      if (k.startsWith('flour:') && !fl.flours.has(k.slice(6))) return false;
    }
    if (q) {
      const hay = [r.name, r.category, ...(r.tags || []), ...r.variants.flatMap((v) => v.ingredientGroups.flatMap((g) => g.items.map((i) => i.name)))].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (b.favorite - a.favorite) || a.name.localeCompare(b.name, 'ja'));
  return list.map(recipeCard).join('') || '<p class="muted center">該当するレシピがありません</p>';
}

function recipeCard(r) {
  const fl = recipeFlags(r);
  const last = lastBake(r.id);
  const photoBake = bakesOf(r.id).find((b) => b.photoIds?.length);
  const photo = photoBake?.photoIds[0];
  const n = bakesOf(r.id).length;
  return `
  <article class="rcard tap" data-act="nav" data-href="#/recipe/${r.id}">
    <div class="thumb">${photo ? `<img data-photo="${photo}" alt="">` : `<span>${CAT_EMOJI[r.category] || '🍞'}</span>`}</div>
    <div class="rc-body">
      <div class="rc-t">${esc(r.name)}</div>
      <div class="rc-meta">${esc(r.category)} ${statusBadge(r.status)}</div>
      <div class="rc-badges">${fl.hb ? '<span class="badge b-hb">HB</span>' : ''}${fl.cold ? '<span class="badge b-cold">冷蔵OK</span>' : ''}${r.variants.length > 1 ? `<span class="badge">${r.variants.length}通り</span>` : ''}</div>
      <div class="rc-last">${last ? `前回 ${fmtDate(last.startedAt)}${last.rating != null ? ` · <span class="star">${stars(last.rating)}</span>` : ''} · ${n}回` : '<span class="muted">まだ焼いていません</span>'}</div>
    </div>
    <button class="fav ${r.favorite ? 'on' : ''}" data-act="fav" data-id="${r.id}" aria-label="お気に入り">${r.favorite ? ICON.starFill : ICON.star}</button>
  </article>`;
}

/* ───────────────────────── RECIPE DETAIL ───────────────────────── */
const scaleKey = (r, v) => `${r.id}|${v.id}`;
const scaleInput = (r, v) => S.ui.scale[scaleKey(r, v)] || {};
const curScale = (r, v) => C.scaleFor(v, scaleInput(r, v));

function vRecipe(id) {
  const r = recipeById(id);
  if (!r) return `<div class="pad"><p>レシピが見つかりません</p></div>`;
  const v = variantOf(r, S.ui.variant[r.id]);
  const sc = curScale(r, v);
  const pb = C.planBranch(v);
  const plan = pb ? (pb.options.some((o) => o.id === S.ui.plan[r.id]) ? S.ui.plan[r.id] : pb.options[0].id) : null;
  const amt = C.computeAmounts(v, sc, plan);
  const tab = S.ui.dtab[r.id] || 'ing';
  const memo = lastMemoBake(r.id);
  const last = lastBake(r.id);
  const act = activeBakes().filter((b) => b.recipeId === r.id);
  const nBakes = bakesOf(r.id).length;
  const hasColdV = C.hasCold(v.steps);
  const ferm = [];
  C.eachStep(v.steps, (s) => { if (s.type === 'branch') s.options.forEach((o) => ferm.push(o.label)); });

  const yieldTxt = v.scaleMode === 'count'
    ? `${C.fmtCount(sc.count)}${v.countUnit || '個'}`
    : v.baseCount ? `${C.pieces(v.baseCount * sc.factor)}${esc(v.countUnit || '個')}分`
    : sc.factor !== 1 ? `${esc(v.yieldLabel)} ×${sc.factor.toFixed(2)}` : esc(v.yieldLabel);

  return `
  <header class="rhead">
    <div class="rhead-row">
      <button class="icon-btn light" data-act="nav" data-href="#/recipes" aria-label="戻る">${ICON.back}</button>
      <div class="rhead-r">
        <button class="icon-btn light ${r.favorite ? 'fav-on' : ''}" data-act="fav" data-id="${r.id}" aria-label="お気に入り">${r.favorite ? ICON.starFill : ICON.star}</button>
        <button class="icon-btn light" data-act="nav" data-href="#/edit/${r.id}?v=${v.id}" aria-label="編集">${ICON.edit}</button>
      </div>
    </div>
    <div class="rhead-cat">${esc(r.category)} · v${r.version} ${statusBadge(r.status)}</div>
    <h1>${esc(r.name)}</h1>
    ${r.description ? `<p class="rhead-desc">${esc(r.description)}</p>` : ''}
  </header>
  <div class="pad detail">
    ${memo ? `<div class="card next-banner"><div class="nb-h">前回からの改善点 <span class="muted small">#${memo.seq} · ${fmtDate(memo.startedAt)}${memo.rating != null ? ` · ${stars(memo.rating)}` : ''}</span></div><div class="nb-b">${esc(memo.nextMemo)}</div></div>` : ''}
    ${r.reviewNote ? `<div class="card review-note">⚠️ ${esc(r.reviewNote)}</div>` : ''}
    ${r.variants.length > 1 ? `<div class="seg">${r.variants.map((x) => `<button class="${x.id === v.id ? 'on' : ''}" data-act="variant" data-r="${r.id}" data-v="${x.id}">${esc(x.name)}</button>`).join('')}</div>` : ''}

    <div class="summary">
      <div class="sm-i"><div class="k">粉</div><div class="v">${Math.round(sc.flour)}g</div></div>
      <div class="sm-i"><div class="k">分量</div><div class="v">${yieldTxt}</div></div>
      <div class="sm-i"><div class="k">水分率</div><div class="v">${amt.hydration != null ? Math.round(amt.hydration) + '%' : '-'}</div></div>
      <div class="sm-i"><div class="k">難易度</div><div class="v diff">${'★'.repeat(r.difficulty || 0)}<span>${'★'.repeat(Math.max(0, 4 - (r.difficulty || 0)))}</span></div></div>
    </div>
    <div class="sum-line">${hbBadge(v.hb)}${hasColdV ? `<span class="badge b-cold">${esc(ferm.join(' / '))}</span>` : ''}${v.bakeSummary ? `<span class="badge">${esc(v.bakeSummary)}</span>` : ''}</div>

    ${pb ? `<div class="plan-h">発酵の計画 <span class="muted small">作り始めに選びます</span></div><div class="seg plan">${pb.options.map((o) => `<button class="${o.id === plan ? 'on' : ''}" data-act="plan" data-r="${r.id}" data-p="${o.id}">${o.icon || ''} ${esc(o.label)}</button>`).join('')}</div>` : ''}
    ${scalePanel(r, v, sc)}

    <div class="tabs3">
      <button class="${tab === 'ing' ? 'on' : ''}" data-act="dtab" data-r="${r.id}" data-t="ing">材料</button>
      <button class="${tab === 'steps' ? 'on' : ''}" data-act="dtab" data-r="${r.id}" data-t="steps">工程</button>
      <button class="${tab === 'log' ? 'on' : ''}" data-act="dtab" data-r="${r.id}" data-t="log">記録${nBakes ? `<span class="cnt">${nBakes}</span>` : ''}</button>
    </div>
    <div class="tabbody">
      ${tab === 'ing' ? ingredientsBlock(v, amt, true) : tab === 'steps' ? stepsBlock(v, amt, plan) : logBlock(r)}
    </div>
  </div>
  <div class="startbar">
    ${act.length ? `<button class="btn ghost" data-act="nav" data-href="#/make/${act[0].id}">進行中 #${act[0].seq}</button>` : ''}
    <button class="btn primary big" data-act="start" data-r="${r.id}" data-v="${v.id}">${ICON.fire}このレシピで作る</button>
  </div>`;
}

function scalePanel(r, v, sc) {
  const changed = Object.keys(scaleInput(r, v)).length > 0 && Math.abs(sc.factor - 1) > 1e-9;
  let body = '';
  if (v.scaleMode === 'count') {
    body = `
      <div class="stepper">
        <button data-act="scale-count" data-d="-1" aria-label="減らす">−</button>
        <div class="stepper-v"><b>${C.fmtCount(sc.count)}</b><span>${esc(v.countUnit || '個')}</span></div>
        <button data-act="scale-count" data-d="1" aria-label="増やす">＋</button>
      </div>
      <div class="scale-note">粉 ${Math.round(sc.flour)}g（基準 ${v.baseCount}${esc(v.countUnit || '個')}・${v.baseFlour}g）</div>`;
  } else if (v.scaleMode === 'panVolume') {
    const pan = sc.pan;
    const presetId = pan.custom ? 'custom' : C.PAN_PRESETS.find((p) => p.w === pan.w && p.d === pan.d && p.h === pan.h)?.id || 'custom';
    body = `
      <select data-on="scale-pan">
        ${C.PAN_PRESETS.map((p) => `<option value="${p.id}" ${presetId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        <option value="custom" ${presetId === 'custom' ? 'selected' : ''}>寸法を入力（内寸cm）</option>
      </select>
      ${presetId === 'custom' ? `<div class="dims">
        <label>幅<input type="number" inputmode="decimal" step="0.1" value="${pan.w}" data-on="scale-dim" data-k="w"></label>×
        <label>奥<input type="number" inputmode="decimal" step="0.1" value="${pan.d}" data-on="scale-dim" data-k="d"></label>×
        <label>高<input type="number" inputmode="decimal" step="0.1" value="${pan.h}" data-on="scale-dim" data-k="h"></label></div>` : ''}
      <div class="scale-note">容積 ${Math.round(C.panVolume(pan))}cm³ ／ 基準型の <b>${sc.factor.toFixed(2)}倍</b> → 推奨粉量 <b>約${Math.round(sc.flour)}g</b></div>`;
  } else {
    body = `
      <div class="stepper">
        <button data-act="scale-flour" data-d="-10" aria-label="10g減らす">−</button>
        <div class="stepper-v"><input type="number" inputmode="decimal" value="${Math.round(sc.flour * 10) / 10}" data-on="scale-flour-in"><span>g</span></div>
        <button data-act="scale-flour" data-d="10" aria-label="10g増やす">＋</button>
      </div>
      <div class="quick">${[0.5, 1, 1.5, 2].map((m) => `<button class="chip sm ${Math.abs(sc.factor - m) < 1e-9 ? 'on' : ''}" data-act="scale-mul" data-m="${m}">×${m}</button>`).join('')}</div>
      ${v.baseCount ? `<div class="quick">${[1, 2, 3, 4].map((n) => `<button class="chip sm ${Math.abs(sc.factor * v.baseCount - n) < 1e-9 ? 'on' : ''}" data-act="scale-mul" data-m="${n / v.baseCount}">${n}${esc(v.countUnit || '個')}</button>`).join('')}</div>
      <div class="scale-note">分割 <b>${C.pieces(v.baseCount * sc.factor)}${esc(v.countUnit || '個')}</b>（1${esc(v.countUnit || '個')}あたり粉 約${Math.round(v.baseFlour / v.baseCount)}gが基準）</div>` : ''}`;
  }
  return `
  <div class="card scale-card">
    <div class="scale-h"><span>分量変更 <span class="muted small">${C.SCALE_MODE_LABEL[v.scaleMode]}</span></span>${changed ? `<button class="link" data-act="scale-reset">元に戻す</button>` : ''}</div>
    ${body}
  </div>`;
}

function ingredientsBlock(v, amt, interactive) {
  const show = S.ui.showPct;
  const groups = amt.groups.map((g) => {
    const flourSum = g.kind === 'flour' ? g.rows.reduce((s, r) => s + (r.raw || 0), 0) : 0;
    const head = `<div class="ig-h"><span>${esc(g.name)}</span>${g.kind === 'flour' ? `<span class="muted small">合計 ${Math.round(flourSum)}g${show ? ' = 100%' : ''}</span>` : ''}</div>`;
    const rows = g.rows.map((r) => {
      const range = C.fmtRange(r);
      const pct = show && r.pct ? C.fmtPct(r.pct.target) : '';
      const pbx = C.planBranch(v);
      const planTxt = r.byPlan && pbx ? pbx.options.map((o) => `${o.label} ${C.fmtNum(r.byPlan[o.id], r.precision)}g`).join(' ／ ') : '';
      const sub = [planTxt, range && `幅 ${range}`, r.perCount && `1${esc(v.countUnit || '個')}あたり ${C.fmtPerCount(r.perCount)}`, r.note && esc(r.note)].filter(Boolean).join(' · ');
      return `
      <div class="ig-row">
        <div class="ig-name">${esc(r.name)}${r.tentative ? '<span class="badge b-warn">要確認</span>' : ''}${r.precision === 0.1 ? '<span class="prec" title="0.1g単位で計量">0.1</span>' : ''}</div>
        <div class="ig-g">${r.text != null ? `<span class="txt">${esc(r.text)}</span>` : `${C.fmtNum(r.g, r.precision)}<small>g</small>`}</div>
        ${show ? `<div class="ig-p">${pct}</div>` : ''}
        ${sub ? `<div class="ig-sub">${sub}</div>` : ''}
      </div>`;
    }).join('');
    return `<div class="ig ${g.kind}">${head}${rows}</div>`;
  }).join('');
  const totals = `<div class="ig-total"><span>生地総量 約${Math.round(amt.dough)}g${amt.piece ? ` ／ 1${esc(v.countUnit || '個')} 約${Math.round(amt.piece)}g` : ''}</span>${amt.hydration != null ? `<span>水分率 約${Math.round(amt.hydration)}%</span>` : ''}</div>`;
  return `
  ${interactive ? `<label class="pct-toggle"><span class="switch"><input type="checkbox" ${show ? 'checked' : ''} data-on="toggle-pct"><span></span></span>配合を見る（ベーカーズ％）</label>` : ''}
  <div class="card ing-card">${groups}${totals}</div>
  ${v.hb ? hbCard(v.hb) : ''}
  ${v.tips?.length ? `<div class="card tips"><div class="tips-h">ポイント</div><ul>${v.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}`;
}

function hbCard(hb) {
  return `<div class="card hb-card"><div class="hb-h">${hbBadge(hb)}${hb.model ? `<span class="muted small">${esc(hb.model)}${hb.course ? ` · ${esc(hb.course)}` : ''}</span>` : ''}</div>${hb.notes?.length ? `<ul>${hb.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</div>`;
}

function stepMetaChips(s) {
  const out = [];
  if (s.timer) out.push(`<span class="mchip">${ICON.timer}${rangeMin(s.timer.min, s.timer.max)}</span>`);
  if (s.ferment) out.push(`<span class="mchip ferm">🌡 ${esc(s.ferment.temp || '')}${s.ferment.min ? ` ${rangeMin(s.ferment.min, s.ferment.max)}` : ''}</span>`);
  if (s.cold) out.push(`<span class="mchip cold">❄ ${s.cold.minH}〜${s.cold.maxH}時間</span>`);
  if (s.tentative) out.push('<span class="badge b-warn">要確認</span>');
  return out.join('');
}

function stepsBlock(v, amt, plan = null) {
  let n = 0;
  const renderList = (steps, startN) => {
    let k = startN;
    return steps.map((s) => {
      if (s.type === 'branch') {
        const base = k;
        return `
        <div class="branch">
          <div class="branch-h">${s.atStart ? '発酵の計画で分かれる工程' : `分岐：${esc(s.title)}`}</div>
          ${s.body ? `<div class="branch-b">${esc(s.body)}</div>` : ''}
          <div class="branch-opts">
            ${s.options.map((o) => `<div class="bopt ${s.atStart && plan && plan !== o.id ? 'dim' : ''}"><div class="bopt-h"><span class="e">${o.icon || ''}</span>${esc(o.label)}</div><div class="bopt-s">${esc(o.sub || '')}</div><ol class="steps mini">${renderList(o.steps, base)}</ol></div>`).join('')}
          </div>
        </div>`;
      }
      k++;
      const uses = (s.uses || []).map((u) => useLine(u, amt)).filter(Boolean);
      return `
      <li class="step">
        <span class="num">${k}</span>
        <div class="step-c">
          <div class="step-t">${esc(s.title)} ${stepMetaChips(s)}</div>
          ${uses.length ? `<div class="step-uses">${uses.join('、')}</div>` : ''}
          <div class="step-b">${esc(C.tpl(s.body, amt))}</div>
          ${s.ferment?.cue ? `<div class="step-cue">目安：${esc(s.ferment.cue)}</div>` : ''}
          ${s.hb ? `<div class="step-hb">HB｜${esc(s.hb)}</div>` : ''}
          ${s.tips?.length ? `<div class="step-tips">${s.tips.map((t) => `・${esc(t)}`).join('<br>')}</div>` : ''}
        </div>
      </li>`;
    }).join('');
  };
  return `<ol class="steps">${renderList(v.steps, n)}</ol>`;
}

function useLine(u, amt) {
  const ref = typeof u === 'string' ? u : u.ref;
  const r = amt.rows[ref];
  if (!r) return '';
  if (typeof u === 'object' && u.pctOfFlour) return `${esc(u.label || r.name)} ${C.partG(r, u.pctOfFlour, amt.flour)}`;
  if (typeof u === 'object' && u.show === 'min' && r.min != null) return `${esc(r.name)} ${C.fmtNum(r.min, r.precision)}g`;
  return `${esc(r.name)} ${esc(C.fmtAmount(r))}`;
}

function logBlock(r) {
  const list = bakesOf(r.id);
  if (!list.length) return '<p class="muted center">まだ記録がありません。「このレシピで作る」から始めると自動で記録されます。</p>';
  return `<div class="card list">${list.map(bakeRow).join('')}</div>`;
}

/* ───────────────────────── MAKE ───────────────────────── */
function vMakeList() {
  const act = activeBakes();
  return `
  <header class="pagehead"><h1>作る</h1></header>
  <div class="pad">
    ${act.length ? section('進行中', act.map(activeCard).join('')) : '<p class="muted">進行中のパンはありません。</p>'}
    ${section('レシピを選んで開始', `<div class="card list">${S.recipes.map((r) => `<button class="list-btn" data-act="nav" data-href="#/recipe/${r.id}"><span class="e">${CAT_EMOJI[r.category] || '🍞'}</span>${esc(r.name)}<span class="chev">›</span></button>`).join('')}</div>
      <p class="muted small">レシピ画面で分量・作り方（バリエーション）を選んでから開始します。</p>`)}
  </div>`;
}

function makeCtx(b) {
  const v = b.snapshot.variant;
  const fl = C.flattenSteps(v.steps, b.progress.choices);
  let idx = fl.list.findIndex((x) => x.step.id === b.progress.currentStepId);
  if (idx < 0) idx = 0;
  return { v, fl, idx, cur: fl.list[idx], amt: b.snapshot.amounts };
}

function vMake(id) {
  const b = bakeById(id);
  if (!b) return `<div class="pad"><p>製作データが見つかりません</p><button class="btn" data-act="nav" data-href="#/home">ホームへ</button></div>`;
  if (b.status !== 'active') { setTimeout(() => go(`#/record/${b.id}`)); return ''; }
  const { v, fl, idx, cur, amt } = makeCtx(b);
  const s = cur.step;
  const log = b.progress.log[s.id] || {};
  const isLast = idx === fl.list.length - 1 && !fl.unresolved;
  const next = fl.list[idx + 1]?.step;
  const pct = Math.round(((idx + 1) / fl.estTotal) * 100);
  const otherTimers = b.timers.filter((t) => !t.dismissed && t.stepId !== s.id);

  let main = '';
  if (s.type === 'branch') {
    main = `
      <div class="mk-title">${esc(s.title)}</div>
      ${s.body ? `<div class="mk-body">${esc(s.body)}</div>` : ''}
      <div class="branch-pick">
        ${s.options.map((o) => `<button class="bpick ${b.progress.choices[s.id] === o.id ? 'on' : ''}" data-act="branch" data-b="${b.id}" data-s="${s.id}" data-o="${o.id}">
          <span class="bp-e">${o.icon || ''}</span><span class="bp-l">${esc(o.label)}</span><span class="bp-s">${esc(o.sub || '')}</span>
          ${o.steps[0]?.cold ? `<span class="bp-s">今入れると <b>${fmtDayTime(Date.now() + o.steps[0].cold.minH * 3600000)}〜${fmtDayTime(Date.now() + o.steps[0].cold.maxH * 3600000)}</b></span>` : ''}
        </button>`).join('')}
      </div>`;
  } else {
    const uses = (s.uses || []).map((u) => {
      const ref = typeof u === 'string' ? u : u.ref;
      const r = amt.rows[ref];
      if (!r) return '';
      if (typeof u === 'object' && u.pctOfFlour) {
        return `<div class="mk-ing"><span class="n">${esc(u.label || r.name)}</span><span class="g">${esc(C.partG(r, u.pctOfFlour, amt.flour))}</span><span class="sub">合計 ${esc(C.fmtAmount(r))} のうち</span></div>`;
      }
      const minOnly = typeof u === 'object' && u.show === 'min' && r.min != null;
      const g = minOnly ? `${C.fmtNum(r.min, r.precision)}g` : C.fmtAmount(r);
      const sub = minOnly ? `まずこの量 ／ 硬ければ追加（最大${C.fmtNum(r.max, r.precision)}g）` : (r.min != null || r.max != null) ? `幅 ${C.fmtRange(r)}` : '';
      return `<div class="mk-ing"><span class="n">${esc(r.name)}${r.tentative ? ' <span class="badge b-warn">要確認</span>' : ''}</span><span class="g">${esc(g)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</div>`;
    }).join('');
    main = `
      ${cur.opt ? `<div class="mk-route">ルート：${esc(cur.opt)}</div>` : ''}
      <div class="mk-title">${esc(s.title)}${s.tentative ? ' <span class="badge b-warn">要確認</span>' : ''}</div>
      ${uses ? `<div class="mk-ings">${uses}</div>` : ''}
      <div class="mk-body">${esc(C.tpl(s.body, amt))}</div>
      ${s.hb ? `<div class="mk-hb">HB｜${esc(s.hb)}</div>` : ''}
      ${s.ferment ? fermentPanel(b, s, log) : ''}
      ${s.cold ? coldPanel(b, s, log) : ''}
      ${s.timer ? timerPanel(b, s) : customTimerPanel(b, s)}
      ${s.tips?.length ? `<div class="mk-tips">${s.tips.map((t) => `💡 ${esc(t)}`).join('<br>')}</div>` : ''}`;
  }

  return `
  <div class="mk">
    <header class="mk-head">
      <button class="icon-btn" data-act="nav" data-href="#/home" aria-label="閉じる">${ICON.close}</button>
      <div class="mk-head-t"><div class="t">${esc(b.snapshot.recipeName)} <span class="muted">#${b.seq}</span></div>
        <div class="s">${b.snapshot.variantName !== '基本' ? esc(b.snapshot.variantName) + ' · ' : ''}粉${Math.round(b.snapshot.scale.flour)}g${b.snapshot.scale.mode === 'count' ? ` · ${C.fmtCount(b.snapshot.scale.count)}${esc(v.countUnit || '個')}` : v.baseCount ? ` · ${C.pieces(b.snapshot.amounts.count)}${esc(v.countUnit || '個')}` : ''} · v${b.snapshot.recipeVersion}</div></div>
      <button class="icon-btn" data-act="make-menu" data-b="${b.id}" aria-label="メニュー">${ICON.more}</button>
    </header>
    <div class="mk-prog"><div style="width:${pct}%"></div></div>
    ${b.snapshot.plan ? `<div class="mk-plan">${esc(b.snapshot.plan.icon || '')} 計画：${esc(b.snapshot.plan.label)}</div>` : ''}
    <div class="mk-stepno">STEP ${idx + 1}<span> / ${fl.estTotal}${fl.unresolved ? '〜' : ''}</span><span class="wake" id="wake-ind"></span></div>
    ${otherTimers.length ? `<div class="mk-others">${otherTimers.map((t) => `<button class="ot ${t.firedAt ? 'fired' : ''}" data-act="goto-step" data-b="${b.id}" data-s="${t.stepId}">${ICON.timer}<span>${esc(t.label)}</span>${cdSpan(t)}</button>`).join('')}</div>` : ''}
    <div class="mk-main">${main}</div>
    ${next && s.type !== 'branch' ? `<div class="mk-next">次：${esc(next.title)}</div>` : ''}
    <div class="mk-nav">
      <button class="btn ghost big" data-act="step-prev" data-b="${b.id}" ${idx === 0 ? 'disabled' : ''}>← 前へ</button>
      ${s.type === 'branch' ? '<div class="mk-nav-hint">ルートを選んでください</div>'
        : `<button class="btn primary big" data-act="${isLast ? 'finish' : 'step-next'}" data-b="${b.id}">${isLast ? '完成！記録へ' : '完了して次へ →'}</button>`}
    </div>
  </div>`;
}

function cdSpan(t, cls = '') {
  if (t.pausedRem != null) return `<span class="cd paused ${cls}" data-mode="down" data-rem="${t.pausedRem / 1000}">${fmtClock(t.pausedRem / 1000)}</span>`;
  return `<span class="cd ${cls}" data-mode="down" data-end="${t.endAt}"></span>`;
}

function timersForStep(b, s) { return b.timers.filter((t) => t.stepId === s.id && !t.dismissed); }

function timerControls(b, t) {
  const paused = t.pausedRem != null;
  return `
  <div class="tm ${t.firedAt ? 'fired' : ''}">
    <div class="tm-l">${esc(t.label)}${t.maxEndAt ? `<span class="muted small">（上限 ${fmtTime(t.maxEndAt)}）</span>` : ''}</div>
    <div class="tm-cd">${cdSpan(t, 'big-cd')}</div>
    <div class="tm-end">${paused ? '一時停止中' : t.firedAt ? `${fmtTime(t.endAt)} に終了` : `終了 ${fmtTime(t.endAt)}`}</div>
    <div class="tm-btns">
      ${t.firedAt ? '' : paused ? `<button class="btn" data-act="t-resume" data-b="${b.id}" data-t="${t.id}">再開</button>` : `<button class="btn" data-act="t-pause" data-b="${b.id}" data-t="${t.id}">一時停止</button>`}
      <button class="btn" data-act="t-add" data-b="${b.id}" data-t="${t.id}">＋1分</button>
      <button class="btn ghost" data-act="t-cancel" data-b="${b.id}" data-t="${t.id}">${t.firedAt ? '閉じる' : '取消'}</button>
    </div>
  </div>`;
}

function timerPanel(b, s) {
  const ts = timersForStep(b, s);
  if (ts.length) return `<div class="panel">${ts.map((t) => timerControls(b, t)).join('')}</div>`;
  const { min, max } = s.timer;
  const opts = max && max !== min ? [...new Set([min, Math.round((min + max) / 2), max])] : [min];
  return `
  <div class="panel">
    <button class="btn primary huge" data-act="t-start" data-b="${b.id}" data-s="${s.id}" data-m="${opts[0]}">${ICON.timer}${fmtClock(opts[0] * 60)} タイマー開始</button>
    ${opts.length > 1 ? `<div class="alt-mins">${opts.slice(1).map((m) => `<button class="chip" data-act="t-start" data-b="${b.id}" data-s="${s.id}" data-m="${m}">${m}分で開始</button>`).join('')}</div>` : ''}
  </div>`;
}
function customTimerPanel(b, s) {
  const ts = timersForStep(b, s);
  if (ts.length) return `<div class="panel">${ts.map((t) => timerControls(b, t)).join('')}</div>`;
  if (s.ferment || s.cold) return '';
  return `<div class="panel slim"><button class="link" data-act="t-custom" data-b="${b.id}" data-s="${s.id}">${ICON.timer} タイマーを追加</button></div>`;
}

function fermentPanel(b, s, log) {
  const f = s.ferment;
  const target = f.min ? rangeMin(f.min, f.max) : '';
  if (!log.fermentStart) {
    return `
    <div class="panel ferm">
      <div class="pf-h">🌡 ${esc(f.temp || '')}${target ? ` · ${target}` : ''}</div>
      ${f.cue ? `<div class="pf-cue">目安：${esc(f.cue)}</div>` : ''}
      <button class="btn primary huge" data-act="ferm-start" data-b="${b.id}" data-s="${s.id}">発酵開始</button>
    </div>`;
  }
  const st = log.fermentStart;
  const judges = log.judgements || [];
  return `
  <div class="panel ferm">
    <div class="pf-h">🌡 ${esc(f.temp || '')}${f.cue ? ` · 目安：${esc(f.cue)}` : ''}</div>
    <div class="pf-grid">
      <div><div class="k">開始</div><div class="v">${fmtTime(st)}</div></div>
      <div><div class="k">経過</div><div class="v"><span class="cd" data-mode="up" data-start="${st}"></span></div></div>
      <div><div class="k">目標</div><div class="v">${f.min ? `${fmtTime(st + f.min * 60000)}${f.max ? `〜${fmtTime(st + f.max * 60000)}` : ''}` : '見た目で判断'}</div></div>
    </div>
    <div class="judge">
      ${[['early', 'まだ早い'], ['good', 'ちょうどいい'], ['done', '発酵完了']].map(([k, l]) => `<button class="btn j-${k}" data-act="ferm-judge" data-b="${b.id}" data-s="${s.id}" data-v="${k}">${l}</button>`).join('')}
    </div>
    ${judges.length ? `<div class="judges">${judges.map((j) => `<span>${fmtTime(j.at)} ${esc(JUDGE[j.v])}（${fmtDur(j.at - st)}）</span>`).join('')}</div>` : ''}
  </div>`;
}
const JUDGE = { early: 'まだ早い', good: 'ちょうどいい', done: '発酵完了' };

function coldPanel(b, s, log) {
  const c = s.cold;
  if (!log.coldStart) {
    const now = Date.now();
    return `
    <div class="panel cold">
      <div class="pf-h">❄ 推奨 ${c.minH}〜${c.maxH}時間</div>
      <div class="pf-cue">今入れると ${fmtDayTime(now + c.minH * 3600000)}〜${fmtDayTime(now + c.maxH * 3600000)}</div>
      <button class="btn primary huge" data-act="cold-start" data-b="${b.id}" data-s="${s.id}">冷蔵庫に入れた</button>
    </div>`;
  }
  const st = log.coldStart;
  return `
  <div class="panel cold">
    <div class="pf-grid">
      <div><div class="k">冷蔵開始</div><div class="v">${fmtTime(st)}</div></div>
      <div><div class="k">経過</div><div class="v"><span class="cd" data-mode="up" data-start="${st}"></span></div></div>
      <div><div class="k">推奨</div><div class="v">${c.minH}〜${c.maxH}h</div></div>
    </div>
    <div class="cold-window">取り出し目安<br><b>${fmtDayTime(st + c.minH * 3600000)} 〜 ${fmtDayTime(st + c.maxH * 3600000)}</b></div>
  </div>`;
}

/* make actions */
function stepNextLabel(b, stepId) {
  const { list, unresolved } = C.flattenSteps(b.snapshot.variant.steps, b.progress.choices);
  const i = list.findIndex((x) => x.step.id === stepId);
  const n = list[i + 1]?.step;
  if (n) return n.type === 'branch' ? `分岐：${n.title}` : n.title;
  return unresolved ? 'ルート選択' : '完成';
}
function addTimer(b, s, minutes, { maxMinutes = null, label = null, kind = 'step' } = {}) {
  const now = Date.now();
  const t = {
    id: uid('t'), stepId: s.id, kind, label: label || s.timer?.label || s.title,
    durationSec: Math.round(minutes * 60), startedAt: now, endAt: now + minutes * 60000,
    maxEndAt: maxMinutes ? now + maxMinutes * 60000 : null,
    pausedRem: null, firedAt: null, maxFiredAt: null, dismissed: false,
  };
  b.timers.push(t);
  const L = (b.progress.log[s.id] ||= {});
  L.timerStart ||= now;
  return t;
}
function gotoStep(b, stepId) {
  b.progress.currentStepId = stepId;
  const L = (b.progress.log[stepId] ||= {});
  L.startedAt ||= Date.now();
}
async function stepNext(b) {
  const { fl, idx, cur } = makeCtx(b);
  const now = Date.now();
  const L = (b.progress.log[cur.step.id] ||= {});
  L.doneAt = now;
  // step timers end with the step (fired or not)
  b.timers.forEach((t) => { if (t.stepId === cur.step.id && t.kind !== 'custom') t.dismissed = true; });
  b.timers = b.timers.filter((t) => !t.dismissed);
  const n = fl.list[idx + 1];
  if (n) gotoStep(b, n.step.id);
  await saveBake(b);
}
async function finishBake(b, status = 'done') {
  const { cur } = makeCtx(b);
  const now = Date.now();
  const L = (b.progress.log[cur.step.id] ||= {});
  L.doneAt ||= now;
  b.timers = [];
  b.status = status;
  b.finishedAt = now;
  await saveBake(b);
  stopAlarm();
  go(`#/record/${b.id}`);
}

async function startBake(r, v, planId = null) {
  const sc = curScale(r, v);
  const pb = C.planBranch(v);
  const planOpt = pb ? pb.options.find((o) => o.id === planId) || pb.options[0] : null;
  const amt = C.computeAmounts(v, sc, planOpt?.id);
  const now = Date.now();
  const seq = Math.max(0, ...S.bakes.filter((b) => b.recipeId === r.id).map((b) => b.seq || 0)) + 1;
  const first = v.steps[0];
  const b = {
    id: uid('bake'), recipeId: r.id, seq, status: 'active',
    startedAt: now, finishedAt: null, createdAt: now, updatedAt: now,
    // ── immutable snapshot of the recipe at the moment baking started
    snapshot: {
      takenAt: now,
      recipeId: r.id, recipeName: r.name, category: r.category, recipeVersion: r.version,
      variantId: v.id, variantName: v.name,
      variant: clone(v),
      scale: clone(sc),
      amounts: clone(amt),
      plan: planOpt ? { branchId: pb.id, id: planOpt.id, label: planOpt.label, icon: planOpt.icon || '' } : null,
    },
    progress: { currentStepId: first.id, choices: planOpt ? { [pb.id]: planOpt.id } : {}, log: { [first.id]: { startedAt: now } } },
    timers: [],
    env: { room: '', water: '' },
    rating: null, scores: {}, notes: '', bakeMemo: '', nextMemo: '',
    photoIds: [],
  };
  await saveBake(b);
  go(`#/make/${b.id}`);
}

/* ───────────────────────── timers engine ───────────────────────── */
let audioCtx = null;
function unlockAudio() {
  try {
    // iOS 17+: play alarms even when the ring/silent switch is on silent
    if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* ignore */ }
}
function beep() {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  for (let i = 0; i < 3; i++) {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = i === 2 ? 1175 : 880;
    const t = t0 + i * 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g).connect(audioCtx.destination);
    o.start(t); o.stop(t + 0.26);
  }
}
const alarmQueue = [];
let alarmLoop = null;
function stopAlarm() { clearInterval(alarmLoop); alarmLoop = null; }
function pushAlarm(a) {
  alarmQueue.push(a);
  if (alarmQueue.length === 1) showAlarm();
}
function showAlarm() {
  const a = alarmQueue[0];
  if (!a) { $('#modal-root').innerHTML = ''; stopAlarm(); return; }
  const b = bakeById(a.bakeId);
  const t = a.timer;
  const late = Date.now() - a.at;
  const onStep = b && b.status === 'active' && b.progress.currentStepId === t.stepId;
  const msg = a.kind === 'max' ? '上限時間になりました' : t.kind === 'ferment' ? `目標下限（${fmtMin(Math.round(t.durationSec / 60))}）になりました` : `${fmtMin(Math.round(t.durationSec / 60))}経過しました`;
  $('#modal-root').innerHTML = `
  <div class="modal-bg"><div class="modal alarm" role="alertdialog">
    <div class="alarm-ico">⏰</div>
    <div class="alarm-t">${esc(t.label)}</div>
    <div class="alarm-m">${esc(msg)}</div>
    ${t.kind === 'ferment' ? '<div class="alarm-s">見た目を確認して判定してください</div>' : ''}
    <div class="alarm-next">次：${esc(stepNextLabel(b, t.stepId))}</div>
    ${late > 90000 ? `<div class="alarm-s">${fmtTime(a.at)} に終了（${fmtDur(late)}前）</div>` : ''}
    <div class="alarm-btns">
      ${onStep && t.kind === 'step' ? `<button class="btn primary big" data-act="alarm-next">次の工程へ</button>` : ''}
      <button class="btn big ${onStep && t.kind === 'step' ? '' : 'primary'}" data-act="alarm-ok">OK</button>
    </div>
    <div class="muted small">${esc(b?.snapshot.recipeName || '')}</div>
  </div></div>`;
  unlockAudio(); beep();
  if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
  stopAlarm();
  let n = 0;
  alarmLoop = setInterval(() => { beep(); if (++n > 30) stopAlarm(); }, 1600);
}
async function ackAlarm(goNext) {
  const a = alarmQueue.shift();
  stopAlarm();
  if (a && goNext) {
    const b = bakeById(a.bakeId);
    if (b && b.progress.currentStepId === a.timer.stepId) {
      await stepNext(b);
      if (S.route.name !== 'make' || S.route.id !== b.id) go(`#/make/${b.id}`); else rerender();
    }
  }
  showAlarm();
}

function tick() {
  const now = Date.now();
  $$('.cd').forEach((el) => {
    if (el.dataset.mode === 'up') {
      el.textContent = fmtClock((now - +el.dataset.start) / 1000);
      return;
    }
    const rem = el.dataset.rem != null ? +el.dataset.rem : (+el.dataset.end - now) / 1000;
    if (rem >= 0) { el.textContent = fmtClock(Math.ceil(rem)); el.classList.remove('over'); }
    else { el.textContent = '+' + fmtClock(-rem); el.classList.add('over'); }
  });
  // fire timers
  let changed = false;
  for (const b of activeBakes()) {
    let bc = false;
    for (const t of b.timers) {
      if (t.dismissed || t.pausedRem != null) continue;
      if (!t.firedAt && now >= t.endAt) {
        t.firedAt = now; changed = bc = true;
        pushAlarm({ bakeId: b.id, timer: t, kind: 'end', at: t.endAt });
      } else if (t.maxEndAt && !t.maxFiredAt && now >= t.maxEndAt) {
        t.maxFiredAt = now; changed = bc = true;
        pushAlarm({ bakeId: b.id, timer: t, kind: 'max', at: t.maxEndAt });
      }
    }
    if (bc) saveBake(b);
  }
  if (changed) rerender();
}

function renderTimerBar() {
  const bar = $('#timerbar');
  const inMake = S.route.name === 'make' && S.route.id;
  const items = [];
  if (!inMake) {
    for (const b of activeBakes()) for (const t of b.timers.filter((x) => !x.dismissed)) items.push({ b, t });
  }
  bar.innerHTML = items.slice(0, 3).map(({ b, t }) => `<button class="tb ${t.firedAt ? 'fired' : ''}" data-act="nav" data-href="#/make/${b.id}">${ICON.timer}<span class="tb-l">${esc(t.label)}</span><span class="muted small">${esc(b.snapshot.recipeName)}</span>${cdSpan(t)}</button>`).join('');
  bar.classList.toggle('show', items.length > 0);
  document.body.classList.toggle('has-timerbar', items.length > 0);
}

/* ───────────────────────── wake lock ───────────────────────── */
let wakeLock = null, wakeWanted = false;
async function setWake(on) {
  wakeWanted = on;
  if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; updateWakeInd(); });
    } catch { wakeLock = null; }
  } else if (!on && wakeLock) {
    try { await wakeLock.release(); } catch { /* ignore */ }
    wakeLock = null;
  }
  updateWakeInd();
}
function updateWakeInd() {
  const el = $('#wake-ind');
  if (!el) return;
  el.textContent = wakeLock ? '☀ 画面点灯中' : 'wakeLock' in navigator ? '' : '画面の自動ロックに注意';
}

/* ───────────────────────── RECORDS ───────────────────────── */
function vRecords() {
  const f = S.ui.recFilter;
  const list = doneBakes().filter((b) => !f || b.recipeId === f);
  const rids = [...new Set(doneBakes().map((b) => b.recipeId))];
  return `
  <header class="pagehead"><h1>記録</h1><span class="muted small">${doneBakes().length}回</span></header>
  <div class="pad">
    ${activeBakes().length ? `<div class="card info tap" data-act="nav" data-href="#/make">製作中 ${activeBakes().length}件 ›</div>` : ''}
    ${rids.length > 1 ? `<div class="chips"><button class="chip ${!f ? 'on' : ''}" data-act="rec-filter" data-v="">すべて</button>${rids.map((id) => `<button class="chip ${f === id ? 'on' : ''}" data-act="rec-filter" data-v="${id}">${esc(recipeById(id)?.name || doneBakes().find((b) => b.recipeId === id).snapshot.recipeName)}</button>`).join('')}</div>` : ''}
    ${list.length ? `<div class="card list">${list.map(bakeRow).join('')}</div>` : '<p class="muted center">まだ記録がありません</p>'}
  </div>`;
}

function stepLogRows(b) {
  const { list } = C.flattenSteps(b.snapshot.variant.steps, b.progress.choices);
  return list.map(({ step: s }) => {
    if (s.type === 'branch') return null;
    const L = b.progress.log[s.id];
    if (!L) return null;
    const start = L.fermentStart || L.coldStart || L.timerStart;
    if (!start && !s.ferment && !s.cold && !s.timer) return null;
    const dur = start && L.doneAt ? L.doneAt - start : null;
    const j = L.judgements?.length ? JUDGE[L.judgements[L.judgements.length - 1].v] : '';
    return { title: s.title, dur, j, start };
  }).filter(Boolean);
}

function vRecord(id) {
  const b = bakeById(id);
  if (!b) return `<div class="pad"><p>記録が見つかりません</p></div>`;
  const snap = b.snapshot;
  const v = snap.variant;
  const amt = snap.amounts;
  const logRows = stepLogRows(b);
  const r = recipeById(b.recipeId);
  const route = routeLabel(b);
  const photos = b.photoIds || [];

  const starBtns = [1, 2, 3, 4, 5].map((k) => {
    const val = b.rating ?? 0;
    const cls = val >= k ? 'full' : val >= k - 0.5 ? 'half' : '';
    return `<button class="st ${cls}" data-act="rate" data-b="${b.id}" data-k="${k}" aria-label="${k}">★</button>`;
  }).join('');

  return `
  ${subhead(`${esc(snap.recipeName)} <span class="muted">#${b.seq}</span>`, `${fmtDateY(b.startedAt)} ${fmtTime(b.startedAt)}開始${b.finishedAt ? ` · 所要 ${fmtDur(b.finishedAt - b.startedAt)}` : ''}`, '', '#/records')}
  <div class="pad record">
    ${b.status === 'active' ? `<div class="card info tap" data-act="nav" data-href="#/make/${b.id}">製作中です。作るモードに戻る ›</div>` : ''}
    <div class="rec-tags"><span class="badge">v${snap.recipeVersion}</span>${snap.variantName !== '基本' ? `<span class="badge">${esc(snap.variantName)}</span>` : ''}${route ? `<span class="badge b-cold">${esc(route)}</span>` : ''}<span class="badge">粉${Math.round(snap.scale.flour)}g${snap.scale.mode === 'count' ? ` · ${C.fmtCount(snap.scale.count)}${esc(v.countUnit || '個')}` : ''}</span>${b.status === 'aborted' ? '<span class="badge b-warn">途中終了</span>' : ''}</div>

    ${section('総合評価', `<div class="stars">${starBtns}<span class="st-v">${b.rating != null ? b.rating : '-'}</span></div><div class="muted small">同じ星をもう一度タップで ½ 減</div>`)}

    ${section('次回メモ', `<textarea class="next-memo" rows="3" placeholder="例：次回は水＋5g／二次発酵＋10分／230℃を3分延長" data-on="rec" data-b="${b.id}" data-k="nextMemo">${esc(b.nextMemo)}</textarea><div class="muted small">次にこのレシピを開くと最上部に表示されます</div>`)}

    ${section('写真', `
      <div class="photos">
        ${photos.map((pid, i) => `<div class="ph"><img data-photo="${pid}" alt=""><span class="ph-l">${i === 0 ? '外観' : i === 1 ? '断面' : ''}</span><button class="ph-x" data-act="photo-del" data-b="${b.id}" data-p="${pid}" aria-label="削除">×</button></div>`).join('')}
        <label class="ph add">${ICON.camera}<span>${photos.length === 0 ? '外観' : photos.length === 1 ? '断面' : '追加'}</span><input type="file" accept="image/*" data-on="photo-add" data-b="${b.id}" hidden></label>
      </div>`)}

    ${section('環境', `
      <div class="env">
        <label>室温<span><input type="number" inputmode="decimal" value="${esc(b.env.room)}" data-on="rec" data-b="${b.id}" data-k="env.room">℃</span></label>
        <label>水温<span><input type="number" inputmode="decimal" value="${esc(b.env.water)}" data-on="rec" data-b="${b.id}" data-k="env.water">℃</span></label>
      </div>`)}

    ${logRows.length ? section('工程ログ', `<div class="card list">${logRows.map((x) => `<div class="log-row"><span>${esc(x.title)}</span><span class="lr-v">${x.dur != null ? fmtDur(x.dur) : x.start ? '計測中' : '-'}${x.j ? `<small>${esc(x.j)}</small>` : ''}</span></div>`).join('')}</div>`) : ''}

    ${section('焼成メモ', `<textarea rows="2" placeholder="${esc(v.bakeSummary || '例：250℃ 10分 → 230℃ 17分')}" data-on="rec" data-b="${b.id}" data-k="bakeMemo">${esc(b.bakeMemo)}</textarea>`)}
    ${section('感想', `<textarea rows="3" placeholder="外観・クラム・食感など" data-on="rec" data-b="${b.id}" data-k="notes">${esc(b.notes)}</textarea>`)}

    <details class="card snap">
      <summary>この時のレシピ（スナップショット v${snap.recipeVersion}）</summary>
      <div class="muted small">作り始めた ${fmtDateY(snap.takenAt)} ${fmtTime(snap.takenAt)} 時点の内容です。レシピを編集してもここは変わりません。</div>
      ${ingredientsBlock(v, amt, false)}
      ${stepsBlock(v, amt)}
    </details>

    <div class="rec-foot">
      ${r ? `<button class="btn" data-act="nav" data-href="#/recipe/${r.id}">レシピを開く</button>` : ''}
      <button class="btn danger ghost" data-act="bake-del" data-b="${b.id}">この記録を削除</button>
    </div>
  </div>`;
}

/* photos */
const photoUrls = new Map();
async function hydratePhotos() {
  for (const img of $$('img[data-photo]')) {
    const id = img.dataset.photo;
    let u = photoUrls.get(id);
    if (!u) {
      const p = await db.get('photos', id);
      if (!p) continue;
      u = URL.createObjectURL(p.blob);
      photoUrls.set(id, u);
    }
    img.src = u;
  }
}
function resizeImage(file, max = 1600) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      cv.toBlob((bl) => (bl ? resolve({ blob: bl, w, h }) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読み込めませんでした')); };
    img.src = url;
  });
}

/* ───────────────────────── EDITOR ───────────────────────── */
function makeDraft(r, vid) {
  const d = clone(r);
  const v = variantOf(d, vid);
  for (const g of v.ingredientGroups) for (const it of g.items) {
    if (it.basis === 'flour') it._g = { target: gOf(it.pct.target, v), min: gOf(it.pct.min, v), max: gOf(it.pct.max, v) };
    if (it.byPlan) { it._gp = {}; for (const [k, pp] of Object.entries(it.byPlan)) it._gp[k] = gOf(pp.target, v); }
  }
  return { rid: r.id, vid: v.id, d, note: '' };
}
const gOf = (pct, v) => (pct == null ? '' : Math.round((pct / 100) * v.baseFlour * 100) / 100);

function vEdit(rid, vid) {
  const r = recipeById(rid);
  if (!r) return '<div class="pad">レシピが見つかりません</div>';
  if (!S.ui.edit || S.ui.edit.rid !== rid || S.ui.edit.vid !== variantOf(r, vid).id) S.ui.edit = makeDraft(r, vid);
  const E = S.ui.edit, d = E.d, v = variantOf(d, E.vid);
  const flourSum = v.ingredientGroups.filter((g) => g.kind === 'flour').flatMap((g) => g.items).reduce((s, it) => s + (+it._g?.target || 0), 0);
  const inp = (f, val, attrs = '') => `<input data-on="ed" data-f="${f}" value="${esc(val ?? '')}" ${attrs}>`;
  const num = (f, val, ph = '') => `<input type="number" inputmode="decimal" step="any" data-on="ed" data-f="${f}" value="${esc(val ?? '')}" placeholder="${ph}">`;

  const ingHtml = v.ingredientGroups.map((g, gi) => `
    <div class="ed-group">
      <div class="ed-gh">${esc(g.name)}${g.kind === 'flour' ? `<span class="muted small">合計 ${Math.round(flourSum * 10) / 10}g → 基準粉量</span>` : ''}</div>
      ${g.items.map((it, ii) => `
        <div class="ed-item">
          <div class="ed-row">${inp(`it:${gi}:${ii}:name`, it.name, 'placeholder="材料名"')}<button class="icon-btn sm" data-act="ed-del-item" data-g="${gi}" data-i="${ii}" aria-label="削除">${ICON.close}</button></div>
          ${it.byPlan ? `<div class="ed-row g3">${Object.keys(it._gp).map((k) => `<label>${esc(C.planBranch(v)?.options.find((o) => o.id === k)?.label || k)} g${num(`it:${gi}:${ii}:gp_${k}`, it._gp[k])}</label>`).join('')}</div>
            <div class="ed-row"><label class="inline">計量単位 <select data-on="ed" data-f="it:${gi}:${ii}:precision"><option value="1" ${it.precision !== 0.1 ? 'selected' : ''}>1g</option><option value="0.1" ${it.precision === 0.1 ? 'selected' : ''}>0.1g</option></select></label></div>`
          : it.basis === 'flour' ? `<div class="ed-row g3"><label>g${num(`it:${gi}:${ii}:gT`, it._g.target)}</label><label>最小${num(`it:${gi}:${ii}:gMin`, it._g.min, '-')}</label><label>最大${num(`it:${gi}:${ii}:gMax`, it._g.max, '-')}</label></div>
            <div class="ed-row"><label class="inline">計量単位 <select data-on="ed" data-f="it:${gi}:${ii}:precision"><option value="1" ${it.precision !== 0.1 ? 'selected' : ''}>1g</option><option value="0.1" ${it.precision === 0.1 ? 'selected' : ''}>0.1g</option></select></label><label class="inline"><input type="checkbox" data-on="ed" data-f="it:${gi}:${ii}:tentative" ${it.tentative ? 'checked' : ''}>要確認</label></div>`
          : it.basis === 'perCount' ? `<div class="ed-row g3"><label>1個g${num(`it:${gi}:${ii}:pcT`, it.perCount.target)}</label><label>最小${num(`it:${gi}:${ii}:pcMin`, it.perCount.min, '-')}</label><label>最大${num(`it:${gi}:${ii}:pcMax`, it.perCount.max, '-')}</label></div>`
          : `<div class="ed-row"><label class="grow">量（文字）${inp(`it:${gi}:${ii}:text`, it.text)}</label></div>`}
          <div class="ed-row">${inp(`it:${gi}:${ii}:note`, it.note, 'placeholder="メモ（任意）"')}</div>
        </div>`).join('')}
      ${g.kind === 'flour' || g.kind === 'dough' ? `<button class="link" data-act="ed-add-item" data-g="${gi}">＋ 材料を追加</button>` : ''}
    </div>`).join('');

  const stepHtml = (steps, depth = 0) => steps.map((s) => {
    if (s.type === 'branch') {
      return `<div class="ed-branch"><div class="ed-gh">分岐：${inp(`st:${s.id}:title`, s.title)}</div>${s.options.map((o) => `<div class="ed-opt"><div class="ed-opt-h">${esc(o.icon || '')} ${esc(o.label)}</div>${stepHtml(o.steps, depth + 1)}</div>`).join('')}</div>`;
    }
    return `
    <div class="ed-step">
      <div class="ed-row">${inp(`st:${s.id}:title`, s.title, 'placeholder="工程名"')}${depth === 0 ? `<button class="icon-btn sm" data-act="ed-del-step" data-s="${s.id}" aria-label="削除">${ICON.close}</button>` : ''}</div>
      <textarea rows="3" data-on="ed" data-f="st:${s.id}:body">${esc(s.body)}</textarea>
      <div class="ed-row g3"><label>タイマー分${num(`st:${s.id}:tMin`, s.timer?.min, 'なし')}</label><label>上限分${num(`st:${s.id}:tMax`, s.timer?.max, '-')}</label><label class="inline"><input type="checkbox" data-on="ed" data-f="st:${s.id}:tentative" ${s.tentative ? 'checked' : ''}>要確認</label></div>
      ${s.ferment ? `<div class="ed-row g3"><label>温度${inp(`st:${s.id}:fTemp`, s.ferment.temp)}</label><label>発酵 分${num(`st:${s.id}:fMin`, s.ferment.min, '-')}</label><label>〜分${num(`st:${s.id}:fMax`, s.ferment.max, '-')}</label></div><div class="ed-row"><label class="grow">見た目の目安${inp(`st:${s.id}:fCue`, s.ferment.cue)}</label></div>` : ''}
      ${s.cold ? `<div class="ed-row g3"><label>冷蔵 最短h${num(`st:${s.id}:cMin`, s.cold.minH)}</label><label>最長h${num(`st:${s.id}:cMax`, s.cold.maxH)}</label></div>` : ''}
    </div>`;
  }).join('');

  return `
  ${subhead('レシピを編集', `${esc(r.name)} · 現在 v${r.version}`, '', `#/recipe/${r.id}`)}
  <div class="pad editor">
    <div class="card info small">保存すると v${r.version + 1} になります。過去の製作記録はスナップショットなので変わりません。</div>
    ${section('基本', `
      <label class="fld">名前${inp('meta:name', d.name)}</label>
      <div class="ed-row g2">
        <label class="fld">カテゴリー<select data-on="ed" data-f="meta:category">${C.CATEGORIES.map((c) => `<option ${d.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="fld">ステータス<select data-on="ed" data-f="meta:status">${C.STATUSES.map((c) => `<option ${d.status === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      </div>
      <label class="fld">説明<textarea rows="2" data-on="ed" data-f="meta:description">${esc(d.description)}</textarea></label>`)}
    ${d.variants.length > 1 ? `<div class="seg">${d.variants.map((x) => `<button class="${x.id === v.id ? 'on' : ''}" data-act="ed-variant" data-v="${x.id}">${esc(x.name)}</button>`).join('')}</div><p class="muted small">バリエーションを切り替えると、未保存の変更は破棄されます。</p>` : ''}
    ${section('分量の基準', `
      <div class="muted small">${C.SCALE_MODE_LABEL[v.scaleMode]} ／ 基準粉量は粉の合計（${Math.round(flourSum * 10) / 10}g）</div>
      <label class="fld">分量の表示${inp('var:yieldLabel', v.yieldLabel)}</label>
      ${v.scaleMode === 'count' ? `<label class="fld">基準の個数${num('var:baseCount', v.baseCount)}</label>` : v.scaleMode === 'flour' ? `<label class="fld">基準の個数（分割数・任意）${num('var:baseCount', v.baseCount, 'なし')}</label>` : ''}
      ${v.scaleMode === 'panVolume' ? `<div class="ed-row g3"><label>型 幅cm${num('pan:w', v.basePan.w)}</label><label>奥cm${num('pan:d', v.basePan.d)}</label><label>高cm${num('pan:h', v.basePan.h)}</label></div>` : ''}
      <label class="fld">焼成の要約${inp('var:bakeSummary', v.bakeSummary)}</label>`)}
    ${section('材料（基準分量のgで入力 → ％に変換して保存）', ingHtml)}
    ${section('工程', `${stepHtml(v.steps)}<button class="link" data-act="ed-add-step">＋ 工程を追加（最後に）</button>`)}
    ${section('変更メモ', `<input data-on="ed" data-f="note" value="${esc(E.note)}" placeholder="例：水＋5g">`)}
    <div class="ed-foot">
      <button class="btn ghost" data-act="ed-cancel">破棄</button>
      <button class="btn primary big" data-act="ed-save">v${r.version + 1} として保存</button>
    </div>
  </div>`;
}

function edSet(f, el) {
  const E = S.ui.edit; if (!E) return;
  const d = E.d, v = variantOf(d, E.vid);
  const val = el.type === 'checkbox' ? el.checked : el.value;
  const numv = (x) => (x === '' || x == null ? null : +x);
  const [kind, a, b2, c] = f.split(':');
  if (kind === 'note') E.note = val;
  else if (kind === 'meta') d[a] = val;
  else if (kind === 'var') v[a] = a === 'baseCount' ? numv(val) : val;
  else if (kind === 'pan') v.basePan[a] = numv(val);
  else if (kind === 'it') {
    const it = v.ingredientGroups[+a].items[+b2];
    switch (c) {
      case 'name': case 'note': case 'text': it[c] = val; break;
      case 'precision': it.precision = +val; break;
      case 'tentative': it.tentative = val; break;
      case 'gT': it._g.target = numv(val); break;
      case 'gMin': it._g.min = numv(val); break;
      case 'gMax': it._g.max = numv(val); break;
      case 'pcT': it.perCount.target = numv(val); break;
      case 'pcMin': it.perCount.min = numv(val); break;
      case 'pcMax': it.perCount.max = numv(val); break;
      default: if (c.startsWith('gp_')) it._gp[c.slice(3)] = numv(val);
    }
  } else if (kind === 'st') {
    const s = C.findStep(v.steps, a);
    if (!s) return;
    switch (b2) {
      case 'title': case 'body': s[b2] = val; break;
      case 'tentative': s.tentative = val; break;
      case 'tMin': { const m = numv(val); if (m) s.timer = { ...(s.timer || {}), min: m }; else delete s.timer; break; }
      case 'tMax': if (s.timer) { const m = numv(val); if (m) s.timer.max = m; else delete s.timer.max; } break;
      case 'fTemp': s.ferment.temp = val; break;
      case 'fCue': s.ferment.cue = val; break;
      case 'fMin': s.ferment.min = numv(val) || undefined; break;
      case 'fMax': s.ferment.max = numv(val) || undefined; break;
      case 'cMin': s.cold.minH = numv(val); break;
      case 'cMax': s.cold.maxH = numv(val); break;
    }
  }
}

async function edSave() {
  const E = S.ui.edit;
  const orig = recipeById(E.rid);
  const d = clone(E.d);
  const v = variantOf(d, E.vid);
  const flourItems = v.ingredientGroups.filter((g) => g.kind === 'flour').flatMap((g) => g.items);
  const base = flourItems.reduce((s, it) => s + (+it._g?.target || 0), 0);
  if (!(base > 0)) { toast('粉の合計が0gです'); return; }
  if (v.scaleMode === 'count' && !(v.baseCount > 0)) { toast('基準の個数を入力してください'); return; }
  if (v.scaleMode === 'panVolume' && !(C.panVolume(v.basePan) > 0)) { toast('型の寸法を入力してください'); return; }
  v.baseFlour = Math.round(base * 100) / 100;
  for (const g of v.ingredientGroups) {
    g.items = g.items.filter((it) => (it.name || '').trim());
    for (const it of g.items) {
      if (it.byPlan) {
        for (const [k, g] of Object.entries(it._gp)) {
          if (g == null) { toast(`「${it.name}」の量を入力してください`); return; }
          it.byPlan[k] = { target: (g / base) * 100 };
        }
        it.pct = { ...Object.values(it.byPlan)[0] };
        delete it._gp; delete it._g;
      } else if (it.basis === 'flour') {
        const gg = it._g;
        if (gg.target == null) { toast(`「${it.name}」のgを入力してください`); return; }
        it.pct = { target: (gg.target / base) * 100 };
        if (gg.min != null) it.pct.min = (gg.min / base) * 100;
        if (gg.max != null) it.pct.max = (gg.max / base) * 100;
        delete it._g;
      }
    }
  }
  // keep the old version for future history UI
  await db.put('recipeVersions', { id: `${orig.id}@v${orig.version}`, recipeId: orig.id, version: orig.version, savedAt: Date.now(), data: clone(orig) });
  d.version = orig.version + 1;
  d.changeLog = [...(orig.changeLog || []), { version: d.version, at: Date.now(), note: E.note || '' }];
  if (!flourItems.some((it) => it.tentative) && !JSON.stringify(v).includes('"tentative":true')) delete d.reviewNote;
  await saveRecipe(d);
  S.ui.edit = null;
  toast(`v${d.version} として保存しました`);
  go(`#/recipe/${d.id}`);
}

/* ───────────────────────── SETTINGS / BACKUP ───────────────────────── */
function openSettings() {
  const theme = S.meta.theme || 'system';
  $('#sheet-root').innerHTML = `
  <div class="sheet-bg" data-act="close-sheet"></div>
  <div class="sheet" role="dialog">
    <div class="sheet-h"><h2>設定・バックアップ</h2><button class="icon-btn" data-act="close-sheet" aria-label="閉じる">${ICON.close}</button></div>
    <div class="sheet-b">
      ${section('表示', `<div class="seg">${[['system', 'システム'], ['light', 'ライト'], ['dark', 'ダーク']].map(([k, l]) => `<button class="${theme === k ? 'on' : ''}" data-act="theme" data-v="${k}">${l}</button>`).join('')}</div>`)}
      ${section('アラーム音', `<p class="small">タイマー終了時に鳴ります。音量とマナースイッチを確認してください。</p><button class="btn block" data-act="sound-test">🔔 音をテスト</button>`)}
      ${section('バックアップ（JSON）', `
        <p class="small">レシピ・記録・設定をまとめて1ファイルに保存します。${S.meta.lastBackupAt ? `最終：${fmtDateY(S.meta.lastBackupAt)}` : '<b>まだ一度も保存していません。</b>'}</p>
        <label class="inline small"><input type="checkbox" id="bk-photos" checked> 写真も含める（ファイルが大きくなります）</label>
        <button class="btn primary block" data-act="export">書き出す</button>
        <div class="gap"></div>
        <div class="seg sm" id="imp-mode"><button class="on" data-act="imp-mode" data-v="merge">統合（同じIDは上書き）</button><button data-act="imp-mode" data-v="replace">全て置き換え</button></div>
        <label class="btn block">JSONから復元<input type="file" accept="application/json,.json" data-on="import" hidden></label>`)}
      ${section('保存領域', `<p class="small" id="storage-info">確認中…</p>`)}
      ${section('初期データ', `
        <button class="btn block" data-act="reseed">初期レシピ3件を再登録（同じIDは初期状態に戻る）</button>
        <button class="btn danger ghost block" data-act="wipe">全データを削除</button>`)}
      <p class="muted small center">パンノート v${APP_VERSION}</p>
    </div>
  </div>`;
  document.body.classList.add('sheet-open');
  storageInfo();
}
async function storageInfo() {
  const el = $('#storage-info'); if (!el) return;
  let txt = '';
  try {
    const est = await navigator.storage?.estimate?.();
    if (est) txt += `使用量 約${(est.usage / 1024 / 1024).toFixed(1)}MB。`;
    const p = await navigator.storage?.persisted?.();
    txt += p ? '永続保存：有効。' : '永続保存：未許可（ホーム画面に追加すると安定します）。';
  } catch { txt = '取得できませんでした'; }
  el.textContent = txt;
}
function closeSheet() { $('#sheet-root').innerHTML = ''; document.body.classList.remove('sheet-open'); }

const blobToDataURL = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });

async function exportJSON(withPhotos) {
  const data = {
    app: 'bread-note', schema: 1, appVersion: APP_VERSION, exportedAt: new Date().toISOString(),
    recipes: await db.getAll('recipes'),
    recipeVersions: await db.getAll('recipeVersions'),
    bakes: await db.getAll('bakes'),
    meta: (await db.getAll('meta')).filter((m) => m.key !== 'lastBackupAt'),
    photos: [],
  };
  if (withPhotos) {
    for (const p of await db.getAll('photos')) {
      const { blob, ...rest } = p;
      data.photos.push({ ...rest, type: blob.type, dataUrl: await blobToDataURL(blob) });
    }
  }
  const d = new Date();
  const name = `bread-note-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}.json`;
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  let done = false;
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); done = true; }
  } catch (e) { if (e.name === 'AbortError') return; }
  if (!done) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  await setMeta('lastBackupAt', Date.now());
  toast('書き出しました');
}

async function importJSON(file, mode) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { toast('JSONを読み込めませんでした'); return; }
  if (data?.app !== 'bread-note' || !Array.isArray(data.recipes)) { toast('パンノートのバックアップではありません'); return; }
  const msg = `レシピ${data.recipes.length}件・記録${(data.bakes || []).length}件・写真${(data.photos || []).length}枚を${mode === 'replace' ? '【現在のデータを全て消して】' : ''}復元します。よろしいですか？`;
  if (!confirm(msg)) return;
  if (mode === 'replace') for (const s of db.STORES) await db.clear(s);
  for (const r of data.recipes) await db.put('recipes', r);
  for (const r of data.recipeVersions || []) await db.put('recipeVersions', r);
  for (const b of data.bakes || []) await db.put('bakes', b);
  for (const m of data.meta || []) await db.put('meta', m);
  for (const p of data.photos || []) {
    const { dataUrl, type, ...rest } = p;
    const blob = await (await fetch(dataUrl)).blob();
    await db.put('photos', { ...rest, blob });
  }
  photoUrls.clear();
  await loadAll();
  applyTheme();
  closeSheet();
  toast('復元しました');
  go('#/home');
}

function applyTheme() {
  const t = S.meta.theme || 'system';
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
}

/* ───────────────────────── events ───────────────────────── */
const A = {
  nav: (el) => go(el.dataset.href),
  back: () => (history.length > 1 ? history.back() : go('#/home')),
  'open-settings': openSettings,
  'close-sheet': closeSheet,
  async fav(el) { const r = recipeById(el.dataset.id); r.favorite = !r.favorite; await saveRecipe(r); rerender(); },
  'filter-cat': (el) => { S.ui.filter.cat = el.dataset.v; rerender(); },
  'filter-flag': (el) => { const f = S.ui.filter.flags; f.has(el.dataset.v) ? f.delete(el.dataset.v) : f.add(el.dataset.v); rerender(); },
  'rec-filter': (el) => { S.ui.recFilter = el.dataset.v; rerender(); },
  variant: (el) => { S.ui.variant[el.dataset.r] = el.dataset.v; rerender(); },
  dtab: (el) => { S.ui.dtab[el.dataset.r] = el.dataset.t; rerender(); },
  'scale-count': (el) => withRV((r, v, k) => { const c = C.scaleFor(v, S.ui.scale[k]).count + +el.dataset.d; if (c >= 1) S.ui.scale[k] = { count: c }; }),
  'scale-flour': (el) => withRV((r, v, k) => { const f = Math.round(C.scaleFor(v, S.ui.scale[k]).flour) + +el.dataset.d; if (f >= 10) S.ui.scale[k] = { flour: f }; }),
  'scale-mul': (el) => withRV((r, v, k) => { S.ui.scale[k] = { flour: v.baseFlour * +el.dataset.m }; }),
  'scale-reset': () => withRV((r, v, k) => { delete S.ui.scale[k]; }),
  async start(el) {
    unlockAudio();
    const r = recipeById(el.dataset.r); const v = variantOf(r, el.dataset.v);
    const pb = C.planBranch(v);
    if (!pb) { await startBake(r, v); return; }
    const sc = curScale(r, v);
    const cur = S.ui.plan[r.id] || pb.options[0].id;
    $('#sheet-root').innerHTML = `
    <div class="sheet-bg" data-act="close-sheet"></div>
    <div class="sheet"><div class="sheet-h"><h2>発酵の計画を選ぶ</h2><button class="icon-btn" data-act="close-sheet" aria-label="閉じる">${ICON.close}</button></div>
    <div class="sheet-b">
      <p class="small muted">選んだ計画で材料量（イーストなど）が確定し、途中の分岐も自動で進みます。</p>
      <div class="branch-pick">
        ${pb.options.map((o) => {
          const a = C.computeAmounts(v, sc, o.id);
          const diff = Object.values(a.rows).filter((x) => x.byPlan).map((x) => `${x.name} ${C.fmtAmount(x)}`).join('、');
          const cold = o.steps.find((x) => x.cold);
          return `<button class="bpick ${o.id === cur ? 'on' : ''}" data-act="start-plan" data-r="${r.id}" data-v="${v.id}" data-p="${o.id}">
            <span class="bp-e">${o.icon || ''}</span><span class="bp-l">${esc(o.label)}</span><span class="bp-s">${esc(o.sub || '')}</span>
            ${diff ? `<span class="bp-s"><b class="bp-amt">${esc(diff)}</b></span>` : ''}
            ${cold ? (() => { const pre = v.steps.slice(0, v.steps.indexOf(pb)).reduce((m, x) => m + (x.timer?.min || 0), 0) + 10; const t0 = Date.now() + pre * 60000; return `<span class="bp-s">冷蔵庫へ 約${fmtTime(t0)}（約${fmtMin(pre)}後）→ 取り出し <b>${fmtDayTime(t0 + cold.cold.minH * 3600000)}〜${fmtDayTime(t0 + cold.cold.maxH * 3600000)}</b></span>`; })() : ''}
          </button>`;
        }).join('')}
      </div>
    </div></div>`;
    document.body.classList.add('sheet-open');
  },
  async 'start-plan'(el) {
    const r = recipeById(el.dataset.r); const v = variantOf(r, el.dataset.v);
    S.ui.plan[r.id] = el.dataset.p;
    closeSheet();
    await startBake(r, v, el.dataset.p);
  },
  plan: (el) => { S.ui.plan[el.dataset.r] = el.dataset.p; rerender(); },
  async 'step-next'(el) { unlockAudio(); const b = bakeById(el.dataset.b); await stepNext(b); rerender(); window.scrollTo(0, 0); },
  async 'step-prev'(el) {
    const b = bakeById(el.dataset.b); const { fl, idx } = makeCtx(b);
    if (idx > 0) { const p = fl.list[idx - 1].step; gotoStep(b, p.id); await saveBake(b); rerender(); window.scrollTo(0, 0); }
  },
  async 'goto-step'(el) { const b = bakeById(el.dataset.b); gotoStep(b, el.dataset.s); await saveBake(b); rerender(); },
  async branch(el) {
    const b = bakeById(el.dataset.b); const s = el.dataset.s;
    b.progress.choices[s] = el.dataset.o;
    const L = (b.progress.log[s] ||= {}); L.doneAt = Date.now(); L.choice = el.dataset.o;
    const { fl } = makeCtx(b);
    const i = fl.list.findIndex((x) => x.step.id === s);
    // drop choices of branches that are no longer on the path
    if (fl.list[i + 1]) gotoStep(b, fl.list[i + 1].step.id);
    await saveBake(b); rerender(); window.scrollTo(0, 0);
  },
  async finish(el) { await finishBake(bakeById(el.dataset.b), 'done'); },
  async 't-start'(el) {
    unlockAudio();
    const b = bakeById(el.dataset.b); const s = C.findStep(b.snapshot.variant.steps, el.dataset.s);
    const m = +el.dataset.m;
    const max = s.timer?.max && s.timer.max > m ? s.timer.max : null;
    addTimer(b, s, m, { maxMinutes: max });
    await saveBake(b); rerender();
  },
  async 't-custom'(el) {
    unlockAudio();
    const b = bakeById(el.dataset.b); const s = C.findStep(b.snapshot.variant.steps, el.dataset.s);
    const m = parseFloat(prompt('タイマー（分）', '10'));
    if (!(m > 0)) return;
    addTimer(b, s, m, { kind: 'custom', label: s.title });
    await saveBake(b); rerender();
  },
  async 't-pause'(el) { const [b, t] = bt(el); t.pausedRem = Math.max(0, t.endAt - Date.now()); await saveBake(b); rerender(); },
  async 't-resume'(el) {
    const [b, t] = bt(el); const now = Date.now();
    if (t.maxEndAt) t.maxEndAt = now + t.pausedRem + (t.maxEndAt - t.endAt);
    t.endAt = now + t.pausedRem; t.pausedRem = null; await saveBake(b); rerender();
  },
  async 't-add'(el) {
    const [b, t] = bt(el);
    if (t.pausedRem != null) t.pausedRem += 60000;
    else if (t.firedAt) { t.endAt = Date.now() + 60000; t.firedAt = null; t.durationSec = 60; }
    else { t.endAt += 60000; t.durationSec += 60; }
    await saveBake(b); rerender();
  },
  async 't-cancel'(el) { const [b, t] = bt(el); b.timers = b.timers.filter((x) => x.id !== t.id); await saveBake(b); rerender(); },
  async 'ferm-start'(el) {
    unlockAudio();
    const b = bakeById(el.dataset.b); const s = C.findStep(b.snapshot.variant.steps, el.dataset.s);
    const L = (b.progress.log[s.id] ||= {}); L.fermentStart = Date.now();
    if (s.ferment.min) addTimer(b, s, s.ferment.min, { maxMinutes: s.ferment.max, kind: 'ferment', label: `${s.title}` });
    await saveBake(b); rerender();
  },
  async 'ferm-judge'(el) {
    const b = bakeById(el.dataset.b); const L = (b.progress.log[el.dataset.s] ||= {});
    (L.judgements ||= []).push({ at: Date.now(), v: el.dataset.v });
    await saveBake(b);
    if (el.dataset.v === 'done') { await stepNext(b); window.scrollTo(0, 0); }
    rerender();
  },
  async 'cold-start'(el) {
    unlockAudio();
    const b = bakeById(el.dataset.b); const s = C.findStep(b.snapshot.variant.steps, el.dataset.s);
    const L = (b.progress.log[s.id] ||= {}); L.coldStart = Date.now();
    addTimer(b, s, s.cold.minH * 60, { maxMinutes: s.cold.maxH * 60, kind: 'ferment', label: `${s.title}（最短）` });
    await saveBake(b); rerender();
  },
  'make-menu'(el) {
    const b = bakeById(el.dataset.b);
    $('#sheet-root').innerHTML = `
    <div class="sheet-bg" data-act="close-sheet"></div>
    <div class="sheet"><div class="sheet-h"><h2>${esc(b.snapshot.recipeName)} #${b.seq}</h2><button class="icon-btn" data-act="close-sheet">${ICON.close}</button></div>
    <div class="sheet-b">
      <p class="small muted">開始 ${fmtDateY(b.startedAt)} ${fmtTime(b.startedAt)} ／ レシピ v${b.snapshot.recipeVersion} のスナップショットで進行中</p>
      <button class="btn block" data-act="nav-close" data-href="#/record/${b.id}">記録を見る・メモする</button>
      <button class="btn block" data-act="abort" data-b="${b.id}">途中で終了して記録に残す</button>
      <button class="btn danger ghost block" data-act="bake-del" data-b="${b.id}">この製作を削除</button>
    </div></div>`;
    document.body.classList.add('sheet-open');
  },
  'nav-close': (el) => { closeSheet(); go(el.dataset.href); },
  async abort(el) { closeSheet(); await finishBake(bakeById(el.dataset.b), 'aborted'); },
  async 'bake-del'(el) {
    if (!confirm('この記録を削除します。元に戻せません。')) return;
    const b = bakeById(el.dataset.b);
    for (const pid of b.photoIds || []) await db.del('photos', pid);
    await db.del('bakes', b.id);
    S.bakes = S.bakes.filter((x) => x.id !== b.id);
    closeSheet(); toast('削除しました'); go('#/records');
  },
  async rate(el) {
    const b = bakeById(el.dataset.b); const k = +el.dataset.k;
    b.rating = b.rating === k ? k - 0.5 : b.rating === k - 0.5 ? k : k;
    if (b.rating === 0) b.rating = null;
    await saveBake(b); rerender();
  },
  async 'photo-del'(el) {
    if (!confirm('写真を削除しますか？')) return;
    const b = bakeById(el.dataset.b);
    b.photoIds = b.photoIds.filter((p) => p !== el.dataset.p);
    await db.del('photos', el.dataset.p); await saveBake(b); rerender();
  },
  'sound-test': () => { unlockAudio(); beep(); setTimeout(beep, 700); if (navigator.vibrate) navigator.vibrate(300); },
  'alarm-ok': () => ackAlarm(false),
  'alarm-next': () => ackAlarm(true),
  async theme(el) { await setMeta('theme', el.dataset.v); applyTheme(); openSettings(); },
  async export() { await exportJSON($('#bk-photos')?.checked); openSettings(); },
  'imp-mode': (el) => { $$('#imp-mode button').forEach((x) => x.classList.toggle('on', x === el)); },
  async reseed() {
    if (!confirm('初期レシピ3件を初期状態で登録し直します（編集内容は上書き、記録は残ります）。')) return;
    for (const r of buildSeedRecipes()) {
      const old = recipeById(r.id);
      if (old) { await db.put('recipeVersions', { id: `${old.id}@v${old.version}`, recipeId: old.id, version: old.version, savedAt: Date.now(), data: clone(old) }); r.version = old.version + 1; r.favorite = old.favorite; }
      await saveRecipe(r);
    }
    closeSheet(); toast('再登録しました'); rerender();
  },
  async wipe() {
    if (!confirm('全てのレシピ・記録・写真を削除します。先にバックアップを書き出しましたか？')) return;
    if (!confirm('本当に削除しますか？')) return;
    for (const s of db.STORES) await db.clear(s);
    await loadAll(); await seed(); closeSheet(); go('#/home');
  },
  // editor
  'ed-variant': (el) => { go(`#/edit/${S.ui.edit.rid}?v=${el.dataset.v}`); },
  'ed-cancel': () => { const id = S.ui.edit?.rid; S.ui.edit = null; go(`#/recipe/${id}`); },
  'ed-save': () => edSave(),
  'ed-add-item': (el) => {
    const v = variantOf(S.ui.edit.d, S.ui.edit.vid);
    v.ingredientGroups[+el.dataset.g].items.push({ id: uid('i'), name: '', basis: 'flour', pct: { target: 0 }, _g: { target: null, min: null, max: null }, precision: 1 });
    rerender();
  },
  'ed-del-item': (el) => {
    const v = variantOf(S.ui.edit.d, S.ui.edit.vid);
    const g = v.ingredientGroups[+el.dataset.g];
    const it = g.items[+el.dataset.i];
    if (!confirm(`「${it.name || '（無名）'}」を削除しますか？`)) return;
    g.items.splice(+el.dataset.i, 1);
    const strip = (steps) => steps.forEach((s) => { if (s.uses) s.uses = s.uses.filter((u) => (typeof u === 'string' ? u : u.ref) !== it.id); if (s.type === 'branch') s.options.forEach((o) => strip(o.steps)); });
    strip(v.steps);
    rerender();
  },
  'ed-add-step': () => { const v = variantOf(S.ui.edit.d, S.ui.edit.vid); v.steps.push({ id: uid('s'), title: '新しい工程', body: '' }); rerender(); },
  'ed-del-step': (el) => {
    const v = variantOf(S.ui.edit.d, S.ui.edit.vid);
    if (!confirm('この工程を削除しますか？')) return;
    v.steps = v.steps.filter((s) => s.id !== el.dataset.s); rerender();
  },
};
function withRV(fn, soft = false) {
  const r = recipeById(S.route.id); const v = variantOf(r, S.ui.variant[r.id]);
  fn(r, v, scaleKey(r, v));
  if (soft) softRerender(); else rerender();
}
// When a text field commits on blur (the user tapped a button), rebuilding the DOM immediately
// would delete the button before its click fires. Update state now, redraw a moment later,
// and let a pending click run first.
let softTimer = null;
function softRerender() { clearTimeout(softTimer); softTimer = setTimeout(() => { softTimer = null; rerender(); }, 350); }
function cancelSoftRerender() { if (!softTimer) return false; clearTimeout(softTimer); softTimer = null; return true; }
function bt(el) { const b = bakeById(el.dataset.b); return [b, b.timers.find((t) => t.id === el.dataset.t)]; }

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = A[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  const pending = cancelSoftRerender();
  Promise.resolve(fn(el, e))
    .then(() => { if (pending && document.contains(el)) rerender(); })
    .catch((err) => { console.error(err); toast('エラー: ' + err.message); });
});

let recTimer = null;
const ON = {
  'filter-q': (el, ev) => { if (ev.type !== 'input') return; S.ui.filter.q = el.value; $('.rlist').innerHTML = recipeListHtml(); hydratePhotos(); },
  'toggle-pct': (el) => { S.ui.showPct = el.checked; rerender(); },
  'scale-flour-in': (el, ev) => { if (ev.type !== 'change') return; withRV((r, v, k) => { const f = +el.value; if (f > 0) S.ui.scale[k] = { flour: f }; }, true); },
  'scale-pan': (el) => withRV((r, v, k) => {
    const p = C.PAN_PRESETS.find((x) => x.id === el.value);
    S.ui.scale[k] = { pan: p ? { ...p } : { ...C.scaleFor(v, S.ui.scale[k]).pan, name: '入力した型', custom: true } };
  }),
  'scale-dim': (el, ev) => { if (ev.type !== 'change') return; withRV((r, v, k) => { const pan = { ...C.scaleFor(v, S.ui.scale[k]).pan }; pan[el.dataset.k] = +el.value; pan.name = '入力した型'; pan.custom = true; S.ui.scale[k] = { pan }; }, true); },
  rec: (el) => {
    const b = bakeById(el.dataset.b); const k = el.dataset.k;
    if (k.startsWith('env.')) b.env[k.slice(4)] = el.value; else b[k] = el.value;
    clearTimeout(recTimer); recTimer = setTimeout(() => saveBake(b), 400);
  },
  async 'photo-add'(el, ev) {
    if (ev.type !== 'change' || !el.files?.[0]) return;
    const b = bakeById(el.dataset.b);
    try {
      const { blob, w, h } = await resizeImage(el.files[0]);
      const kinds = ['exterior', 'crumb'];
      const p = { id: uid('photo'), bakeId: b.id, recipeId: b.recipeId, kind: kinds[b.photoIds.length] || 'other', blob, w, h, createdAt: Date.now() };
      await db.put('photos', p);
      b.photoIds.push(p.id); await saveBake(b); rerender();
    } catch (e) { toast(e.message); }
  },
  import: (el, ev) => { if (ev.type !== 'change' || !el.files?.[0]) return; const mode = $('#imp-mode .on')?.dataset.v || 'merge'; importJSON(el.files[0], mode); },
  ed: (el, ev) => {
    edSet(el.dataset.f, el);
    // refresh flour total display on change only (keeps focus while typing)
    if (ev.type === 'change' && /:gT$/.test(el.dataset.f)) softRerender();
  },
};
for (const type of ['input', 'change']) {
  document.addEventListener(type, (e) => {
    const el = e.target.closest('[data-on]');
    if (!el) return;
    const fn = ON[el.dataset.on];
    if (!fn) return;
    // text-like inputs react on 'input'; selects/checkbox/file on 'change'
    const isText = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'file'].includes(el.type));
    if (isText && type === 'change' && !['scale-flour-in', 'scale-dim', 'ed'].includes(el.dataset.on)) return;
    if (!isText && type === 'input') return;
    Promise.resolve(fn(el, e)).catch((err) => { console.error(err); toast('エラー: ' + err.message); });
  });
}
document.addEventListener('touchend', unlockAudio, { passive: true });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    tick(); // recompute from end timestamps
    if (wakeWanted) setWake(true);
  }
});
window.addEventListener('hashchange', () => render());

/* ───────────────────────── boot ───────────────────────── */
async function seed() {
  if (!S.meta.seeded) {
    for (const r of buildSeedRecipes()) await db.put('recipes', r);
    await setMeta('seeded', SEED_VERSION);
    S.recipes = await db.getAll('recipes');
  } else if (S.meta.seeded < SEED_VERSION) {
    for (const r of migrateRecipes(S.recipes, S.meta.seeded)) {
      if (r._previous) {
        const old = r._previous; delete r._previous;
        await db.put('recipeVersions', { id: `${old.id}@v${old.version}`, recipeId: old.id, version: old.version, savedAt: Date.now(), data: old });
      }
      await db.put('recipes', r);
    }
    S.recipes = await db.getAll('recipes');
    await setMeta('seeded', SEED_VERSION);
  }
  // recipes added to seed.js in later app versions appear automatically (never overwrites, never re-adds deleted ones)
  const known = new Set([...(S.meta.seedIds || []), ...S.recipes.map((r) => r.id)]);
  const added = [];
  for (const r of buildSeedRecipes()) if (!known.has(r.id)) { await db.put('recipes', r); added.push(r.name); }
  const allSeed = buildSeedRecipes().map((r) => r.id);
  if (JSON.stringify(S.meta.seedIds) !== JSON.stringify(allSeed)) await setMeta('seedIds', [...new Set([...(S.meta.seedIds || []), ...allSeed])]);
  if (added.length) { S.recipes = await db.getAll('recipes'); setTimeout(() => toast(`新しいレシピ：${added.join('、')}`), 800); }
}

async function boot() {
  window.__breadBooted = true;
  try {
    await db.openDB();
    await loadAll();
    await seed();
  } catch (e) {
    $('#view').innerHTML = `<div class="pad"><div class="card warn">データベースを開けませんでした：${esc(e.message)}<br>プライベートブラウズでは保存できない場合があります。</div></div>`;
    return;
  }
  applyTheme();
  render();
  setInterval(tick, 1000);
  try { navigator.storage?.persist?.(); } catch { /* */ }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();

// expose for debugging on device
window.__bread = { S, db, C };
