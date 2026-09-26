// Pure calculation helpers. Baker's % is the source of truth; grams are derived.

export const HB_MODE_LABEL = {
  none: 'HB不使用',
  optional_knead: 'HB任意（こね）',
  knead_only: 'HB こねのみ',
  knead_first_fermentation: 'HB こね〜一次発酵',
  full_auto: 'HB 全自動',
};
export const HB_REC_LABEL = { recommended: '推奨', optional: '任意', not_recommended: '非推奨' };
export const SCALE_MODE_LABEL = { flour: '総粉量基準', count: '個数基準', panVolume: '型容積基準' };
export const STATUSES = ['試作', '調整中', '完成', '定番'];
export const CATEGORIES = ['食パン', 'ハード系', '高加水', '惣菜パン', '菓子パン', 'ベーグル', 'ピザ', 'その他'];

// Pans the user owns (V2 will make this editable in 道具管理)
export const PAN_PRESETS = [
  { id: 'cube12', name: '蓋付き12cm角型（基準）', w: 12, d: 12, h: 12 },
  { id: 'cube12-real', name: '12cm角食パン型（実測 121×119×120mm）', w: 12.1, d: 11.9, h: 12.0 },
];

export const panVolume = (p) => p.w * p.d * p.h;

const pos = (x, fallback) => (Number.isFinite(+x) && +x > 0 ? +x : fallback);

/** Resolve scale for a variant. input: {flour?, count?, pan?} */
export function scaleFor(v, input = {}) {
  const base = v.baseFlour;
  if (v.scaleMode === 'count') {
    const count = pos(input.count, v.baseCount);
    const factor = count / v.baseCount;
    return { mode: 'count', count, factor, flour: base * factor };
  }
  if (v.scaleMode === 'panVolume') {
    const pan = input.pan && panVolume(input.pan) > 0 ? input.pan : v.basePan;
    const factor = panVolume(pan) / panVolume(v.basePan);
    return { mode: 'panVolume', pan, factor, flour: base * factor };
  }
  const flour = pos(input.flour, base);
  return { mode: 'flour', flour, factor: flour / base };
}

export function roundP(x, p) {
  if (x == null || !Number.isFinite(x)) return null;
  return p === 0.1 ? Math.round(x * 10) / 10 : Math.round(x);
}
export function fmtNum(x, p) {
  if (x == null || !Number.isFinite(x)) return '';
  return p === 0.1 ? x.toFixed(1) : String(Math.round(x));
}
export function fmtPct(x) {
  if (x == null || !Number.isFinite(x)) return '';
  const r = Math.round(x * 100) / 100;
  return (Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, '')) + '%';
}

/**
 * Compute gram amounts for every ingredient. Returns plain data (safe to freeze into a snapshot).
 * rows[id] = {id,name,group,kind,g,min,max,raw,text,precision,pct,perCount,note,tentative,moisture}
 */
export function computeAmounts(v, sc, plan = null) {
  plan = plan || defaultPlan(v);
  const count = v.scaleMode === 'count' ? sc.count : v.baseCount ? v.baseCount * sc.factor : null;
  const rows = {};
  let doughRaw = 0, moist = 0;
  const groups = v.ingredientGroups.map((g) => {
    // prep with a batch: made in whole units (e.g. custard by 4 pieces), independent of flour
    const bp = g.kind === 'prep' && g.batch ? prepPlan(g.batch, count) : null;
    return {
    id: g.id, name: g.name, kind: g.kind,
    ...(bp ? { batch: { ...g.batch }, prep: bp } : {}),
    rows: g.items.map((it) => {
      const r = computeItem(it, sc, count, plan, bp);
      r.group = g.id; r.kind = g.kind;
      rows[it.id] = r;
      if ((g.kind === 'flour' || g.kind === 'dough') && r.raw != null) {
        doughRaw += r.raw;
        moist += r.raw * (it.moisture || 0);
      }
      return r;
    }),
  };
  });
  // how much of each prep will actually be used (from fillings that point to it via madeBy)
  for (const g of groups) {
    if (!g.prep) continue;
    const src = v.ingredientGroups.flatMap((x) => x.items).filter((it) => it.madeBy === g.id);
    g.prep.useG = src.reduce((sum, it) => sum + (rows[it.id]?.raw || 0), 0);
    g.prep.usedBy = src.map((it) => it.id);
  }
  return {
    groups, rows,
    flour: sc.flour,
    dough: doughRaw,
    hydration: sc.flour ? (moist / sc.flour) * 100 : null,
    count,
    piece: count ? doughRaw / count : null,
    plan,
  };
}

