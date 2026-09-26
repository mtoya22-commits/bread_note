// パンノート 自動テスト（計算・標準レシピ・移行処理）
// 実行: node tests.mjs  （app.js と同じフォルダで）
import * as C from './calc.js';
import { buildSeedRecipes, migrateRecipes, normalizeVariant, applyStepMeta, SEED_VERSION } from './seed.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const seeds = buildSeedRecipes();
const R = (id) => seeds.find((r) => r.id === id);
const sweet = [
  ['あんぱんA', R('anpan').variants.find((v) => v.id === 'hb')],
  ['あんぱんB', R('anpan').variants.find((v) => v.id === 'hand')],
  ['クリームパン', R('cream-pan').variants[0]],
  ['チョコ包みパン', R('choco-pan').variants[0]],
];

console.log(`SEED_VERSION ${SEED_VERSION}`);

console.log('1. doughSignature が4バリエーションで一致');
const sig0 = C.doughSignature(sweet[0][1]);
for (const [n, v] of sweet) ok(n, C.doughSignature(v) === sig0, C.doughSignature(v));
ok('材料の順序に依存しない', (() => { const v = clone(sweet[0][1]); v.ingredientGroups[1].items.reverse(); return C.doughSignature(v) === sig0; })());
ok('filling / finish / prep は含めない', !/custard|anko|choco|eggwash|cu-/.test(sig0));
ok('配合を変えると一致しない', (() => { const v = clone(sweet[2][1]); v.ingredientGroups[1].items[0].pct.target = 62; return C.doughSignature(v) !== sig0; })());
ok('差分表示（牛乳 target 60→62%、幅も表示）', (() => { const v = clone(sweet[2][1]); v.ingredientGroups[1].items[0].pct.target = 62; return C.doughDiff(sweet[0][1], v).join() === '牛乳 60〜65%→62〜65%'; })(), C.doughDiff(sweet[0][1], (() => { const v = clone(sweet[2][1]); v.ingredientGroups[1].items[0].pct.target = 62; return v; })()).join());

console.log('   差分表示（min/max・計画別）');
{
  const cp = sweet[2][1];
  const v = clone(cp); v.ingredientGroups[1].items[0].pct.max = 67.5;   // 牛乳 max 65% → 67.5%
  const d = C.doughDiff(cp, v);
  ok('max だけ変更：「60%→60%」にならない', !d.some((x) => /60%→60%$/.test(x)), d.join());
  ok('max だけ変更：「牛乳 60〜65%→60〜67.5%」', d.join() === '牛乳 60〜65%→60〜67.5%', d.join());
  ok('max だけ変更：signature は異なる', C.doughSignature(cp) !== C.doughSignature(v));
  const v2 = clone(cp); v2.ingredientGroups[1].items[0].pct.min = 55;    // min を追加
  ok('min を追加：「牛乳 60〜65%→55〜65%」', C.doughDiff(cp, v2).join() === '牛乳 60〜65%→55〜65%', C.doughDiff(cp, v2).join());
  const rv = R('rodev-90').variants[0];
  const r2 = clone(rv); r2.ingredientGroups[1].items.find((x) => x.id === 'yeast').byPlan.cold.target = 0.3;
  const d3 = C.doughDiff(rv, r2);
  ok('計画別だけ変更：「ドライイースト（冷蔵発酵 0.2%→0.3%）」', d3.join() === 'ドライイースト（冷蔵発酵 0.2%→0.3%）', d3.join());
  ok('計画別だけ変更：signature は異なる', C.doughSignature(rv) !== C.doughSignature(r2));
}

console.log('2. pieceWeight = 48.675g');
for (const [n, v] of sweet) { const w = C.pieceWeight(v); ok(`${n} ${w}`, Math.abs(w - 48.675) < 1e-9); }
ok('±1.0g は同一扱い（48.4 / 49.4）', C.samePieceWeight(48.4, 49.4));
ok('1.0g を超えたら別扱い（48.4 / 49.5）', !C.samePieceWeight(48.4, 49.5));

