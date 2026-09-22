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
export function computeAmounts(v, sc) {
  const count = v.scaleMode === 'count' ? sc.count : v.baseCount ? v.baseCount * sc.factor : null;
  const rows = {};
  let doughRaw = 0, moist = 0;
  const groups = v.ingredientGroups.map((g) => ({
    id: g.id, name: g.name, kind: g.kind,
    rows: g.items.map((it) => {
      const r = computeItem(it, sc, count);
      r.group = g.id; r.kind = g.kind;
      rows[it.id] = r;
      if ((g.kind === 'flour' || g.kind === 'dough') && r.raw != null) {
        doughRaw += r.raw;
        moist += r.raw * (it.moisture || 0);
      }
      return r;
    }),
  }));
  return {
    groups, rows,
    flour: sc.flour,
    dough: doughRaw,
    hydration: sc.flour ? (moist / sc.flour) * 100 : null,
    count,
    piece: count ? doughRaw / count : null,
  };
}

function computeItem(it, sc, count) {
  const p = it.precision || 1;
  const base = { id: it.id, name: it.name, precision: p, note: it.note || '', tentative: !!it.tentative, moisture: it.moisture || 0 };
  if (it.basis === 'flour') {
    const f = (k) => (it.pct[k] == null ? null : (it.pct[k] / 100) * sc.flour);
    const raw = f('target');
    return { ...base, raw, g: roundP(raw, p), min: roundP(f('min'), p), max: roundP(f('max'), p), pct: { ...it.pct } };
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

/** Step text templates: {{count}} {{piece}} {{per:id}} {{min:id}} {{max:id}} {{g:id}} */
export function tpl(text, amt) {
  if (!text) return '';
  return text.replace(/\{\{(\w+)(?::([\w-]+))?\}\}/g, (m, k, id) => {
    const r = id ? amt.rows[id] : null;
    switch (k) {
      case 'count': return fmtCount(amt.count);
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
      list.push({ step: s, opt });
      if (s.type === 'branch') {
        const o = s.options.find((x) => x.id === choices[s.id]);
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