function computeItem(it, sc, count, plan, bp = null) {
  const p = it.precision || 1;
  const base = { id: it.id, name: it.name, precision: p, note: it.note || '', tentative: !!it.tentative, moisture: it.moisture || 0 };
  if (it.madeBy) base.madeBy = it.madeBy;
  if (it.basis === 'batch') {
    // grams are per batch unit (not baker's %); multiplied by the number of units to make
    const units = bp ? bp.units : 1;
    const raw = (+it.g || 0) * units;
    return { ...base, raw, g: roundP(raw, p), perUnit: +it.g || 0, perCook: bp ? bp.cooks.map((u) => roundP((+it.g || 0) * u, p)) : null };
  }
  if (it.basis === 'flour') {
    // byPlan: amount depends on the fermentation plan chosen at start (e.g. yeast for same-day vs cold)
    const pct = (it.byPlan && plan && it.byPlan[plan]) || it.pct;
    const f = (k) => (pct[k] == null ? null : (pct[k] / 100) * sc.flour);
    const raw = f('target');
    const out = { ...base, raw, g: roundP(raw, p), min: roundP(f('min'), p), max: roundP(f('max'), p), pct: { ...pct } };
    if (it.byPlan) {
      out.byPlan = {};
      for (const [k, pp] of Object.entries(it.byPlan)) out.byPlan[k] = roundP((pp.target / 100) * sc.flour, p);
    }
    return out;
  }
  if (it.basis === 'perCount') {
    const c = count ?? 1;
    const f = (k) => (it.perCount[k] == null ? null : it.perCount[k] * c);
    const raw = f('target');
    return { ...base, raw, g: roundP(raw, p), min: roundP(f('min'), p), max: roundP(f('max'), p), perCount: { ...it.perCount } };
  }
  return { ...base, raw: null, g: null, text: it.text || '適量' };
}

export function fmtAmount(r) {
  if (!r) return '';
  if (r.text != null) return r.text;
  return fmtNum(r.g, r.precision) + 'g';
}
export function fmtRange(r) {
  if (!r || (r.min == null && r.max == null)) return '';
  return `${fmtNum(r.min ?? r.g, r.precision)}〜${fmtNum(r.max ?? r.g, r.precision)}g`;
}
export function fmtPerCount(pc) {
  if (!pc) return '';
  if (pc.min != null && pc.max != null) return `${pc.min}〜${pc.max}g`;
  return `${pc.target}g`;
}
export function fmtCount(c) {
  if (c == null) return '';
  return Number.isInteger(c) ? String(c) : c.toFixed(1);
}

/** Part of an ingredient given as % of flour (e.g. water added in two stages). */
export function partG(r, pctOfFlour, flour) {
  return fmtNum(roundP((pctOfFlour / 100) * flour, r.precision), r.precision) + 'g';
}

/** Step text templates: {{batch:group}} {{use:group}} {{part:id:pct}} {{count}} {{divide}} {{piece}} {{per:id}} {{min:id}} {{max:id}} {{g:id}} */
export function tpl(text, amt) {
  if (!text) return '';
  return text.replace(/\{\{(\w+)(?::([\w-]+))?(?::([\d.]+))?\}\}/g, (m, k, id, arg) => {
    const r = id ? amt.rows[id] : null;
    switch (k) {
      case 'part': return r && arg ? partG(r, +arg, amt.flour) : m;
      case 'batch': { const g = (amt.groups || []).find((x) => x.id === id); return g?.prep ? batchLabel(g) : m; }
      case 'use': {
        const g = (amt.groups || []).find((x) => x.id === id);
        if (g?.prep) return `${Math.round(g.prep.useG)}g`;
        return r ? fmtAmount(r) : m;
      }
      case 'count': return fmtCount(amt.count);
      case 'divide': {
        const n = Math.max(1, Math.round(amt.count || 1));
        return n === 1 ? '分割せず1個にまとめる' : `${n}等分（1個約${Math.round(amt.dough / n)}g）`;
      }
      case 'piece': return amt.piece ? String(Math.round(amt.piece)) : '?';
      case 'per': return r?.perCount ? fmtPerCount(r.perCount) : m;
      case 'min': return r ? fmtNum(r.min ?? r.g, r.precision) + 'g' : m;
      case 'max': return r ? fmtNum(r.max ?? r.g, r.precision) + 'g' : m;
      case 'g': return r ? fmtAmount(r) : m;
      default: return m;
    }
  });
}

/**
 * Flatten steps following branch choices. Stops at the first unresolved branch.
 * Returns {list:[{step, opt}], unresolved, estTotal}
 */