console.log('3. prep / basis:batch は normalize 後も g のまま');
{
  const v = normalizeVariant({
    baseFlour: 200, ingredientGroups: [
      { id: 'flour', kind: 'flour', items: [{ id: 'f', name: '粉', g: 200 }] },
      { id: 'custard', kind: 'prep', batch: { unit: 4 }, items: [{ id: 'cu-milk', name: '牛乳', basis: 'batch', g: 110 }] },
    ], steps: [],
  });
  const it = v.ingredientGroups[1].items[0];
  ok('basis:batch', it.basis === 'batch');
  ok('g:110', it.g === 110);
  ok('pct は作られない', it.pct == null);
  const cu = R('cream-pan').variants[0].ingredientGroups.find((g) => g.id === 'custard').items.find((x) => x.id === 'cu-milk');
  ok('標準レシピのカスタード牛乳 110g', cu.basis === 'batch' && cu.g === 110);
}

console.log('4. カスタードの炊く回');
{
  const batch = { unit: 4, maxUnitsPerCook: 2, yieldPerUnit: 145 };
  const want = (n) => (n <= 4 ? [1] : n <= 8 ? [2] : n <= 12 ? [2, 1] : n <= 16 ? [2, 2] : [2, 2, 1]);
  let all = true, bad = [];
  for (let n = 1; n <= 20; n++) {
    const got = C.prepPlan(batch, n).cooks;
    if (JSON.stringify(got) !== JSON.stringify(want(n))) { all = false; bad.push(`${n}:${got}`); }
  }
  ok('1〜20個すべて期待どおり', all, bad.join(' '));
  const v = R('cream-pan').variants[0];
  const at = (n) => C.computeAmounts(v, C.scaleFor(v, { count: n }));
  const g6 = at(6).groups.find((g) => g.id === 'custard');
  ok('6個 → 8個分・牛乳220g・使用予定210g', C.batchLabel(g6) === '8個分' && at(6).rows['cu-milk'].g === 220 && Math.round(g6.prep.useG) === 210);
  const g10 = at(10).groups.find((g) => g.id === 'custard');
  ok('10個 → 「8個分＋4個分（2回に分けて炊く）」', C.batchLabel(g10) === '8個分＋4個分（2回に分けて炊く）', C.batchLabel(g10));
  ok('10個 → 牛乳 330g（1回目220g／2回目110g）', at(10).rows['cu-milk'].g === 330 && JSON.stringify(at(10).rows['cu-milk'].perCook) === '[220,110]');
  ok('工程の差し込み {{batch:custard}}', C.tpl('カスタードを{{batch:custard}}炊く', at(3)) === 'カスタードを4個分炊く');
  ok('工程の差し込み {{use:custard}}', C.tpl('{{use:custard}}', at(3)) === '105g');
  ok('カスタードは生地総量に含めない', Math.abs(at(8).dough - 389.4) < 1e-9);
}

console.log('5. yieldPerUnit の妥当性');
{
  ok('145 >= 35×4 で合格', C.prepYieldWarnings(R('cream-pan').variants[0]).length === 0);
  const v = clone(R('cream-pan').variants[0]);
  v.ingredientGroups.find((g) => g.id === 'filling').items[0].perCount.target = 40;
  const w = C.prepYieldWarnings(v);
  ok('40g×4=160 > 145 で警告', w.length === 1 && /足りない可能性/.test(w[0].msg));
}

console.log('10. 古い SEED_VERSION からの直接移行で編集済みロデヴを上書きしない');
for (const from of [1, 2]) {
  const mine = clone(R('rodev-90'));
  mine.name = '私のロデヴ';
  mine.variants[0].steps = mine.variants[0].steps.filter((s) => s.type !== 'branch');
  delete mine.seedRev; delete mine.userEdited; delete mine.variants[0].baseCount;
  mine.changeLog = [{ version: 1, note: '初期登録' }, { version: 2, note: '水を増やした' }];
  const recipes = [mine];
  migrateRecipes(recipes, from);
  ok(`SEED_VERSION ${from} → ${SEED_VERSION}: 名前・工程がそのまま`, recipes[0].name === '私のロデヴ' && !recipes[0].variants[0].steps.some((s) => s.type === 'branch'));
  ok(`SEED_VERSION ${from}: 編集済みには baseCount も書き足さない`, recipes[0].variants[0].baseCount == null);
}
{
  const plain = clone(R('rodev-90'));
  plain.variants[0].steps = plain.variants[0].steps.filter((s) => s.type !== 'branch');
  delete plain.seedRev; delete plain.userEdited;
  plain.changeLog = [{ version: 1, note: '初期登録' }];
  const recipes = [plain];
  migrateRecipes(recipes, 2);
  ok('未編集のロデヴは従来どおり標準版へ置き換わる', recipes[0].variants[0].steps.some((s) => s.type === 'branch'));
}

