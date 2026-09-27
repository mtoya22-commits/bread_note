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

/** Volume of a pan. Every side must be a finite positive number; otherwise 0 (= invalid). */
export const panVolume = (p) => {
  const w = +p?.w, d = +p?.d, h = +p?.h;
  return [w, d, h].every((x) => Number.isFinite(x) && x > 0) ? w * d * h : 0;
};

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
  for (const s of steps || []) {
    fn(s, opt);
    if (s.type === 'branch') for (const o of s.options || []) eachStep(o.steps, fn, o);
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
    if (g.batch.yieldVerified === false) {
      out.push({ groupId: g.id, unverified: true, msg: `材料を変更したため、仕上がり量の再確認が必要です（${g.name}：元の目安 ${g.batch.unit}個分で約${g.batch.yieldPerUnit}g）` });
    }
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

/** Canonical entries of the dough part (kind flour/dough only): Map key → {name, t, min, max, plan}
 *  Rows with the same key are summed. A row without min/max contributes its target to min/max,
 *  and a row without byPlan contributes its target to every plan (so 10% + 20〜30% ≡ 30〜40%). */
export function doughEntries(v) {
  const rows = new Map();
  for (const g of v.ingredientGroups) {
    if (g.kind !== 'flour' && g.kind !== 'dough') continue;
    for (const it of g.items) {
      const key = it.ingKey || normName(it.name);
      if (!rows.has(key)) rows.set(key, { name: it.name, list: [] });
      rows.get(key).list.push(it);
    }
  }
  const map = new Map();
  for (const [key, { name, list }] of rows) {
    const e = { key, name, t: 0, min: null, max: null, plan: null, text: null };
    const pctRows = list.filter((it) => it.basis === 'flour' && it.pct);
    if (pctRows.length) {
      const hasMin = pctRows.some((it) => it.pct.min != null);
      const hasMax = pctRows.some((it) => it.pct.max != null);
      let t = 0, lo = 0, hi = 0;
      for (const it of pctRows) {
        const tt = +it.pct.target || 0;
        t += tt; lo += it.pct.min ?? tt; hi += it.pct.max ?? tt;
      }
      e.t = t;
      if (hasMin) e.min = lo;
      if (hasMax) e.max = hi;
      const planKeys = [...new Set(pctRows.flatMap((it) => Object.keys(it.byPlan || {})))];
      if (planKeys.length) {
        e.plan = {};
        for (const k of planKeys) e.plan[k] = pctRows.reduce((sum, it) => sum + (+(it.byPlan?.[k]?.target ?? it.pct.target) || 0), 0);
      }
    }
    const texts = list.filter((it) => !(it.basis === 'flour' && it.pct)).map((it) => it.text ?? (it.perCount ? `pc${it.perCount.target}` : ''));
    if (texts.length) e.text = texts.join('+');
    map.set(key, e);
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
  let ok = true, count = 0;
  eachStep(v.steps || [], (s) => {
    if (s.type === 'branch') return;
    count++;
    if (!s.phase) ok = false;
  });
  return count > 0 && ok;   // 工程が1つもない variant は対象外
}

/** HB capacity is tied to the machine/course of this variant; warn when the flour exceeds it. */
export function hbCapacityWarning(v, flour) {
  const cap = v.hb?.capacity;
  if (!cap || !(cap.flourMax > 0) || !(flour > cap.flourMax + 1e-9)) return null;
  return `HB${cap.course ? `「${cap.course}」` : ''}コースの基準容量（粉${cap.flourMax}g）を超えます（現在 粉${Math.round(flour)}g）`;
}

/* ───────────── editing safety ───────────── */

/** After editing: an ingredient whose name really changed loses its ingKey (falls back to the name). */
export function reconcileIngKeys(before, after, standard = null) {
  const prev = new Map();
  for (const g of before?.ingredientGroups || []) for (const it of g.items) prev.set(it.id, it);
  let n = 0;
  for (const g of after.ingredientGroups) {
    const sg = standard?.ingredientGroups.find((x) => x.id === g.id);
    for (const it of g.items) {
      if (it.ingKey) {
        const old = prev.get(it.id);
        if (!old || normName(old.name) !== normName(it.name)) { delete it.ingKey; n++; }
      }
      // 標準レシピの同じ材料（同じ group・item ID）の名前に戻ったら、標準の ingKey を戻す
      if (!it.ingKey && sg) {
        const si = sg.items.find((x) => x.id === it.id);
        if (si?.ingKey && normName(si.name) === normName(it.name)) { it.ingKey = si.ingKey; n++; }
      }
    }
  }
  return n;
}

/** Prep ingredients changed → the yield estimate is no longer confirmed, and the prep is no longer "the standard one". */
const prepSig = (g) => JSON.stringify((g?.items || []).map((it) => [it.id, normName(it.name), it.basis, it.basis === 'batch' ? +it.g : null, it.text ?? null]));
export function prepChanged(beforeGroup, afterGroup) { return prepSig(beforeGroup) !== prepSig(afterGroup); }
const batchSig = (b) => JSON.stringify([+b?.unit || null, +b?.maxUnitsPerCook || null, +b?.yieldPerUnit || null]);
export function markChangedPreps(before, after, standard = null) {
  let n = 0;
  for (const g of after.ingredientGroups) {
    if (g.kind !== 'prep' || !g.batch) continue;
    const bg = before?.ingredientGroups.find((x) => x.id === g.id);
    const changed = prepChanged(bg, g);
    if (g._yieldConfirmed) g.batch.yieldVerified = true;          // 「実際に作って確認した」にチェック
    else if (changed) g.batch.yieldVerified = false;              // 材料が変わった → 目安は未確認
    if (changed && g.prepKey) { g.prepKeyOrigin = g.prepKey; delete g.prepKey; }   // 標準の下準備とは別物として扱う
    if (changed) n++;
    // 標準の下準備に完全に戻り、仕上がりも確認済みなら、元の prepKey を戻す
    const sg = standard?.ingredientGroups.find((x) => x.id === g.id && x.kind === 'prep');
    if (!g.prepKey && g.prepKeyOrigin && sg?.prepKey === g.prepKeyOrigin && !prepChanged(sg, g)
      && batchSig(sg.batch) === batchSig(g.batch) && g.batch.yieldVerified !== false) {
      g.prepKey = g.prepKeyOrigin;
      n++;
    }
  }
  for (const g of after.ingredientGroups) delete g._yieldConfirmed;
  return n;
}

/** Structural values that the mix metadata depends on (title/body wording excluded). */
const isBakeStep = (s) => s.phase === 'bake' || !!s.bake;
function stepCond(s, bakeBody = false) {
  return JSON.stringify({
    type: s.type || 'step',
    // 焼成工程は温度が本文に書かれているので、本文の変更も条件の変更とみなす
    body: bakeBody ? normName(s.body) : null,
    t: s.timer ? [s.timer.min ?? null, s.timer.max ?? null] : null,
    f: s.ferment ? [s.ferment.temp ?? null, s.ferment.min ?? null, s.ferment.max ?? null, s.ferment.cue ?? null] : null,
    c: s.cold ? [s.cold.minH ?? null, s.cold.maxH ?? null] : null,
    b: s.type === 'branch' ? (s.options || []).map((o) => o.id) : null,
  });
}
function allSteps(steps, out = []) {
  for (const s of steps || []) { out.push(s); if (s.type === 'branch') for (const o of s.options || []) allSteps(o.steps, out); }
  return out;
}
/**
 * If the steps' conditions changed (timer / fermentation / cold / branches, the text of bake steps,
 * the bake summary, or steps added/removed),
 * the structured mix metadata (phase, bake, ferment.tempMin/tempMax) is no longer trustworthy:
 * remove it from the whole variant so it drops out of mix planning. `parallel` is kept (it is a live feature).
 */
export function stripStaleMixMeta(before, after) {
  const A = allSteps(before?.steps), B = allSteps(after.steps);
  const hasMeta = B.some((s) => s.phase || s.bake || s.ferment?.tempMode != null || s.ferment?.tempMin != null || s.ferment?.tempMax != null);
  if (!hasMeta) return false;
  const same = A.length === B.length
    && A.every((s, i) => { const bb = isBakeStep(s) || isBakeStep(B[i]); return s.id === B[i].id && stepCond(s, bb) === stepCond(B[i], bb); })
    && normName(before?.bakeSummary) === normName(after.bakeSummary);
  if (same) return false;
  for (const s of B) {
    delete s.phase; delete s.bake;
    if (s.ferment) { delete s.ferment.tempMode; delete s.ferment.tempMin; delete s.ferment.tempMax; }
  }
  return true;
}

/** 基準の個数・型の寸法のチェック（編集画面では材料の計算より先に使う） */
export function validateScale(v) {
  const errs = [];
  const num = (x) => x != null && Number.isFinite(+x);
  // 個数・分割数：count モードでは必須、それ以外（flour の分割数など）は入力されていれば正の整数
  const bc = v.baseCount;
  const isPosInt = (x) => num(x) && Number.isInteger(+x) && +x > 0;
  if (v.scaleMode === 'count' ? !isPosInt(bc) : bc != null && bc !== '' && !isPosInt(bc)) {
    errs.push(`基準の個数（分割数）は1以上の整数にしてください`);
  }
  if (v.scaleMode === 'panVolume' && !(panVolume(v.basePan) > 0)) errs.push('型の寸法（幅・奥行・高さ）はすべて0より大きい数にしてください');
  return errs;
}
/** Checks before saving an edited variant: returns a list of problems (empty = OK). */
export function validateVariant(v) {
  const errs = [];
  const num = (x) => x != null && Number.isFinite(+x);
  for (const g of v.ingredientGroups) {
    for (const it of g.items) {
      const nm = it.name || '（無名）';
      if (!String(it.name ?? '').trim()) errs.push(`「${g.name || '材料'}」に材料名が空欄の行があります（不要なら削除ボタンで消してください）`);
      const range = (lo, t, hi, unit) => {
        if (num(lo) && +lo < 0) errs.push(`「${nm}」の最小が負の値です`);
        if (num(lo) && num(t) && +lo > +t + 1e-9) errs.push(`「${nm}」の最小（${lo}${unit}）が目安（${t}${unit}）より大きくなっています`);
        if (num(hi) && num(t) && +hi + 1e-9 < +t) errs.push(`「${nm}」の最大（${hi}${unit}）が目安（${t}${unit}）より小さくなっています`);
      };
      if (it.basis === 'perCount') {
        const p = it.perCount || {};
        if (!(num(p.target) && +p.target > 0)) errs.push(`「${nm}」の1個あたりの量を入力してください`);
        else range(p.min, p.target, p.max, 'g');
      } else if (it.basis === 'flour' && it.pct) {
        const pctCheck = (p, label) => {
          if (!num(p.target) || +p.target < 0) errs.push(`「${nm}」${label}の量が不正です（0以上にしてください）`);
          if (num(p.max) && +p.max < 0) errs.push(`「${nm}」${label}の最大が負の値です`);
          range(p.min, p.target, p.max, '%');
        };
        pctCheck(it.pct, '');
        // 発酵計画ごとの量（ロデヴのイーストなど）も1つずつ確認する
        const pb = planBranch(v);
        for (const [k, p] of Object.entries(it.byPlan || {})) {
          pctCheck(p || {}, `（${pb?.options.find((o) => o.id === k)?.label || k}）`);
        }
      } else if (it.basis === 'batch') {
        if (!(num(it.g) && +it.g >= 0)) errs.push(`「${nm}」の量を入力してください`);
      }
    }
  }
  // 下準備の単位
  for (const g of v.ingredientGroups) {
    if (g.kind !== 'prep' || !g.batch) continue;
    const b = g.batch;
    if (b.yieldPerUnit != null && !(num(b.yieldPerUnit) && +b.yieldPerUnit > 0)) errs.push(`「${g.name}」の仕上がり目安は0より大きくしてください`);
    for (const [k, label] of [['unit', '仕込みの単位'], ['maxUnitsPerCook', '1回の最大量']]) {
      if (b[k] != null && !(Number.isInteger(+b[k]) && +b[k] > 0)) errs.push(`「${g.name}」の${label}は正の整数にしてください`);
    }
  }
  errs.push(...validateScale(v));
  // 工程：実行できる工程（分岐以外）が1つ以上必要。分岐の中の工程も数える
  let stepCount = 0;
  eachStep(v.steps || [], (st) => { if (st.type !== 'branch') stepCount++; });
  if (stepCount === 0) errs.push('工程を1つ以上登録してください');
  // 工程の時間（作るモードのタイマーに直接使う）
  eachStep(v.steps || [], (st) => {
    const t = st.title || '（無名の工程）';
    const span = (lo, hi, label, unit) => {
      if (lo == null && hi == null) return;
      if (!num(lo) || +lo <= 0) errs.push(`「${t}」の${label}の最短は0より大きくしてください`);
      else if (num(hi) && +hi < +lo) errs.push(`「${t}」の${label}の最長（${hi}${unit}）が最短（${lo}${unit}）より短くなっています`);
      if (num(hi) && +hi <= 0) errs.push(`「${t}」の${label}の最長は0より大きくしてください`);
    };
    if (st.timer) span(st.timer.min, st.timer.max, 'タイマー', '分');
    if (st.ferment) span(st.ferment.min, st.ferment.max, '発酵時間', '分');
    // 冷蔵は取り出し目安の計算に最短・最長の両方を使うので、どちらも必須
    if (st.cold) {
      const { minH, maxH } = st.cold;
      if (!(num(minH) && +minH > 0) || !(num(maxH) && +maxH > 0)) errs.push(`「${t}」の冷蔵時間は最短・最長の両方を0より大きい数で入力してください`);
      else if (+maxH < +minH) errs.push(`「${t}」の冷蔵時間の最長（${maxH}時間）が最短（${minH}時間）より短くなっています`);
    }
  });
  return errs;
}

/* ───────────── V1.5：同じ生地で同時に作れるか（必ず variant 対 variant で判定する） ─────────────
 * 意味は「工程条件として同時製作できるか」。数量・HB容量・天板やオーブンの容量は含まない（Batch は V2）。
 * 判定の優先順位（配合が同じとき）：
 *   1. どちらかが mix:false             → nojudge（同じ配合・同時製作判定なし）
 *   2. 判定に必要な構造化データが足りない → nojudge（「データが無い」を「条件が違う」とは扱わない）
 *   3. すべての条件が合う               → same
 *   4. 一部の条件が違う                 → split（生地は一緒に仕込める・途中から別工程）
 * 配合が違い、系統（familyId）が同じ → family
 */
export const COMPAT_LEVELS = {
  same: '同じ生地で同時に作れる',
  split: '生地は一緒に仕込める（途中から別工程）',
  nojudge: '同じ配合（同時製作判定なし）',
  family: '同じ系統・配合違い',
};
const COMPAT_RANK = { same: 3, split: 2, nojudge: 1 };
const isNum = (x) => x != null && x !== '' && Number.isFinite(+x);
const fmtN = (x) => String(Math.round(+x * 10) / 10);

/** 発酵温度の判定用データ。「室温」は tempMode:'ambient'（表示文字列では判定しない）。
 *  tempMode 未指定でも tempMin/tempMax が数値なら 'range'（v1.1 のデータ）。 */
export function fermentTemp(f) {
  if (!f) return { mode: 'unknown' };
  if (f.tempMode === 'ambient') return { mode: 'ambient' };
  if (f.tempMode == null || f.tempMode === 'range') {
    const lo = isNum(f.tempMin) ? +f.tempMin : isNum(f.tempMax) ? +f.tempMax : null;
    const hi = isNum(f.tempMax) ? +f.tempMax : lo;
    if (lo != null) return { mode: 'range', min: lo, max: hi };
  }
  return { mode: 'unknown' };
}
/** 範囲が重なれば互換（端点一致も互換）。ambient 同士は互換、ambient と数値・不足値は判定不能。 */
export function compareTemp(a, b) {
  if (a.mode === 'unknown' || b.mode === 'unknown') return 'unknown';
  if (a.mode === 'ambient' && b.mode === 'ambient') return 'ok';
  if (a.mode !== b.mode) return 'unknown';
  return Math.max(a.min, b.min) <= Math.min(a.max, b.max) + 1e-9 ? 'ok' : 'ng';
}
const tempTxt = (t) => (t.mode === 'ambient' ? '室温' : t.mode === 'range' ? (t.min === t.max ? `${fmtN(t.min)}℃` : `${fmtN(t.min)}〜${fmtN(t.max)}℃`) : '温度なし');
const worst = (list) => (list.includes('unknown') ? 'unknown' : list.includes('ng') ? 'ng' : 'ok');

/** 型の寸法を正規化（幅と奥行の入れ替えは同じ型）。0.1cm 単位 */
export function panKey(p) {
  if (!(panVolume(p) > 0)) return null;
  const r = (x) => Math.round(+x * 10);
  const [a, b] = [r(p.w), r(p.d)].sort((x, y) => x - y);
  return `${a}x${b}x${r(p.h)}`;
}
const panTxt = (p) => { const [a, b] = [+p.w, +p.d].sort((x, y) => x - y); return `${fmtN(a)}×${fmtN(b)}×${fmtN(p.h)}cm`; };

/** 1本の工程の流れ（計画を選んだ後）を取り出す */
function routeOf(v, planId) {
  const pb = planBranch(v);
  const fl = flattenSteps(v.steps || [], pb && planId ? { [pb.id]: planId } : {});
  return { steps: fl.list.map((x) => x.step).filter((s) => s.type !== 'branch'), unresolved: !!fl.unresolved };
}
function primaryOf(v, steps) {
  const dough = steps.filter((s) => s.phase === 'dough');
  const cold = dough.find((s) => s.cold);
  if (cold) return { kind: 'cold', minH: cold.cold.minH, maxH: cold.cold.maxH };
  const fs = dough.filter((s) => s.ferment);
  if (fs.length) return { kind: 'ferment', temps: fs.map((s) => fermentTemp(s.ferment)) };
  if (v.hb?.mode === 'knead_first_fermentation') return { kind: 'hb', course: v.hb.course || '' };
  return { kind: 'none' };
}
const primaryTxt = (p) => (p.kind === 'cold' ? `冷蔵${fmtN(p.minH)}〜${fmtN(p.maxH)}時間` : p.kind === 'hb' ? `HB${p.course ? `（${p.course}）` : ''}` : p.kind === 'none' ? 'なし' : p.temps.map(tempTxt).join('→'));
function comparePrimary(a, b) {
  if (a.kind === 'cold' || b.kind === 'cold') {
    if (a.kind !== b.kind) return 'ng';
    if (![a.minH, a.maxH, b.minH, b.maxH].every(isNum)) return 'unknown';
    return Math.max(+a.minH, +b.minH) <= Math.min(+a.maxH, +b.maxH) ? 'ok' : 'ng';
  }
  if (a.kind === 'none' || b.kind === 'none') return a.kind === b.kind ? 'ok' : 'ng';
  if (a.kind === 'hb' && b.kind === 'hb') return normName(a.course) === normName(b.course) ? 'ok' : 'unknown';
  // HB で一次発酵する側と、手ごねで温度を決めて一次発酵する側：生地は1つなので、どちらかに合わせる（注記）
  if (a.kind === 'hb' || b.kind === 'hb') return 'note';
  if (a.temps.length !== b.temps.length) return 'ng';
  return worst(a.temps.map((t, i) => compareTemp(t, b.temps[i])));
}
function proofOf(steps) { return steps.filter((s) => s.phase === 'proof').map((s) => fermentTemp(s.ferment)); }
function compareProof(a, b) {
  if (a.length !== b.length) return 'ng';
  return worst(a.map((t, i) => compareTemp(t, b[i])));
}
const proofTxt = (list) => (list.length ? list.map(tempTxt).join('→') : 'なし');

function bakeStages(steps) {
  return steps.filter((s) => s.phase === 'bake').map((s) => (s.bake ? { ...s.bake, method: s.bake.method || 'oven' } : null));
}
const timeTxt = (b) => (isNum(b.min) ? (isNum(b.max) && +b.max !== +b.min ? `${fmtN(b.min)}〜${fmtN(b.max)}分` : `${fmtN(b.min)}分`) : '時間なし');
function stageTxt(b, first) {
  if (!b) return '条件なし';
  if (b.method === 'fry') return `揚げ${isNum(b.tempMin) ? fmtN(b.tempMin) : '?'}〜${isNum(b.tempMax) ? fmtN(b.tempMax) : '?'}℃`;
  if (b.method === 'hb') return 'HBで焼成';
  return `${isNum(b.temp) ? fmtN(b.temp) : '?'}℃${b.steam ? 'スチーム' : ''}${first && isNum(b.preheat) ? `（予熱${fmtN(b.preheat)}℃）` : ''}`;
}
const bakeTxt = (st) => (st.length ? st.map((b, i) => stageTxt(b, i === 0)).join('→') : 'なし');
const eqNum = (x, y) => (isNum(x) && isNum(y) ? (Math.abs(+x - +y) < 1e-9 ? 'ok' : 'ng') : 'unknown');
function compareStage(a, b, first) {
  if (!a || !b) return 'unknown';
  if (a.method !== b.method) return 'ng';
  if (a.method === 'hb') return 'ng';                              // HB は1台で1つしか焼けない
  if (a.method === 'fry') return worst([eqNum(a.tempMin, b.tempMin), eqNum(a.tempMax, b.tempMax)]);
  const res = [eqNum(a.temp, b.temp), !!a.steam === !!b.steam ? 'ok' : 'ng'];  // 温度は完全一致のみ
  if (first) res.push(isNum(a.preheat) || isNum(b.preheat) ? eqNum(a.preheat, b.preheat) : 'ok');
  return worst(res);
}
const timeRange = (b) => (isNum(b?.min) ? [+b.min, isNum(b.max) ? +b.max : +b.min] : null);
function compareBake(a, b) {
  if (!a.length || !b.length) return { cond: a.length || b.length ? 'ng' : 'unknown', time: 'ok' };
  if (a.length !== b.length) return { cond: 'ng', time: 'ok' };
  const cond = worst(a.map((x, i) => compareStage(x, b[i], i === 0)));
  // 多段焼成：最後の段より前の時間は温度を切り替える時刻 → 範囲が重なる必要がある。最後の段の時間差は注記だけ
  const pre = a.slice(0, -1).map((x, i) => {
    const ra = timeRange(x), rb = timeRange(b[i]);
    if (!ra || !rb) return 'unknown';
    return Math.max(ra[0], rb[0]) <= Math.min(ra[1], rb[1]) ? 'ok' : 'ng';
  });
  const la = timeRange(a[a.length - 1]), lb = timeRange(b[b.length - 1]);
  const lastSame = la && lb && la[0] === lb[0] && la[1] === lb[1];
  return { cond, pre: worst(pre), lastNote: !lastSame && la && lb };
}

/** 生地の形：分割重量（±1g）か、型焼きなら型（幅・奥行の入れ替えは同じ）と容積あたりの粉量 */
function shapeOf(v) {
  if (v.scaleMode === 'panVolume') return { kind: 'pan', key: panKey(v.basePan), pan: v.basePan, flourPerCm3: panVolume(v.basePan) > 0 ? v.baseFlour / panVolume(v.basePan) : null };
  return { kind: 'piece', w: pieceWeight(v) };
}
function compareShape(a, b) {
  if (a.kind !== b.kind) return 'ng';
  if (a.kind === 'piece') return a.w == null || b.w == null ? 'unknown' : samePieceWeight(a.w, b.w) ? 'ok' : 'ng';
  if (!a.key || !b.key || a.flourPerCm3 == null || b.flourPerCm3 == null) return 'unknown';
  const same = Math.abs(a.flourPerCm3 - b.flourPerCm3) <= 1e-6 * Math.max(a.flourPerCm3, b.flourPerCm3);
  return a.key === b.key && same ? 'ok' : 'ng';
}
const shapeTxt = (s) => (s.kind === 'pan' ? (s.key ? panTxt(s.pan) : '型なし') : s.w == null ? '分割なし' : `${fmtN(s.w)}g`);

const pairTxt = (x, y) => (x === y ? x : `${x}／${y}`);
function comparePair(a, b, pa, pb, nameA, nameB) {
  const reasons = [];
  const add = (key, status, text) => reasons.push({ key, status, text });
  // 1. mix:false
  const noMix = [[a, nameA], [b, nameB]].filter(([v]) => v.mix === false);
  if (noMix.length) {
    for (const [v, nm] of noMix) add('mix', 'off', v.hb?.mode === 'full_auto' ? `HB全自動のため同時製作の対象外（${nm}）` : `同時製作の対象外に設定（${nm}）`);
    return { level: 'nojudge', reasons };
  }
  // 2. 工程データ
  const lack = [[a, nameA], [b, nameB]].filter(([v]) => !phaseComplete(v));
  if (lack.length) {
    for (const [, nm] of lack) add('data', 'unknown', `工程データ不足（${nm}）`);
    return { level: 'nojudge', reasons };
  }
  const ra = routeOf(a, pa), rb = routeOf(b, pb);
  if (ra.unresolved || rb.unresolved) {
    add('data', 'unknown', '途中で選ぶ分岐があるため比較できません');
    return { level: 'nojudge', reasons };
  }
  const sa = shapeOf(a), sb = shapeOf(b);
  const sh = compareShape(sa, sb);
  const shLabel = sa.kind === 'pan' && sb.kind === 'pan' ? '型' : sa.kind === 'piece' && sb.kind === 'piece' ? '分割' : '成形';
  add('shape', sh, sh === 'ok' ? `${shLabel} ${shapeTxt(sa)}` : sh === 'ng' ? `${shLabel}が違う ${pairTxt(shapeTxt(sa), shapeTxt(sb))}` : `${shLabel}を比較できない ${pairTxt(shapeTxt(sa), shapeTxt(sb))}`);
  const p1 = primaryOf(a, ra.steps), p2 = primaryOf(b, rb.steps);
  const pr = comparePrimary(p1, p2);
  add('primary', pr, pr === 'ok' ? `一次発酵 ${primaryTxt(p1)}` : pr === 'note' ? `一次発酵 ${pairTxt(primaryTxt(p1), primaryTxt(p2))}（どちらかに合わせる）` : pr === 'ng' ? `一次発酵が違う ${pairTxt(primaryTxt(p1), primaryTxt(p2))}` : `一次発酵を比較できない ${pairTxt(primaryTxt(p1), primaryTxt(p2))}`);
  const q1 = proofOf(ra.steps), q2 = proofOf(rb.steps);
  const pf = compareProof(q1, q2);
  add('proof', pf, pf === 'ok' ? `二次発酵 ${proofTxt(q1)}` : pf === 'ng' ? `二次発酵が違う ${pairTxt(proofTxt(q1), proofTxt(q2))}` : `二次発酵を比較できない ${pairTxt(proofTxt(q1), proofTxt(q2))}`);
  const b1 = bakeStages(ra.steps), b2 = bakeStages(rb.steps);
  const bk = compareBake(b1, b2);
  const bs = worst([bk.cond, bk.pre ?? 'ok']);
  const bt = (st) => st.map((x, i) => (i < st.length - 1 && x ? `${stageTxt(x, i === 0)} ${timeTxt(x)}` : stageTxt(x, i === 0))).join('→');
  add('bake', bs, bs === 'ok' ? `焼成 ${bakeTxt(b1)}` : bs === 'ng' ? `焼成条件が違う ${pairTxt(bt(b1), bt(b2))}` : `焼成を比較できない ${pairTxt(bakeTxt(b1), bakeTxt(b2))}`);
  if (bs === 'ok' && bk.lastNote) add('bakeTime', 'note', `焼き時間 ${timeTxt(b1[b1.length - 1])}／${timeTxt(b2[b2.length - 1])}（取り出しをずらす）`);
  const st = reasons.map((x) => x.status);
  const level = st.includes('unknown') ? 'nojudge' : st.includes('ng') ? 'split' : 'same';
  return { level, reasons };
}

/**
 * variant a と variant b の関係。{ level: same|split|nojudge|family|null, label, reasons[], diff?, plans[] }
 * 発酵計画（atStart の分岐）を持つ variant は計画ごとに比べる（同じ計画 id どうし。共通の id がなければ全組み合わせ）。
 * 全体の level は計画の組のうち最も良いもの。
 */
export function compatVariants(a, b, names = {}) {
  const nameA = names.a || a.name || 'A', nameB = names.b || b.name || 'B';
  if (doughSignature(a) !== doughSignature(b)) {
    const fa = a.dough?.familyId, fb = b.dough?.familyId;
    if (fa && fa === fb) return { level: 'family', label: COMPAT_LEVELS.family, reasons: [], diff: doughDiff(a, b), plans: [] };
    return { level: null, label: '', reasons: [], plans: [] };
  }
  const ids = (v) => planBranch(v)?.options.map((o) => o.id) || [null];
  const ia = ids(a), ib = ids(b);
  const common = ia.filter((x) => x != null && ib.includes(x));
  const pairs = common.length ? common.map((x) => [x, x]) : ia.flatMap((x) => ib.map((y) => [x, y]));
  const plans = pairs.map(([pa, pb]) => ({ a: pa, b: pb, ...comparePair(a, b, pa, pb, nameA, nameB) }));
  const best = plans.reduce((m, x) => (COMPAT_RANK[x.level] > COMPAT_RANK[m.level] ? x : m), plans[0]);
  return { level: best.level, label: COMPAT_LEVELS[best.level], reasons: best.reasons, plans: plans.length > 1 ? plans : [] };
}

/** 選んだ発酵計画どうしの判定（V2 の Batch は variant 全体の最良ではなく、実際に使う計画で判定する） */
export function compatForPlan(a, b, pa = null, pb = null, names = {}) {
  if (doughSignature(a) !== doughSignature(b)) return { level: null, reasons: [{ key: 'formula', status: 'ng', text: '配合が違う' }] };
  return comparePair(a, b, planBranch(a) ? pa : null, planBranch(b) ? pb : null, names.a || a.name || 'A', names.b || b.name || 'B');
}

/* ───────────── V2.0：まとめて作る（Batch＋子Bake） ─────────────
 * 「同じ生地で同時に作れる」組み合わせだけを、1本の工程として進める。
 *   prep：パン別 → dough：生地の作り方（lead）の工程を1回 → divide：共通 → shape：パン別
 *   → proof：共通（全員の時間範囲の重なり） → top：パン別 → bake：共通（最後の段の時間はパン別） → after：パン別
 * ここでは保存しない純粋な計算だけを行う（開始時に snapshot として固定する）。
 */
export const PHASE_ORDER = ['prep', 'dough', 'divide', 'shape', 'proof', 'top', 'bake', 'after'];
const cloneJ = (o) => JSON.parse(JSON.stringify(o));

/** 個数から scale を作る（count モード：個数、flour モードで分割数あり：粉量を比例させる） */
export function scaleForCount(v, count) {
  if (v.scaleMode === 'count') return scaleFor(v, { count });
  if (v.baseCount) return scaleFor(v, { flour: (v.baseFlour * count) / v.baseCount });
  return null;
}
const memberName = (m) => m.recipe?.name || m.v.name;
const rangeTxtMin = (r) => (r[0] === r[1] ? `${fmtN(r[0])}分` : `${fmtN(r[0])}〜${fmtN(r[1])}分`);
/** まとめて作るときの分割重量の比較キー（0.1g 単位） */
export const batchPieceKey = (v) => { const w = pieceWeight(v); return w == null ? null : Math.round(w * 10); };

/**
 * members: [{ recipe:{id,name,category,version}, v, count }]
 * opts: { leadIndex, planId }
 * 戻り値：{ ok, errors[], ...計画 }（ok:false のときは errors だけ信頼できる）
 */
export function planBatch(members, { leadIndex = 0, planId = null } = {}) {
  const errors = [];
  if (!Array.isArray(members) || members.length < 2) errors.push('まとめて作るパンを2つ以上選んでください');
  const list = members || [];
  const rids = list.map((m) => m.recipe?.id);
  if (new Set(rids).size !== rids.length) errors.push('同じレシピは1つだけ選べます（A/B などはどちらか1つ）');
  const lead = list[leadIndex];
  if (!lead) errors.push('生地の作り方を選んでください');
  for (const m of list) {
    const nm = memberName(m);
    if (!(Number.isInteger(+m.count) && +m.count >= 1)) errors.push(`「${nm}」の個数は1以上の整数にしてください`);
    const ve = validateVariant(m.v);
    if (ve.length) errors.push(`「${nm}」：${ve[0]}`);
    if (m.v.scaleMode === 'panVolume' || !scaleForCount(m.v, 1)) errors.push(`「${nm}」は個数で分けられないため、まとめて作れません（型焼きは V2.0 の対象外）`);
    const pb = planBranch(m.v);
    if (pb && !pb.options.some((o) => o.id === planId)) errors.push(`「${nm}」の発酵計画を選んでください`);
  }
  if (errors.length) return { ok: false, errors };
  const planOf = (v) => (planBranch(v) ? planId : null);
  // 全員の組み合わせが、選んだ計画どうしで「同じ生地で同時に作れる」こと
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const c = compatForPlan(a.v, b.v, planOf(a.v), planOf(b.v), { a: memberName(a), b: memberName(b) });
    if (c.level !== 'same') {
      const why = c.reasons.filter((x) => x.status !== 'ok' && x.status !== 'note').map((x) => x.text).join('、');
      errors.push(`「${memberName(a)}」と「${memberName(b)}」は同じ生地で同時に作れません${why ? `（${why}）` : ''}`);
    }
  }
  // 工程の区分が順番どおりに並んでいること（並べ直しても意味が変わらない）
  const routes = list.map((m) => routeOf(m.v, planOf(m.v)).steps);
  routes.forEach((st, i) => {
    let last = -1;
    for (const s of st) {
      const k = PHASE_ORDER.indexOf(s.phase);
      // 知らない区分の工程は並べ方が分からない：黙って捨てずに止める
      if (k < 0) { errors.push(`「${memberName(list[i])}」にまとめ製作で扱えない工程区分があります（「${s.title || s.id}」：${s.phase ?? 'なし'}）`); break; }
      if (k < last) { errors.push(`「${memberName(list[i])}」は工程の順番がまとめて作る形に対応していません`); break; }
      last = k;
    }
  });
  if (errors.length) return { ok: false, errors };
  // 1つの生地を分けるので、分割重量は実質同一（0.1g 単位で一致）であること。
  // V1.5 の「±1g なら同じ生地で同時に作れる」は表示用の互換判定で、ここではより厳しく見る
  const pieceKeys = list.map((m) => batchPieceKey(m.v));
  if (pieceKeys.some((k) => k == null) || new Set(pieceKeys).size > 1) {
    errors.push(`分割重量が異なります（${list.map((m) => `${memberName(m)} ${pieceWeight(m.v) == null ? '?' : fmtN(pieceWeight(m.v))}g`).join('／')}）。V2.0では同じ分割重量のパンだけまとめて作れます。`);
    return { ok: false, errors };
  }

  // 分量
  const total = list.reduce((s, m) => s + +m.count, 0);
  const leadSc = scaleForCount(lead.v, total);
  const leadAmt = computeAmounts(lead.v, leadSc, planOf(lead.v));
  const totalFlour = leadSc.flour;
  const totalDough = leadAmt.dough;
  const piece = totalDough / total;
  const cap = lead.v.hb?.capacity;
  if (lead.v.hb && lead.v.hb.mode !== 'none' && cap && cap.flourMax > 0 && totalFlour > cap.flourMax + 1e-9) {
    errors.push(`選択したHBコースの粉量上限${cap.flourMax}gを超えています（${Math.round(totalFlour)}g）。個数を減らすか、手ごねを選んでください。`);
  }
  const memberSc = list.map((m) => scaleForCount(m.v, +m.count));
  const memberAmt = list.map((m, i) => computeAmounts(m.v, memberSc[i], planOf(m.v)));

  // 二次発酵：全員の時間範囲の重なり（温度は範囲の重なり、室温は室温）。cue は生地の作り方の工程のもの
  const proofs = routes.map((st) => st.filter((s) => s.phase === 'proof'));
  const leadIdx = leadIndex;
  // 時間範囲を持たないパンの時間を、ほかのパンの時間で補わない（まとめて作るときだけ必須にする）
  proofs.forEach((ps, i) => ps.forEach((s) => {
    const f = s.ferment || {};
    if (!(isNum(f.min) && isNum(f.max) && +f.min > 0 && +f.max >= +f.min)) {
      errors.push(`「${memberName(list[i])}」の${s.title || '二次発酵'}に時間範囲が設定されていないため、まとめて作れません`);
    }
  }));
  if (errors.length) return { ok: false, errors };
  const commonProof = proofs[leadIdx].map((ls, k) => {
    const fs = proofs.map((p) => p[k]?.ferment || {});
    const min = Math.max(...fs.map((f) => +f.min));
    const max = Math.min(...fs.map((f) => +f.max));
    const temps = fs.map((f) => fermentTemp(f));
    const t = temps.every((x) => x.mode === 'range')
      ? { tempMode: 'range', tempMin: Math.max(...temps.map((x) => x.min)), tempMax: Math.min(...temps.map((x) => x.max)) }
      : { tempMode: temps[0].mode === 'ambient' ? 'ambient' : undefined };
    const each = list.map((m, i) => ({ name: memberName(m), min: fs[i].min ?? null, max: fs[i].max ?? null }));
    if (min != null && max != null && min > max) {
      errors.push(`二次発酵の時間が重なりません（${each.map((x) => `${x.name} ${x.min ?? '?'}〜${x.max ?? '?'}分`).join('／')}）。V2.0 ではまとめて作れません`);
    }
    return { stepId: ls.id, min, max, ...t, temp: t.tempMode === 'range' ? (t.tempMin === t.tempMax ? `${fmtN(t.tempMin)}℃` : `${fmtN(t.tempMin)}〜${fmtN(t.tempMax)}℃`) : ls.ferment?.temp ?? '', cue: ls.ferment?.cue ?? '', each };
  });
  if (errors.length) return { ok: false, errors };

  // 焼成：最後の段の時間はパン別（同じ投入時刻から取り出しをずらす）
  const bakes = routes.map((st) => st.filter((s) => s.phase === 'bake'));
  const lastStage = (st) => { const s = st[st.length - 1]; const b = s?.bake || {}; const r = isNum(b.min) ? [+b.min, isNum(b.max) ? +b.max : +b.min] : s?.timer ? [+s.timer.min, +(s.timer.max ?? s.timer.min)] : null; return r; };
  const outs = list.map((m, i) => ({ index: i, name: memberName(m), count: +m.count, range: lastStage(bakes[i]) }));
  const bakeOutDiffers = outs.some((o) => !o.range || !outs[0].range || o.range[0] !== outs[0].range[0] || o.range[1] !== outs[0].range[1]);
  // 多段焼成：最後の段より前の段は温度を切り替える時刻なので、全員の時間範囲の重なりを使う（lead の時間のままにしない）
  const stageRange = (s) => { const b = s?.bake || {}; return isNum(b.min) ? [+b.min, isNum(b.max) ? +b.max : +b.min] : s?.timer && isNum(s.timer.min) ? [+s.timer.min, isNum(s.timer.max) ? +s.timer.max : +s.timer.min] : null; };
  const nStage = bakes[leadIdx].length;
  const midStages = [];
  for (let k = 0; k < nStage - 1; k++) {
    const rs = bakes.map((st) => stageRange(st[k]));
    if (rs.some((r) => !r)) { errors.push(`焼成の${k + 1}段目の時間が設定されていないパンがあるため、まとめて作れません`); continue; }
    const lo = Math.max(...rs.map((r) => r[0])), hi = Math.min(...rs.map((r) => r[1]));
    if (lo > hi) errors.push(`焼成の${k + 1}段目の時間が重なりません（${list.map((m, i) => `${memberName(m)} ${rangeTxtMin(rs[i])}`).join('／')}）。まとめて作れません`);
    midStages[k] = { min: lo, max: hi, each: rs };
  }
  if (errors.length) return { ok: false, errors };

  // 工程をつなぐ
  const rows = {};
  for (const [id, r] of Object.entries(leadAmt.rows)) rows[`L:${id}`] = r;
  memberAmt.forEach((a, i) => { for (const [id, r] of Object.entries(a.rows)) rows[`m${i}:${id}`] = r; });
  const tag = (s, prefix, amt, i = null) => {
    const x = cloneJ(s);
    x.id = `${prefix}${s.id}`;
    x.body = tpl(s.body, amt);
    if (x.uses) x.uses = x.uses.map((u) => (typeof u === 'string' ? `${prefix}${u}` : { ...u, ref: `${prefix}${u.ref}` }));
    if (i != null) x.member = { index: i, recipeId: list[i].recipe?.id, name: memberName(list[i]), count: +list[i].count };
    return x;
  };
  const perMember = (phase) => list.flatMap((m, i) => routes[i].filter((s) => s.phase === phase).map((s) => tag(s, `m${i}:`, memberAmt[i], i)));
  const shared = (phase) => routes[leadIdx].filter((s) => s.phase === phase).map((s) => tag(s, 'L:', leadAmt));
  const allocation = list.map((m, i) => ({ index: i, recipeId: m.recipe?.id, recipeName: memberName(m), category: m.recipe?.category, variantId: m.v.id, variantName: m.v.name, count: +m.count, doughG: piece * +m.count, bakeId: null }));
  const divide = shared('divide');
  if (divide.length) {
    divide[0].allocation = allocation.map((a) => ({ name: a.recipeName, count: a.count }));   // 内訳は作るモードでチップ表示
  }
  const proof = shared('proof').map((s, k) => {
    const cp = commonProof[k];
    s.ferment = { ...s.ferment, temp: cp.temp, cue: cp.cue };
    if (cp.tempMode === 'range') Object.assign(s.ferment, { tempMode: 'range', tempMin: cp.tempMin, tempMax: cp.tempMax });
    if (cp.min != null) s.ferment.min = cp.min; else delete s.ferment.min;
    if (cp.max != null) s.ferment.max = cp.max; else delete s.ferment.max;
    return s;
  });
  const bake = shared('bake').map((s, k, arr) => {
    const ms = midStages[k];
    if (ms) {
      const leadR = ms.each[leadIdx];
      s.bake = { ...(s.bake || {}), min: ms.min, max: ms.max };
      if (s.timer) { s.timer = { ...s.timer, min: ms.min }; if (ms.max > ms.min) s.timer.max = ms.max; else delete s.timer.max; }
      if (leadR[0] !== ms.min || leadR[1] !== ms.max) s.tips = [...(s.tips || []), `まとめて作るときの時間：${rangeTxtMin([ms.min, ms.max])}（全部のパンで共通の範囲。本文の時間より優先）`];
    }
    // ほかのパンの焼成の注意も載せる（名前つき）
    const extra = list.flatMap((m, i) => (i === leadIdx ? [] : (bakes[i][k]?.tips || []).filter((t) => !(s.tips || []).includes(t)).map((t) => `${memberName(m)}：${t}`)));
    if (extra.length) s.tips = [...(s.tips || []), ...extra];
    if (k === arr.length - 1 && bakeOutDiffers) s.bakeOut = outs.map((o) => ({ index: o.index, name: o.name, count: o.count, min: o.range?.[0] ?? null, max: o.range?.[1] ?? null }));
    return s;
  });
  const steps = [...perMember('prep'), ...shared('dough'), ...divide, ...perMember('shape'), ...proof, ...perMember('top'), ...bake, ...perMember('after')];
  const title = allocation.map((a) => `${a.recipeName}${a.count}`).join('・');
  return {
    ok: true, errors: [],
    title, total, planId,
    lead: { index: leadIdx, recipeId: lead.recipe?.id, recipeName: memberName(lead), variantId: lead.v.id, variantName: lead.v.name, hb: lead.v.hb ? cloneJ(lead.v.hb) : null },
    familyId: lead.v.dough?.familyId || null, signature: doughSignature(lead.v),
    totalFlour, totalDough, pieceWeight: piece,
    leadScale: leadSc, leadAmounts: leadAmt, memberScales: memberSc, memberAmounts: memberAmt,
    allocation, commonProof, bakeOut: bakeOutDiffers ? outs : null,
    steps,
    amounts: { rows, groups: [], flour: totalFlour, dough: totalDough, count: total, piece, plan: planId },
  };
}

/**
 * 起動時・バックアップ復元後の修復：「まとめて作っている途中」（inBatch）なのに、
 * 進行中の Batch がそれを子として持っていない子Bake を、単独の途中状態のまま残さない。
 * 戻り値：[{ id, status, finishedAt }]（Batch があればその状態、無ければ aborted）。Batch を作り直すことはしない
 */
export function batchChildRepairs(bakes, batches, now = Date.now()) {
  const byId = new Map((batches || []).map((x) => [x.id, x]));
  const out = [];
  for (const k of bakes || []) {
    if (k.status !== 'inBatch') continue;
    const x = byId.get(k.batchId);
    if (x && x.status === 'active' && (x.childBakeIds || []).includes(k.id)) continue;
    const status = x && x.status !== 'active' ? x.status : 'aborted';
    out.push({ id: k.id, status, finishedAt: k.finishedAt || x?.finishedAt || k.updatedAt || now });
  }
  return out;
}