export function flattenSteps(steps, choices = {}) {
  const list = [];
  let unresolved = null;
  const walk = (arr, opt) => {
    for (const s of arr) {
      const o = s.type === 'branch' ? s.options.find((x) => x.id === choices[s.id]) : null;
      // a plan decided at start needs no question mid-way: continue straight into its route
      if (!(s.atStart && o)) list.push({ step: s, opt });
      if (s.type === 'branch') {
        if (!o) { unresolved = s; return true; }
        if (walk(o.steps, o.label)) return true;
      }
    }
    return false;
  };
  walk(steps, null);
  const extra = unresolved ? Math.max(...unresolved.options.map((o) => countDeep(o.steps))) : 0;
  return { list, unresolved, estTotal: list.length + extra };
}
/** The branch whose route is chosen when baking starts (fermentation plan), if any. */
export function planBranch(v) {
  let f = null;
  eachStep(v.steps, (s) => { if (!f && s.type === 'branch' && s.atStart) f = s; });
  return f;
}
export function defaultPlan(v) { return planBranch(v)?.options[0].id || null; }

function countDeep(steps) {
  let n = 0;
  for (const s of steps) {
    n++;
    if (s.type === 'branch') n += Math.max(...s.options.map((o) => countDeep(o.steps)));
  }
  return n;
}

export function findStep(steps, id) {
  for (const s of steps) {
    if (s.id === id) return s;
    if (s.type === 'branch') for (const o of s.options) { const f = findStep(o.steps, id); if (f) return f; }
  }
  return null;
}
export function eachStep(steps, fn, opt = null) {
  for (const s of steps) {
    fn(s, opt);
    if (s.type === 'branch') for (const o of s.options) eachStep(o.steps, fn, o);
  }
}
export function hasCold(steps) {
  let f = false;
  eachStep(steps, (s) => { if (s.cold) f = true; });
  return f;
}

/** Whole-piece count for display (flour-mode recipes that also know their piece count). */
export const pieces = (count) => (count == null ? null : Math.max(1, Math.round(count)));

/* ───────────── prep made in batches (e.g. custard) ───────────── */

/**
 * batch = { unit, maxUnitsPerCook, yieldPerUnit }
 * units = max(1, ceil(count / unit)); cooks split units into chunks of maxUnitsPerCook.
 *   e.g. unit 4, max 2: 1–4 → [1], 5–8 → [2], 9–12 → [2,1], 13–16 → [2,2], 17–20 → [2,2,1]
 */
export function prepPlan(batch, count) {
  const unit = Math.max(1, +batch.unit || 1);
  const maxPer = Math.max(1, +batch.maxUnitsPerCook || Infinity);
  const n = count == null || !(count > 0) ? unit : count;
  let units = Math.max(1, Math.ceil(n / unit - 1e-9));
  const total = units;
  const cooks = [];
  while (units > 0) { const u = Math.min(maxPer, units); cooks.push(u); units -= u; }
  return { unit, units: total, cooks, makeCount: total * unit };
}
export function batchLabel(g) {
  const { cooks, unit } = g.prep;
  const parts = cooks.map((u) => `${u * unit}個分`);
  return cooks.length === 1 ? parts[0] : `${parts.join('＋')}（${cooks.length}回に分けて炊く）`;
}
/** yieldPerUnit must cover what one unit is meant to fill: yieldPerUnit >= perCount × unit */
export function prepYieldWarnings(v) {
  const out = [];
  const items = v.ingredientGroups.flatMap((g) => g.items);
  for (const g of v.ingredientGroups) {
    if (g.kind !== 'prep' || !g.batch || g.batch.yieldPerUnit == null) continue;
    for (const it of items.filter((x) => x.madeBy === g.id && x.perCount)) {
      const need = (+it.perCount.target || 0) * (+g.batch.unit || 1);
      if (+g.batch.yieldPerUnit + 1e-9 < need) {
        out.push({ groupId: g.id, need, yieldPerUnit: +g.batch.yieldPerUnit, msg: `1単位の仕上がりが使用量に足りない可能性があります（${g.name}：目安${g.batch.yieldPerUnit}g／必要${Math.round(need)}g）` });
      }
    }
  }
  return out;
}

/* ───────────── dough identity ───────────── */

export const normName = (s) => String(s ?? '').normalize('NFKC').replace(/\s+/g, '').trim();
const q = (x) => (x == null || !Number.isFinite(+x) ? null : Math.round(+x * 100)); // 0.01% steps