console.log('   メタデータ移行（phase は variant 単位で全部 or なし）');
{
  // 旧あんぱん（phase なし）に、構造が同じなら全工程へ付く
  const old = clone(R('anpan'));
  for (const v of old.variants) { delete v.dough; for (const s of v.steps) { delete s.phase; delete s.bake; } for (const g of v.ingredientGroups) for (const it of g.items) delete it.ingKey; }
  old.userEdited = true; old.name = '私のあんぱん';
  const recipes = [old];
  migrateRecipes(recipes, 4);
  const A = recipes[0].variants[0];
  ok('dough.familyId を書き足す', A.dough?.familyId === 'basic-sweet-dough');
  ok('一致する variant には全工程へ phase', C.phaseComplete(A));
  ok('ingKey を書き足し、指紋が標準と一致', C.doughSignature(A) === sig0);
  ok('名前（ユーザーの編集）はそのまま', recipes[0].name === '私のあんぱん');
  // タイマーを変えた variant には一切付かない
  const old2 = clone(R('anpan'));
  for (const v of old2.variants) for (const s of v.steps) { delete s.phase; delete s.bake; }
  old2.variants[0].steps.find((s) => s.id === 'a-div').timer.min = 20;
  migrateRecipes([old2], 4);
  ok('タイマーが違う variant は phase なしのまま（部分付与しない）', old2.variants[0].steps.every((s) => !s.phase));
  ok('もう一方の variant（未変更）には付く', C.phaseComplete(old2.variants[1]));
  // 見出しだけ・cue だけ変えた variant にも付けない（本文 body の言い回しは許容）
  const base = R('anpan');
  const stripped = () => { const r = clone(base); for (const v of r.variants) for (const s of v.steps) { delete s.phase; delete s.bake; } return r; };
  const t1 = stripped(); t1.variants[0].steps.find((s) => s.id === 'a-wrap').title = '包む（私流）';
  ok('工程 title だけ変更 → applyStepMeta() false', applyStepMeta(t1.variants[0], base.variants[0]) === false && t1.variants[0].steps.every((s) => !s.phase));
  const t2 = stripped(); t2.variants[0].steps.find((s) => s.id === 'a-ferm2').ferment.cue = '1.5倍くらい';
  ok('ferment.cue だけ変更 → applyStepMeta() false', applyStepMeta(t2.variants[0], base.variants[0]) === false && t2.variants[0].steps.every((s) => !s.phase));
  const t3 = stripped(); t3.variants[0].steps.find((s) => s.id === 'a-wrap').body = '言い回しだけ変えた本文';
  ok('本文 body だけ変更 → true（許容）', applyStepMeta(t3.variants[0], base.variants[0]) === true && C.phaseComplete(t3.variants[0]));
}

console.log('12. HB容量（SB-2D271 パン生地コース 320g）');
{
  const v = R('anpan').variants[0];
  ok('粉200g（8個）警告なし', C.hbCapacityWarning(v, 200) == null);
  ok('粉300g（12個）警告なし', C.hbCapacityWarning(v, 300) == null);
  ok('粉320g ちょうどは警告なし', C.hbCapacityWarning(v, 320) == null);
  ok('粉400g（16個）警告あり', /320g/.test(C.hbCapacityWarning(v, 400) || ''));
  ok('手ごね版（容量なし）は警告しない', C.hbCapacityWarning(R('anpan').variants[1], 400) == null);
  ok('ほかのコース（食パン全自動）には流用しない', C.hbCapacityWarning(R('shokupan-junnama').variants[0], 400) == null);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