/** Canonical entries of the dough part (kind flour/dough only): Map key → {name, t, min, max, plan} */
export function doughEntries(v) {
  const map = new Map();
  for (const g of v.ingredientGroups) {
    if (g.kind !== 'flour' && g.kind !== 'dough') continue;
    for (const it of g.items) {
      const key = it.ingKey || normName(it.name);
      const e = map.get(key) || { key, name: it.name, t: 0, min: null, max: null, plan: null, text: null };
      if (it.basis === 'flour' && it.pct) {
        const add = (a, b) => (b == null ? a : (a ?? 0) + b);
        e.t += +it.pct.target || 0;
        e.min = add(e.min, it.pct.min);
        e.max = add(e.max, it.pct.max);
        if (it.byPlan) {
          e.plan = e.plan || {};
          for (const [k, pp] of Object.entries(it.byPlan)) e.plan[k] = (e.plan[k] || 0) + (+pp.target || 0);
        }
      } else {
        e.text = it.text ?? (it.perCount ? `pc${it.perCount.target}` : '');
      }
      map.set(key, e);
    }
  }
  return map;
}
function entryString(e) {
  const t = q(e.t);
  let out = `${e.key}=${t}`;
  const mn = q(e.min), mx = q(e.max);
  if (mn != null && mn !== t) out += `,m=${mn}`;
  if (mx != null && mx !== t) out += `,M=${mx}`;
  if (e.plan) out += ',p=' + Object.keys(e.plan).sort().map((k) => `${k}:${q(e.plan[k])}`).join('/');
  if (e.text) out += `,x=${e.text}`;
  return out;
}
/** Same string ⇔ exactly the same dough formula. Order-independent; ignores precision/note/moisture. */
export function doughSignature(v) {
  const entries = [...doughEntries(v).values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return 'sig1|' + entries.map(entryString).join(';');
}
/** Human-readable differences between two dough formulas (for 「同じ系統・配合違い」). */
const pctTxt = (qv) => `${qv / 100}%`;
function rangeTxt(e) {
  if (!e) return 'なし';
  const t = q(e.t), mn = q(e.min), mx = q(e.max);
  const lo = mn != null && mn !== t ? mn : null;
  const hi = mx != null && mx !== t ? mx : null;
  if (lo == null && hi == null) return pctTxt(t);
  return `${(lo ?? t) / 100}〜${pctTxt(hi ?? t)}`;   // 例: 60〜65%
}
export function doughDiff(a, b) {
  const A = doughEntries(a), B = doughEntries(b);
  const pb = planBranch(a) || planBranch(b);
  const planLabel = (k) => pb?.options.find((o) => o.id === k)?.label || k;
  const keys = [...new Set([...A.keys(), ...B.keys()])].sort();
  const out = [];
  for (const k of keys) {
    const x = A.get(k), y = B.get(k);
    if (x && y && entryString(x) === entryString(y)) continue;
    const name = (y || x).name;
    if (!x || !y) { out.push(`${name} ${rangeTxt(x)}→${rangeTxt(y)}`); continue; }
    // 量（target と min/max の幅）
    if (rangeTxt(x) !== rangeTxt(y)) out.push(`${name} ${rangeTxt(x)}→${rangeTxt(y)}`);
    // 発酵計画ごとの量（例: ロデヴのイースト）
    const pk = [...new Set([...Object.keys(x.plan || {}), ...Object.keys(y.plan || {})])].sort();
    for (const pkey of pk) {
      const px = x.plan?.[pkey], py = y.plan?.[pkey];
      if (q(px) === q(py)) continue;
      out.push(`${name}（${planLabel(pkey)} ${px == null ? 'なし' : pctTxt(q(px))}→${py == null ? 'なし' : pctTxt(q(py))}）`);
    }
    if ((x.text || '') !== (y.text || '')) out.push(`${name}（${x.text || 'なし'}→${y.text || 'なし'}）`);
  }
  return out;
}
/** Unrounded dough weight per piece at the recipe's base size (null when the recipe has no piece count). */
export function pieceWeight(v) {
  const n = v.scaleMode === 'count' ? v.baseCount : v.baseCount || null;
  if (!n) return null;
  const a = computeAmounts(v, scaleFor(v, {}));
  return a.dough / n;
}
export const samePieceWeight = (a, b, tol = 1.0) => a != null && b != null && Math.abs(a - b) <= tol + 1e-6;

/** Every step (incl. branch routes) carries a phase → usable for mix planning later. */
export function phaseComplete(v) {
  let ok = true;
  eachStep(v.steps, (s) => { if (s.type !== 'branch' && !s.phase) ok = false; });
  return ok;
}

/** HB capacity is tied to the machine/course of this variant; warn when the flour exceeds it. */
export function hbCapacityWarning(v, flour) {
  const cap = v.hb?.capacity;
  if (!cap || !(cap.flourMax > 0) || !(flour > cap.flourMax + 1e-9)) return null;
  return `HB${cap.course ? `「${cap.course}」` : ''}コースの基準容量（粉${cap.flourMax}g）を超えます（現在 粉${Math.round(flour)}g）`;
}
