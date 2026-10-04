// パンノート 自動テスト（計算・標準レシピ・移行処理）
// 実行: node tests.mjs  （app.js と同じフォルダで）
import * as C from './calc.js';
import { buildSeedRecipes, migrateRecipes, normalizeVariant, applyStepMeta, SEED_VERSION, DOUGH_FAMILIES, OVEN } from './seed.js';

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

console.log('v1.1.2-1. 材料名を変えたら ingKey を外す');
{
  const before = sweet[0][1], after = clone(before);
  after.ingredientGroups[1].items.find((x) => x.id === 'milk').name = '豆乳';
  C.reconcileIngKeys(before, after);
  ok('牛乳→豆乳で ingKey が外れる', after.ingredientGroups[1].items.find((x) => x.id === 'milk').ingKey == null);
  ok('クリームパンとは signature が別になる', C.doughSignature(after) !== C.doughSignature(sweet[2][1]));
  const keep = clone(before);
  keep.ingredientGroups[1].items.find((x) => x.id === 'milk').name = ' 牛 乳 ';   // 空白だけの違い
  C.reconcileIngKeys(before, keep);
  ok('空白だけの違いなら ingKey を保つ', keep.ingredientGroups[1].items.find((x) => x.id === 'milk').ingKey === 'milk' && C.doughSignature(keep) === sig0);
  const kana = clone(before);
  kana.ingredientGroups[1].items.find((x) => x.id === 'yeast').name = 'ﾄﾞﾗｲｲｰｽﾄ';   // 半角カナ（NFKC で同じ）
  C.reconcileIngKeys(before, kana);
  ok('半角・全角の違いなら ingKey を保つ', kana.ingredientGroups[1].items.find((x) => x.id === 'yeast').ingKey === 'yeast.dry');
}

console.log('v1.1.2-2. 工程の条件を変えたら mix 用メタデータを外す');
{
  const cp = sweet[2][1];
  const e1 = clone(cp); e1.steps.find((x) => x.id === 'cp-bake').timer = { min: 20, max: 25, label: '焼成' };
  ok('焼成タイマー 12〜15→20〜25分：外す', C.stripStaleMixMeta(cp, e1) === true);
  ok('  phaseComplete が false', !C.phaseComplete(e1));
  ok('  bake が残っていない', e1.steps.every((x) => x.bake == null));
  ok('  parallel は残る', e1.steps.find((x) => x.id === 'cp1').parallel === true);
  const e2 = clone(cp); Object.assign(e2.steps.find((x) => x.id === 'cp-ferm2').ferment, { temp: '25℃', min: 90, max: 120 });
  ok('二次発酵 25℃・90〜120分：外す（tempMin/tempMax も）', C.stripStaleMixMeta(cp, e2) === true && e2.steps.every((x) => x.ferment?.tempMin == null && x.ferment?.tempMax == null));
  const e3 = clone(cp); e3.steps.push({ id: 'new', title: '追加の工程', body: '' });
  ok('工程を追加：外す', C.stripStaleMixMeta(cp, e3) === true && !C.phaseComplete(e3));
  const e4 = clone(cp); e4.steps.find((x) => x.id === 'cp-shape').title = '包む（私流）'; e4.steps.find((x) => x.id === 'cp-shape').body = '言い回しを変えた';
  ok('見出し・本文だけの変更：残す', C.stripStaleMixMeta(cp, e4) === false && C.phaseComplete(e4));
}

console.log('v1.1.2-6. 同じ材料を複数行に分けたときの min/max 合算');
{
  const mk = (rows) => ({ ingredientGroups: [{ id: 'dough', kind: 'dough', items: rows.map((p, i) => ({ id: `w${i}`, name: '水', basis: 'flour', pct: p })) }] });
  const split = mk([{ target: 10 }, { target: 20, max: 30 }]);
  const single = mk([{ target: 30, max: 40 }]);
  ok('水10% ＋ 水20〜30% ≡ 水30〜40%', C.doughSignature(split) === C.doughSignature(single), `${C.doughSignature(split)} / ${C.doughSignature(single)}`);
  const lo = mk([{ target: 10 }, { target: 20, min: 15 }]);
  ok('水10% ＋ 水15〜20% ≡ 水25〜30%', C.doughSignature(lo) === C.doughSignature(mk([{ target: 30, min: 25 }])));
  const pl = { ingredientGroups: [{ id: 'dough', kind: 'dough', items: [
    { id: 'y1', name: 'イースト', basis: 'flour', pct: { target: 0.2 } },
    { id: 'y2', name: 'イースト', basis: 'flour', pct: { target: 0.2 }, byPlan: { today: { target: 0.2 }, cold: { target: 0 } } }] }] };
  const pl1 = { ingredientGroups: [{ id: 'dough', kind: 'dough', items: [
    { id: 'y', name: 'イースト', basis: 'flour', pct: { target: 0.4 }, byPlan: { today: { target: 0.4 }, cold: { target: 0.2 } } }] }] };
  ok('計画別の量も、計画のない行の量を足して比較', C.doughSignature(pl) === C.doughSignature(pl1), `${C.doughSignature(pl)} / ${C.doughSignature(pl1)}`);
}

console.log('v1.1.3-1. 焼成工程の本文・焼成の要約の変更');
{
  const cp = sweet[2][1];
  const e1 = clone(cp); e1.steps.find((x) => x.id === 'cp-bake').body = '200℃で予熱 → 190℃で焼く。';
  ok('焼成本文 190→200℃予熱・180→190℃：外す', C.stripStaleMixMeta(cp, e1) === true && !C.phaseComplete(e1) && e1.steps.every((x) => !x.bake));
  const e2 = clone(cp); e2.bakeSummary = '200℃予熱 → 190℃ 12〜15分';
  ok('焼成の要約だけ変更：外す', C.stripStaleMixMeta(cp, e2) === true);
  const e3 = clone(cp); e3.steps.find((x) => x.id === 'cp-shape').body = '言い回しだけ変えた成形の本文';
  ok('成形の本文だけ変更：残す', C.stripStaleMixMeta(cp, e3) === false && C.phaseComplete(e3));
  // 移行：旧あんぱんで焼成本文だけ190℃に変えていた場合は付けない
  const old = clone(R('anpan'));
  for (const v of old.variants) for (const x of v.steps) { delete x.phase; delete x.bake; }
  old.variants[0].steps.find((x) => x.id === 'a-bake').body = '190℃で焼く。';
  ok('移行：焼成本文が標準と違う variant には付けない', applyStepMeta(old.variants[0], R('anpan').variants[0]) === false && old.variants[0].steps.every((x) => !x.phase && !x.bake));
  const old2 = clone(R('anpan'));
  for (const v of old2.variants) for (const x of v.steps) { delete x.phase; delete x.bake; }
  old2.variants[0].bakeSummary = '190℃ 15分';
  ok('移行：焼成の要約が標準と違う variant には付けない', applyStepMeta(old2.variants[0], R('anpan').variants[0]) === false);
}

console.log('v1.1.3-2. 名前を標準に戻したら ingKey を戻す');
{
  const std = sweet[0][1];
  const s1 = clone(std); s1.ingredientGroups[1].items.find((x) => x.id === 'milk').name = '豆乳';
  C.reconcileIngKeys(std, s1, std);
  ok('牛乳→豆乳：外れる', s1.ingredientGroups[1].items.find((x) => x.id === 'milk').ingKey == null && C.doughSignature(s1) !== sig0);
  const s2 = clone(s1); s2.ingredientGroups[1].items.find((x) => x.id === 'milk').name = '牛乳';
  C.reconcileIngKeys(s1, s2, std);
  ok('豆乳→牛乳に戻す：ingKey が戻り signature が再一致', s2.ingredientGroups[1].items.find((x) => x.id === 'milk').ingKey === 'milk' && C.doughSignature(s2) === sig0);
  ok('  差分表示も空になる', C.doughDiff(std, s2).length === 0, C.doughDiff(std, s2).join());
  const s3 = clone(s1); s3.ingredientGroups[1].items.find((x) => x.id === 'milk').name = '牛乳';
  C.reconcileIngKeys(s1, s3, null);
  ok('標準レシピでない（standard なし）なら戻さない', s3.ingredientGroups[1].items.find((x) => x.id === 'milk').ingKey == null);
}

console.log('v1.1.3-3. 下準備の材料を変えたら仕上がり目安を未確認に');
{
  const cp = sweet[2][1];
  const e = clone(cp);
  for (const it of e.ingredientGroups.find((g) => g.id === 'custard').items) if (it.basis === 'batch') it.g = 1;
  C.markChangedPreps(cp, e);
  const g = e.ingredientGroups.find((x) => x.id === 'custard');
  ok('材料を全部1gに：yieldVerified=false', g.batch.yieldVerified === false);
  ok('  prepKey は外し、元の値は prepKeyOrigin に残す', g.prepKey == null && g.prepKeyOrigin === 'custard-basic');
  const w = C.prepYieldWarnings(e);
  ok('  「再確認が必要」の警告が出る', w.some((x) => x.unverified && /再確認が必要/.test(x.msg)), JSON.stringify(w));
  const e2 = clone(e); e2.ingredientGroups.find((x) => x.id === 'custard')._yieldConfirmed = true;
  C.markChangedPreps(e, e2);
  ok('「実際に作って確認した」なら yieldVerified=true・警告なし', e2.ingredientGroups.find((x) => x.id === 'custard').batch.yieldVerified === true && C.prepYieldWarnings(e2).length === 0);
  const e3 = clone(cp); e3.ingredientGroups.find((x) => x.id === 'filling').items[0].note = 'メモだけ変更';
  C.markChangedPreps(cp, e3);
  ok('下準備の材料を変えていなければそのまま', e3.ingredientGroups.find((x) => x.id === 'custard').batch.yieldVerified == null && e3.ingredientGroups.find((x) => x.id === 'custard').prepKey === 'custard-basic');
}

console.log('v1.1.3-5. 保存前の入力チェック');
{
  const cp = sweet[2][1];
  ok('標準6レシピ（全 variant）は問題なし', seeds.every((r) => r.variants.every((v) => C.validateVariant(v).length === 0)), seeds.flatMap((r) => r.variants.flatMap((v) => C.validateVariant(v))).join());
  const e1 = clone(cp); e1.ingredientGroups.find((g) => g.id === 'filling').items[0].perCount.target = null;
  ok('カスタードの1個あたりが空欄：エラー', C.validateVariant(e1).some((m) => /1個あたりの量/.test(m)));
  const e2 = clone(R('choco-pan').variants[0]); Object.assign(e2.ingredientGroups.find((g) => g.id === 'filling').items[0].perCount, { min: 20, target: 18, max: 25 });
  ok('チョコ min 20 > target 18：エラー', C.validateVariant(e2).some((m) => /最小/.test(m)));
  const e3 = clone(cp); e3.ingredientGroups[1].items[0].pct.max = 50;
  ok('牛乳 max 50% < target 60%：エラー', C.validateVariant(e3).some((m) => /最大/.test(m)));
}

console.log('v1.1.3-6. 編集画面の不具合（空欄の最小・最大が 0% で保存）の修復');
{
  const bad = clone(R('anpan'));
  for (const v of bad.variants) for (const g of v.ingredientGroups) for (const it of g.items) if (it.pct) { it.pct.min ??= 0; it.pct.max ??= 0; }
  bad.variants[0].ingredientGroups[1].items.find((x) => x.id === 'milk').pct.max = 65;   // 正しく入力された最大は残る
  ok('修復前は signature が標準と一致しない', C.doughSignature(bad.variants[0]) !== sig0);
  migrateRecipes([bad], 5);
  ok('SEED_VERSION 5→6 の修復後は標準と一致', C.doughSignature(bad.variants[0]) === sig0 && C.doughSignature(bad.variants[1]) === sig0, C.doughSignature(bad.variants[0]));
  ok('入力済みの牛乳の最大65%は残す', bad.variants[0].ingredientGroups[1].items.find((x) => x.id === 'milk').pct.max === 65);
  const own = { id: 'mine', variants: [{ id: 'v', ingredientGroups: [{ id: 'dough', kind: 'dough', items: [{ id: 'w', name: '水', basis: 'flour', pct: { target: 2, min: 0, max: 5 } }] }], steps: [] }] };
  migrateRecipes([own], 5);
  ok('自作レシピの意図した「最小0%・最大5%」は残す', own.variants[0].ingredientGroups[0].items[0].pct.min === 0 && own.variants[0].ingredientGroups[0].items[0].pct.max === 5);
}

console.log('v1.1.4-1. 標準の工程に完全に戻したら同時製作用データを付け直す');
{
  const cp = sweet[2][1];
  const e = clone(cp); e.steps.find((x) => x.id === 'cp-bake').timer = { min: 20, max: 25, label: '焼成 180℃' };
  C.stripStaleMixMeta(cp, e);
  ok('12〜15→20〜25分：phase が消える', !C.phaseComplete(e));
  const back = clone(e); back.steps.find((x) => x.id === 'cp-bake').timer = { min: 12, max: 15, label: '焼成 180℃' };
  C.stripStaleMixMeta(e, back);
  const restored = !C.phaseComplete(back) && applyStepMeta(back, cp);
  const canon = (o) => JSON.stringify(o, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
  ok('12〜15分に戻す：phase・bake・tempMin/tempMax が完全に戻る（標準と同じ内容）', restored && canon(back.steps) === canon(cp.steps) && C.phaseComplete(back));
  const half = clone(e); half.steps.find((x) => x.id === 'cp-bake').timer = { min: 12, max: 16, label: '焼成 180℃' };
  C.stripStaleMixMeta(e, half);
  ok('1項目でも違う（最長16分）なら戻さない', applyStepMeta(half, cp) === false && !C.phaseComplete(half));
  const tb = clone(e); tb.steps.find((x) => x.id === 'cp-bake').timer = { min: 12, max: 15, label: '焼成 180℃' }; tb.steps.find((x) => x.id === 'cp-bake').body = '180℃で焼く。';
  ok('タイマーは戻っても焼成本文が違えば戻さない', applyStepMeta(tb, cp) === false);
}

console.log('v1.1.4-2. 工程時間・負数の入力チェック');
{
  const cp = sweet[2][1];
  const chk = (fn) => { const v = clone(cp); fn(v); return C.validateVariant(v); };
  ok('timer 最短20 > 最長10：保存不可', chk((v) => { v.steps.find((x) => x.id === 'cp-bake').timer = { min: 20, max: 10 }; }).some((m) => /最長.*最短/.test(m)));
  ok('timer 負数：保存不可', chk((v) => { v.steps.find((x) => x.id === 'cp-bake').timer = { min: -5 }; }).some((m) => /0より大きく/.test(m)));
  ok('ferment 最短90 > 最長40：保存不可', chk((v) => { Object.assign(v.steps.find((x) => x.id === 'cp-ferm2').ferment, { min: 90, max: 40 }); }).some((m) => /発酵時間/.test(m)));
  ok('cold 最短15h > 最長8h：保存不可', (() => { const v = clone(R('rodev-90').variants[0]); const c = C.findStep(v.steps, 'cd-cold'); c.cold = { minH: 15, maxH: 8 }; return C.validateVariant(v).some((m) => /冷蔵時間/.test(m)); })());
  ok('材料の target 負数（塩 -1%）：保存不可', chk((v) => { v.ingredientGroups[1].items.find((x) => x.id === 'salt').pct.target = -1; }).some((m) => /塩/.test(m)));
  ok('材料の max 負数：保存不可', chk((v) => { v.ingredientGroups[1].items.find((x) => x.id === 'salt').pct.max = -1; }).some((m) => /最大が負/.test(m)));
  ok('発酵が見た目だけ（時間なし）の工程は問題なし', C.validateVariant(R('rodev-90').variants[0]).length === 0);
}

console.log('v1.1.4-3. カスタードを標準に戻したら prepKey を戻す');
{
  const cp = sweet[2][1];
  const cu = (v) => v.ingredientGroups.find((x) => x.id === 'custard');
  const e1 = clone(cp); cu(e1).items.find((x) => x.id === 'cu-milk').g = 120;
  C.markChangedPreps(cp, e1, cp);
  ok('牛乳110→120g：prepKey が外れる', cu(e1).prepKey == null && cu(e1).prepKeyOrigin === 'custard-basic');
  const e2 = clone(e1); cu(e2).items.find((x) => x.id === 'cu-milk').g = 110; cu(e2)._yieldConfirmed = true;
  C.markChangedPreps(e1, e2, cp);
  ok('110gに戻して確認済み：prepKey:custard-basic が戻る', cu(e2).prepKey === 'custard-basic' && cu(e2).batch.yieldVerified === true);
  const e3 = clone(e1); cu(e3).items.find((x) => x.id === 'cu-milk').g = 110;
  C.markChangedPreps(e1, e3, cp);
  ok('110gに戻しても未確認なら戻さない', cu(e3).prepKey == null);
  const e4 = clone(e1); cu(e4).items.find((x) => x.id === 'cu-milk').g = 110; cu(e4).items.find((x) => x.id === 'cu-sugar').g = 26; cu(e4)._yieldConfirmed = true;
  C.markChangedPreps(e1, e4, cp);
  ok('砂糖が1gでも違えば戻さない', cu(e4).prepKey == null);
  const e5 = clone(e1); cu(e5).items.find((x) => x.id === 'cu-milk').g = 110; cu(e5).batch.yieldPerUnit = 150; cu(e5)._yieldConfirmed = true;
  C.markChangedPreps(e1, e5, cp);
  ok('仕上がり目安（batch 設定）が違えば戻さない', cu(e5).prepKey == null);
}

console.log('v1.1.5-1. byPlan（発酵計画ごとの％）を1つずつ確認');
{
  const rd = R('rodev-90').variants[0];
  const yeastOf = (v) => v.ingredientGroups.flatMap((g) => g.items).find((x) => x.byPlan);
  const plans = Object.keys(yeastOf(rd).byPlan);
  ok('ロデヴのイーストは計画2つ（当日・冷蔵）', plans.length === 2);
  const setPlans = (a, b) => { const v = clone(rd); const y = yeastOf(v); y.byPlan[plans[0]] = { target: a }; y.byPlan[plans[1]] = { target: b }; y.pct = y.byPlan[plans[0]]; return C.validateVariant(v); };
  ok('当日0.4% / 冷蔵-0.2%：保存不可', setPlans(0.4, -0.2).length > 0, setPlans(0.4, -0.2).join());
  ok('当日0.4% / 冷蔵0.2%：保存可', setPlans(0.4, 0.2).length === 0, setPlans(0.4, 0.2).join());
  ok('当日-0.4%（先頭の計画）：保存不可', setPlans(-0.4, 0.2).length > 0);
  const withRange = (p) => { const v = clone(rd); const y = yeastOf(v); y.byPlan[plans[1]] = p; return C.validateVariant(v); };
  ok('計画の min 負数：保存不可', withRange({ target: 0.2, min: -0.1 }).length > 0);
  ok('計画の max 負数：保存不可', withRange({ target: 0.2, max: -0.1 }).length > 0);
  ok('計画の 最小 > 目安：保存不可', withRange({ target: 0.2, min: 0.3 }).length > 0);
  ok('計画の 目安 > 最大：保存不可', withRange({ target: 0.2, max: 0.1 }).length > 0);
  ok('計画の 最小 ≤ 目安 ≤ 最大：保存可', withRange({ target: 0.2, min: 0.1, max: 0.3 }).length === 0);
  ok('エラー文に計画名が入る', setPlans(0.4, -0.2).some((m) => /冷蔵/.test(m)), setPlans(0.4, -0.2).join());
}

console.log('v1.1.5-2. 個数・分割数は正の整数');
{
  const bc = (x, id = 'rodev-90') => { const v = clone(R(id).variants[0]); v.baseCount = x; return C.validateVariant(v); };
  ok('ロデヴは flour モード・分割数2', R('rodev-90').variants[0].scaleMode === 'flour' && R('rodev-90').variants[0].baseCount === 2);
  ok('ロデヴ baseCount -2：保存不可', bc(-2).length > 0);
  ok('ロデヴ baseCount 2.5：保存不可', bc(2.5).length > 0);
  ok('ロデヴ baseCount 0：保存不可', bc(0).length > 0);
  ok('ロデヴ baseCount 2：保存可', bc(2).length === 0);
  ok('ロデヴ baseCount 8：保存可', bc(8).length === 0);
  ok('flour モードで未設定（null）：保存可', bc(null).length === 0);
  ok('flour モードで未設定（項目なし）：保存可', (() => { const v = clone(R('rodev-90').variants[0]); delete v.baseCount; return C.validateVariant(v).length === 0; })());
  const cnt = R('curry-pan').variants[0];
  ok('カレーパンは count モード', cnt.scaleMode === 'count');
  ok('count モード baseCount null：保存不可', bc(null, 'curry-pan').length > 0);
  ok('count モード baseCount 2.5：保存不可', bc(2.5, 'curry-pan').length > 0);
  ok('count モード baseCount -8：保存不可', bc(-8, 'curry-pan').length > 0);
  ok('count モード baseCount 8：保存可', bc(8, 'curry-pan').length === 0);
  ok('標準レシピ6件はすべて保存可', seeds.every((r) => r.variants.every((v) => C.validateVariant(v).length === 0)),
    seeds.flatMap((r) => r.variants.map((v) => `${r.id}/${v.id}:${C.validateVariant(v).join('|')}`)).filter((x) => !x.endsWith(':')).join());
}

console.log('v1.1.5-3. 型の寸法は3辺それぞれ正の数');
{
  ok('12×12×12 → 1728', C.panVolume({ w: 12, d: 12, h: 12 }) === 1728);
  ok('-12×-12×12 → 無効', C.panVolume({ w: -12, d: -12, h: 12 }) === 0);
  ok('0×12×12 → 無効', C.panVolume({ w: 0, d: 12, h: 12 }) === 0);
  ok('NaN を含む → 無効', C.panVolume({ w: NaN, d: 12, h: 12 }) === 0);
  ok('Infinity を含む → 無効', C.panVolume({ w: Infinity, d: 12, h: 12 }) === 0);
  ok('寸法なし・型なし → 無効', C.panVolume({}) === 0 && C.panVolume(null) === 0 && C.panVolume(undefined) === 0);
  ok('数字の文字列は有効', C.panVolume({ w: '12', d: '12', h: '12' }) === 1728);
  const sb = R('shokupan-junnama').variants.find((v) => v.scaleMode === 'panVolume');
  ok('食パンに型基準の variant がある', !!sb);
  const base = C.scaleFor(sb, {});
  const bad = C.scaleFor(sb, { pan: { w: -12, d: -12, h: 12, custom: true } });
  ok('負の寸法2つの型は基準の型で計算（倍率1）', Math.abs(bad.factor - 1) < 1e-9 && bad.flour === base.flour, JSON.stringify(bad));
  ok('0 を含む型も基準の型で計算', Math.abs(C.scaleFor(sb, { pan: { w: 0, d: 12, h: 12 } }).factor - 1) < 1e-9);
  const good = C.scaleFor(sb, { pan: { ...sb.basePan, w: sb.basePan.w * 2 } });
  ok('正しい型は容積比で倍率', Math.abs(good.factor - 2) < 1e-9);
  const pv = (pan) => { const v = clone(sb); v.basePan = pan; return C.validateVariant(v); };
  ok('基準の型 -12×-12×12：保存不可', pv({ ...sb.basePan, w: -12, d: -12, h: 12 }).length > 0);
  ok('基準の型 0×12×12：保存不可', pv({ ...sb.basePan, w: 0, d: 12, h: 12 }).length > 0);
  ok('基準の型 正の寸法：保存可', pv({ ...sb.basePan }).length === 0);
}

console.log('v1.1.5-4. 工程が0件なら phaseComplete は false');
{
  const cp = R('cream-pan').variants[0];
  ok('クリームパン標準：phaseComplete true', C.phaseComplete(cp) === true);
  const e = clone(cp); e.steps = [];
  ok('steps=[] → false', C.phaseComplete(e) === false);
  const u = clone(cp); delete u.steps;
  ok('steps なし → false（落ちない）', C.phaseComplete(u) === false);
  const one = clone(cp); one.steps = [clone(cp.steps.find((s) => s.type !== 'branch'))];
  ok('phase 付き工程1個 → true', !!one.steps[0].phase && C.phaseComplete(one) === true);
  const miss = clone(cp); const t = miss.steps.find((s) => s.type !== 'branch'); delete t.phase;
  ok('1工程でも phase なし → false', C.phaseComplete(miss) === false);
  const onlyBranch = clone(R('rodev-90').variants[0]); onlyBranch.steps = [{ type: 'branch', id: 'b', options: [{ id: 'x', label: 'x', steps: [] }] }];
  ok('分岐だけで中身が空 → false', C.phaseComplete(onlyBranch) === false);
}

console.log('v1.1.5-5. 下準備の仕上がり目安は0より大きい');
{
  const cp = R('cream-pan').variants[0];
  const y = (x) => { const v = clone(cp); v.ingredientGroups.find((g) => g.id === 'custard').batch.yieldPerUnit = x; return C.validateVariant(v); };
  ok('yieldPerUnit -10：保存不可', y(-10).length > 0);
  ok('yieldPerUnit 0：保存不可', y(0).length > 0);
  ok('yieldPerUnit 145：保存可', y(145).length === 0);
  ok('yieldPerUnit 未入力（null）：保存可（仕上がり警告は別）', y(null).length === 0);
  const b = (k, x) => { const v = clone(cp); v.ingredientGroups.find((g) => g.id === 'custard').batch[k] = x; return C.validateVariant(v); };
  ok('unit 0 / -1 / 1.5：保存不可', [0, -1, 1.5].every((x) => b('unit', x).length > 0));
  ok('maxUnitsPerCook 0 / 2.5：保存不可', [0, 2.5].every((x) => b('maxUnitsPerCook', x).length > 0));
  ok('unit 4 / maxUnitsPerCook 2：保存可', b('unit', 4).length === 0 && b('maxUnitsPerCook', 2).length === 0);
}

console.log('v1.1.6-1. 材料名が空欄の行は保存しない');
{
  const an = R('anpan').variants[0];
  const blankName = (nm) => { const v = clone(an); v.ingredientGroups.find((g) => g.kind === 'flour').items.find((x) => x.id === 'kitano').name = nm; return C.validateVariant(v); };
  ok('あんぱんのキタノカオリの名前だけ空欄：保存不可', blankName('').length > 0, blankName('').join());
  ok('空白だけの名前：保存不可', blankName('　 ').length > 0);
  ok('名前 null：保存不可', blankName(null).length > 0);
  ok('エラー文は削除ボタンを案内', blankName('').some((m) => /空欄/.test(m) && /削除/.test(m)));
  ok('名前あり：保存可', blankName('キタノカオリ').length === 0);
  const f = clone(R('curry-pan').variants[0]); f.ingredientGroups.find((g) => g.id === 'finish').items.find((x) => x.id === 'panko').name = '';
  ok('適量（text）の材料（パン粉）も名前は必須', C.validateVariant(f).length > 0);
}

console.log('v1.1.6-2. 工程が0件なら保存しない');
{
  const cp = R('cream-pan').variants[0];
  const e = clone(cp); e.steps = [];
  ok('steps=[]：保存不可', C.validateVariant(e).some((m) => /工程を1つ以上/.test(m)));
  const u = clone(cp); delete u.steps;
  ok('steps なし：保存不可（落ちない）', C.validateVariant(u).some((m) => /工程を1つ以上/.test(m)));
  const rd = R('rodev-90').variants[0];
  const pb = C.planBranch(rd);
  const b = clone(rd); b.steps = [clone(pb)]; b.steps[0].options.forEach((o) => { o.steps = []; });
  ok('分岐だけで全 option の steps=[]：保存不可', C.validateVariant(b).some((m) => /工程を1つ以上/.test(m)));
  const b2 = clone(rd); b2.steps = [clone(pb)];
  ok('分岐の中に工程があれば数える：保存可', C.validateVariant(b2).length === 0, C.validateVariant(b2).join());
  const one = clone(cp); one.steps = [clone(cp.steps[0])];
  ok('1工程以上：保存可', C.validateVariant(one).length === 0, C.validateVariant(one).join());
  const fl = C.flattenSteps(b2.steps, { [pb.id]: pb.options[0].id }).list;
  ok('計画の分岐が先頭でも、作り始める工程は計画の中の最初の工程', fl.length > 0 && fl[0].step.type !== 'branch' && fl[0].step.id === pb.options[0].steps[0].id);
  ok('標準レシピは展開した先頭の工程 = steps[0]（開始位置は従来どおり）', seeds.every((r) => r.variants.every((v) => { const p = C.planBranch(v); return C.flattenSteps(v.steps, p ? { [p.id]: p.options[0].id } : {}).list[0].step === v.steps[0]; })));
}

console.log('v1.1.6-3. 冷蔵は最短・最長とも必須');
{
  const rd = R('rodev-90').variants[0];
  const cold = (minH, maxH) => { const v = clone(rd); C.findStep(v.steps, 'cd-cold').cold = { minH, maxH }; return C.validateVariant(v); };
  ok('ロデヴに冷蔵工程がある', !!C.findStep(rd.steps, 'cd-cold')?.cold);
  ok('minH=8 / maxH=null：保存不可', cold(8, null).length > 0);
  ok('minH=null / maxH=null：保存不可', cold(null, null).length > 0);
  ok('minH=null / maxH=15：保存不可', cold(null, 15).length > 0);
  ok('minH=0 / maxH=15：保存不可', cold(0, 15).length > 0);
  ok('minH=8 / maxH=15：保存可', cold(8, 15).length === 0);
  ok('minH=15 / maxH=8：保存不可', cold(15, 8).some((m) => /最長/.test(m)));
  ok('minH=8 / maxH=8：保存可', cold(8, 8).length === 0);
  const cp = R('cream-pan').variants[0];
  const tm = (t) => { const v = clone(cp); v.steps.find((x) => x.timer).timer = t; return C.validateVariant(v); };
  ok('timer は最長なしでも保存可（従来どおり）', tm({ min: 10 }).length === 0);
  ok('timer.min=0：保存不可', tm({ min: 0 }).length > 0);
  ok('timer.max=0：保存不可', tm({ min: 10, max: 0 }).length > 0);
  const fe = (f) => { const v = clone(cp); const s = v.steps.find((x) => x.ferment); Object.assign(s.ferment, f); return C.validateVariant(v); };
  ok('ferment.min=0：保存不可', fe({ min: 0 }).length > 0);
}

/* ───────────────────────── V1.5 ───────────────────────── */
const V15_META = (r) => { // v1.1.6 までの保存データを再現：V1.5 で足したメタデータを外す
  const x = clone(r);
  for (const v of x.variants) {
    delete v.mix;
    if (v.dough?.familyId !== 'basic-sweet-dough') delete v.dough;
    C.eachStep(v.steps, (st) => {
      if (['rodev-90', 'shokupan-junnama', 'curry-pan'].includes(r.id)) { delete st.phase; delete st.bake; if (st.ferment) { delete st.ferment.tempMin; delete st.ferment.tempMax; } }
      if (st.ferment) delete st.ferment.tempMode;
      if (st.bake) delete st.bake.method;
    });
  }
  return x;
};
const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
// loose：v1.1.0 で付与済みの甘い生地は tempMode・method を持たない（判定では range・oven として扱う）
const stepMeta = (v, loose = false) => { const out = []; C.eachStep(v.steps, (st) => { const b = st.bake ? { ...st.bake } : null; if (loose && b) delete b.method; out.push([st.id, st.phase ?? null, b, st.ferment ? [loose ? null : st.ferment.tempMode ?? null, st.ferment.tempMin ?? null, st.ferment.tempMax ?? null] : null]); }); return canon(out); };

console.log('v1.5-1. 標準レシピの構造化データ');
{
  ok('SEED_VERSION 7', SEED_VERSION === 7);
  ok('全 variant が phaseComplete', seeds.every((r) => r.variants.every((v) => C.phaseComplete(v))));
  const rd = R('rodev-90').variants[0];
  ok('ロデヴ：系統 lean-high-hydration', rd.dough?.familyId === 'lean-high-hydration');
  const amb = []; C.eachStep(rd.steps, (st) => { if (st.ferment) amb.push(st.ferment.tempMode); });
  ok('ロデヴ：室温発酵はすべて tempMode:ambient（数値にしない）', amb.length === 3 && amb.every((x) => x === 'ambient') && (() => { let n = 0; C.eachStep(rd.steps, (st) => { if (st.ferment && (st.ferment.tempMin != null || st.ferment.tempMax != null)) n++; }); return n === 0; })());
  const bk = []; C.eachStep(rd.steps, (st) => { if (st.phase === 'bake') bk.push(st.bake); });
  // v2.1.0：NE-BS655（250℃は約5分で自動的に210℃・スチームの代わりに霧吹き）
  ok('ロデヴ：焼成工程は計画ごとに2つ（250℃ 5分・霧吹き → 自動で210℃ 20〜23分）', bk.length === 4 && bk[0].temp === 250 && bk[0].steam === false && bk[0].mist === true && bk[0].min === 5 && bk[1].temp === 210 && bk[1].steam === false && bk[1].min === 20 && bk[1].max === 23);
  ok('ロデヴ：冷蔵発酵は phase:dough', C.findStep(rd.steps, 'cd-cold').phase === 'dough');
  const sh = R('shokupan-junnama').variants;
  ok('食パン A/B/C は同じ系統 rich-shokupan', sh.every((v) => v.dough?.familyId === 'rich-shokupan'));
  ok('食パン A だけ mix:false', sh[0].mix === false && sh[1].mix == null && sh[2].mix == null);
  const cu = R('curry-pan').variants[0];
  const fry = C.findStep(cu.steps, 'c7');
  ok('カレーパン：揚げは phase:bake ＋ method:fry', fry.phase === 'bake' && fry.bake.method === 'fry' && fry.bake.tempMin === 170 && fry.bake.tempMax === 175);
  ok('カレーパン：系統 curry-bread-dough', cu.dough?.familyId === 'curry-bread-dough');
  ok('新しい系統が DOUGH_FAMILIES にある', (() => { const f = DOUGH_FAMILIES; return f['lean-high-hydration'] && f['rich-shokupan'] && f['curry-bread-dough']; })());
  // v2.0.3 でカレーパンは内容の改訂（rev3）をしたので 3。V1.5 のメタデータ追加では上げていない
  // V1.5 のメタデータ追加では seedRev を上げていない。以降の内容改訂（v2.0.3 カレーパン、v2.1.0 NE-BS655 対応）で上がった値
  ok('seedRev は内容の改訂でだけ上がる', R('curry-pan').seedRev === 4 && R('rodev-90').seedRev === 4 && R('shokupan-junnama').seedRev === 5 && R('anpan').seedRev === 3 && R('cream-pan').seedRev === 2 && R('choco-pan').seedRev === 2);
}

console.log('v1.5-2. SEED_VERSION 6 → 7 の移行（メタデータだけ）');
{
  const olds = seeds.map(V15_META);
  for (const r of olds) { r.version = 3; r.changeLog = [{ version: 1, note: '初期登録' }]; }
  const before = olds.map((r) => ({ id: r.id, seedRev: r.seedRev, userEdited: r.userEdited, version: r.version, log: r.changeLog.length }));
  const changed = migrateRecipes(olds, 6);
  for (const r of olds) {
    const sr = R(r.id);
    const loose = !['rodev-90', 'shokupan-junnama', 'curry-pan'].includes(r.id);
    ok(`未編集 ${r.id}：工程メタデータが標準と一致`, r.variants.every((v, i) => stepMeta(v, loose) === stepMeta(sr.variants[i], loose)), r.variants.map((v) => stepMeta(v, loose)).join().slice(0, 200));
    ok(`未編集 ${r.id}：系統が付く`, r.variants.every((v, i) => v.dough?.familyId === sr.variants[i].dough?.familyId));
  }
  ok('食パン A に mix:false が付く', olds.find((r) => r.id === 'shokupan-junnama').variants[0].mix === false);
  ok('seedRev・userEdited・version・changeLog は変えない（標準版の更新通知を出さない）', olds.every((r, i) => r.seedRev === before[i].seedRev && r.userEdited === before[i].userEdited && r.version === before[i].version && r.changeLog.length === before[i].log));
  ok('変更したレシピだけ保存対象（ロデヴ・食パン・カレーパン）', ['rodev-90', 'shokupan-junnama', 'curry-pan'].every((id) => changed.some((x) => x.id === id)));
  ok('移行後のロデヴ・食パン・カレーパンも入力チェックを通る', olds.every((r) => r.variants.every((v) => C.validateVariant(v).length === 0)));

  // 編集済み：工程の条件を変えたロデヴ → 工程メタデータは付けない。配合が同じなら系統は付ける
  const e1 = V15_META(R('rodev-90')); e1.userEdited = true;
  C.findStep(e1.variants[0].steps, 'td-bake2').timer.max = 20;
  migrateRecipes([e1], 6);
  ok('編集済みロデヴ（焼成②を15〜20分）：phase は付けない', !C.phaseComplete(e1.variants[0]) && (() => { let n = 0; C.eachStep(e1.variants[0].steps, (st) => { if (st.phase || st.bake || st.ferment?.tempMode) n++; }); return n === 0; })());
  ok('   配合は同じなので系統は付く', e1.variants[0].dough?.familyId === 'lean-high-hydration');
  // 配合を変えたロデヴ → 系統も付けない。工程が同じなら phase は付く
  const e2 = V15_META(R('rodev-90')); e2.userEdited = true;
  e2.variants[0].ingredientGroups[1].items.find((x) => x.id === 'salt').pct.target = 2.4;
  migrateRecipes([e2], 6);
  ok('配合を変えたロデヴ：系統は付けない', !e2.variants[0].dough?.familyId);
  ok('   工程が標準と同じなら phase は付く', C.phaseComplete(e2.variants[0]));
  // 冷蔵の本文だけ違う → 付く（本文は焼成工程以外は比較しない）／焼成①の本文が違う → 付かない
  const e3 = V15_META(R('rodev-90')); C.findStep(e3.variants[0].steps, 'cd-cold').body = '一晩冷蔵';
  migrateRecipes([e3], 6);
  ok('焼成以外の本文だけ違う：付く', C.phaseComplete(e3.variants[0]));
  const e4 = V15_META(R('rodev-90')); C.findStep(e4.variants[0].steps, 'td-bake1').body = '260℃・スチームあり。';
  migrateRecipes([e4], 6);
  ok('焼成①の本文が違う：付かない', !C.phaseComplete(e4.variants[0]));
  // HB の使い方を変えた食パン A には mix:false を付けない
  const e5 = V15_META(R('shokupan-junnama')); e5.variants[0].hb.mode = 'knead_first_fermentation';
  migrateRecipes([e5], 6);
  ok('HBの使い方を変えた食パン A：mix:false を付けない', e5.variants[0].mix == null);
  // 甘い生地（v1.1.0 で付与済み）は何も変わらない
  const sw = V15_META(R('cream-pan')); const snap = canon(sw);
  const ch = migrateRecipes([sw], 6);
  ok('甘い生地（付与済み）は触らない', canon(sw) === snap && !ch.length);
  ok('   tempMode・method がない v1.1 データでも同時製作の判定は同じ', C.compatVariants(sw.variants[0], R('anpan').variants[0]).level === 'same');
  // 2回目は何もしない
  ok('移行は1回だけ効く（2回目は変更なし）', migrateRecipes(olds, 6).length === 0);
}

console.log('v1.5-3. 同時製作の判定：標準レシピ');
{
  const cv = (a, b) => C.compatVariants(a, b);
  for (let i = 0; i < sweet.length; i++) for (let j = 0; j < sweet.length; j++) if (i !== j) ok(`${sweet[i][0]} × ${sweet[j][0]}：同じ生地で同時に作れる`, cv(sweet[i][1], sweet[j][1]).level === 'same', JSON.stringify(cv(sweet[i][1], sweet[j][1]).reasons));
  const c = cv(sweet[2][1], sweet[0][1]);
  ok('理由：分割・一次発酵・二次発酵・焼成', ['shape', 'primary', 'proof', 'bake'].every((k) => c.reasons.some((x) => x.key === k && x.status === 'ok')), JSON.stringify(c.reasons));
  const hb = cv(sweet[2][1], sweet[1][1]);
  ok('HB一次発酵 × 手ごね28〜30℃：注記（判定は下げない）', hb.level === 'same' && hb.reasons.find((x) => x.key === 'primary').status === 'note');
  const sh = R('shokupan-junnama').variants;
  ok('食パン B × C：同じ生地で同時に作れる（型 12cm角）', cv(sh[1], sh[2]).level === 'same' && cv(sh[1], sh[2]).reasons.some((x) => x.key === 'shape' && /12×12×12/.test(x.text)));
  ok('食パン A × B：同じ系統・配合違い', cv(sh[0], sh[1]).level === 'family' && cv(sh[0], sh[1]).diff.length > 0);
  const a2 = clone(sh[0]);
  const na = cv(sh[0], a2);
  ok('食パン A × 同じ配合：同じ配合（同時製作判定なし）・理由は HB全自動', na.level === 'nojudge' && na.reasons.some((x) => x.key === 'mix' && /HB全自動/.test(x.text)) && !na.reasons.some((x) => /データ不足/.test(x.text)));
  const m2 = clone(sweet[2][1]); m2.mix = false; m2.hb = { mode: 'none' };
  ok('mix:false（HB全自動以外）の理由は「対象外に設定」', cv(sweet[0][1], m2).reasons.some((x) => x.key === 'mix' && /対象外に設定/.test(x.text)));
  ok('ロデヴ・カレーパン × 甘い生地：関係なし（別系統・別配合）', cv(R('rodev-90').variants[0], sweet[0][1]).level === null && cv(R('curry-pan').variants[0], sweet[0][1]).level === null);
  const rd = R('rodev-90').variants[0];
  const rr = cv(rd, clone(rd));
  ok('ロデヴ × 同じロデヴ：同じ生地で同時に作れる（計画ごと：当日×当日・冷蔵×冷蔵）', rr.level === 'same' && rr.plans.length === 2 && rr.plans.every((p) => p.a === p.b && p.level === 'same'), JSON.stringify(rr.plans.map((p) => [p.a, p.b, p.level])));
  ok('   室温同士の発酵は一致', rr.reasons.find((x) => x.key === 'proof').status === 'ok' && /室温/.test(rr.reasons.find((x) => x.key === 'proof').text));
}

console.log('v1.5-4. 発酵温度（ambient と数値範囲）');
{
  const T = (f) => C.fermentTemp(f);
  ok('28〜30 × 30〜32：端点一致で互換', C.compareTemp(T({ tempMin: 28, tempMax: 30 }), T({ tempMin: 30, tempMax: 32 })) === 'ok');
  ok('28〜30 × 31〜33：重ならない', C.compareTemp(T({ tempMin: 28, tempMax: 30 }), T({ tempMin: 31, tempMax: 33 })) === 'ng');
  ok('ambient × ambient：互換', C.compareTemp(T({ temp: '室温', tempMode: 'ambient' }), T({ tempMode: 'ambient' })) === 'ok');
  ok('ambient × 数値：判定不能（不一致ではない）', C.compareTemp(T({ tempMode: 'ambient' }), T({ tempMin: 20, tempMax: 25 })) === 'unknown');
  ok('表示文字列「室温」だけでは ambient にしない', T({ temp: '室温' }).mode === 'unknown');
  ok('不足値：判定不能', C.compareTemp(T({ temp: '32〜35℃' }), T({ tempMin: 32, tempMax: 35 })) === 'unknown' && C.compareTemp(T(null), T({ tempMode: 'ambient' })) === 'unknown');
  ok('tempMode 未指定でも数値があれば range（v1.1 データ）', T({ tempMin: 32, tempMax: 35 }).mode === 'range');
  const rd = R('rodev-90').variants[0];
  const x = clone(rd); for (const id of ['td-ferm2', 'cd-ferm2']) { const f = C.findStep(x.steps, id).ferment; f.tempMode = 'range'; f.tempMin = 24; f.tempMax = 27; }
  const c = C.compatVariants(rd, x);
  ok('最終発酵 室温 × 24〜27℃：同じ配合（同時製作判定なし）', c.level === 'nojudge' && c.reasons.find((y) => y.key === 'proof').status === 'unknown', JSON.stringify(c.reasons));
  const y = clone(sweet[2][1]); Object.assign(y.steps.find((s) => s.phase === 'proof').ferment, { tempMin: 36, tempMax: 38 });
  const d = C.compatVariants(sweet[0][1], y);
  ok('二次発酵 32〜35 × 36〜38：生地は一緒に仕込める（途中から別工程）・理由「二次発酵が違う」', d.level === 'split' && d.label === '生地は一緒に仕込める（途中から別工程）' && d.reasons.some((r) => r.key === 'proof' && r.status === 'ng' && /二次発酵が違う/.test(r.text)));
  const z = clone(sweet[1][1]); Object.assign(z.steps.find((s) => s.id === 'h7').ferment, { tempMin: 37, tempMax: 39 });
  const zz = clone(sweet[1][1]);
  ok('一次発酵 35 × 37〜39：一次発酵が違う', C.compatVariants(zz, z).reasons.some((r) => r.key === 'primary' && r.status === 'ng'));
  ok('計画の並び順が違っても同じ id どうしで比べる', (() => { const b = clone(rd); C.planBranch(b).options.reverse(); const c2 = C.compatVariants(rd, b); return c2.plans.length === 2 && c2.plans.every((p) => p.a === p.b && p.level === 'same'); })());
  const ren = clone(rd); for (const o of C.planBranch(ren).options) o.id = o.id + '2';
  const cr = C.compatVariants(rd, ren);
  const tc = cr.plans.find((p) => p.a === 'today' && p.b === 'cold2');
  ok('共通の計画 id がなければ全組み合わせ（4通り）・最良を全体の判定に', cr.plans.length === 4 && cr.level === 'same');
  ok('当日（室温の一次発酵）× 冷蔵発酵：一次発酵が違う', tc && tc.level === 'split' && tc.reasons.some((r) => r.key === 'primary' && r.status === 'ng'), JSON.stringify(tc?.reasons));
}

console.log('v1.5-5. 焼成（温度は完全一致・多段焼成）');
{
  const base = sweet[0][1];
  const edit = (f) => { const v = clone(sweet[2][1]); f(v.steps.find((s) => s.phase === 'bake').bake, v); return C.compatVariants(base, v); };
  const t190 = edit((b) => { b.temp = 190; });
  ok('180℃ × 190℃：別条件（±10℃は一致にしない）', t190.level === 'split' && t190.reasons.some((r) => r.key === 'bake' && r.status === 'ng' && /180℃.*190℃/.test(r.text)), JSON.stringify(t190.reasons));
  ok('予熱 190 × 200：別条件', edit((b) => { b.preheat = 200; }).level === 'split');
  ok('スチームあり × なし：別条件', edit((b) => { b.steam = true; }).level === 'split');
  const t2 = edit((b) => { b.min = 15; b.max = 18; });
  ok('単段 12〜15分 × 15〜18分：判定は下げず、時間差を注記', t2.level === 'same' && t2.reasons.some((r) => r.key === 'bakeTime' && r.status === 'note' && /12〜15分／15〜18分/.test(r.text)), JSON.stringify(t2.reasons));
  ok('method 未指定は oven として扱う', edit((b) => { delete b.method; }).level === 'same');
  ok('oven × fry：加熱方法が違う', edit((b) => { b.method = 'fry'; b.tempMin = 180; b.tempMax = 180; }).level === 'split');
  ok('焼成条件が欠けている（bake なし）：判定不能', edit((b, v) => { delete v.steps.find((s) => s.phase === 'bake').bake; }).level === 'nojudge');
  const rd = R('rodev-90').variants[0];
  const r2 = (f) => { const v = clone(rd); for (const p of ['td', 'cd']) f(C.findStep(v.steps, `${p}-bake1`).bake, C.findStep(v.steps, `${p}-bake2`).bake, v, p); return C.compatVariants(rd, v); };
  const s1 = r2((b1) => { b1.min = 15; b1.max = 15; });
  ok('多段：第1段 10分 × 15分：別条件（温度切替の時刻が違う）', s1.level === 'split' && s1.reasons.some((r) => r.key === 'bake' && r.status === 'ng'), JSON.stringify(s1.reasons));
  const s2 = r2((b1, b2) => { b2.min = 15; b2.max = 20; });
  ok('多段：最終段 15〜18 × 15〜20分：互換＋注記', s2.level === 'same' && s2.reasons.some((r) => r.key === 'bakeTime'), JSON.stringify(s2.reasons));
  const s3 = r2((b1, b2) => { b2.temp = 240; });
  ok('多段：第2段 230 × 240℃：別条件', s3.level === 'split');
  const s4 = r2((b1, b2, v, p) => { const i = (arr) => { const k = arr.findIndex((x) => x.id === `${p}-bake2`); if (k >= 0) arr.splice(k, 1); arr.forEach((x) => x.options && x.options.forEach((o) => i(o.steps))); }; i(v.steps); });
  ok('多段：焼成工程の数が違う（2段 × 1段）：同一焼成にしない', s4.level === 'split' && s4.reasons.some((r) => r.key === 'bake' && r.status === 'ng'));
  const cu = R('curry-pan').variants[0];
  const f1 = clone(cu); C.findStep(f1.steps, 'c7').bake = { method: 'oven', temp: 200, preheat: 210, min: 15, max: 18, steam: false };
  const fr = C.compatVariants(cu, f1);
  ok('同じカレーパン生地で 揚げ × 焼き：配合は同じ・加熱方法が違う', fr.level === 'split' && fr.reasons.some((r) => r.key === 'bake' && r.status === 'ng' && /揚げ/.test(r.text)), JSON.stringify(fr.reasons));
  const f2 = clone(cu); C.findStep(f2.steps, 'c7').bake.tempMax = 180;
  ok('揚げ温度 170〜175 × 170〜180：別条件', C.compatVariants(cu, f2).level === 'split');
  ok('カレーパン同士：同じ生地で同時に作れる（一次発酵なし同士）', C.compatVariants(cu, clone(cu)).level === 'same');
}

console.log('v1.5-6. 分割重量・型');
{
  const a = sweet[0][1];
  const b = clone(sweet[2][1]); b.baseCount = 10;
  const c = C.compatVariants(a, b);
  ok('分割 48.7g × 10個分割：分割が違う', c.level === 'split' && c.reasons.some((r) => r.key === 'shape' && r.status === 'ng'));
  const b1 = clone(sweet[2][1]); b1.baseFlour = 200.5;   // 1個あたり +0.12g 程度
  ok('分割重量 ±1g 以内は同じ', C.compatVariants(a, b1).reasons.find((r) => r.key === 'shape').status === 'ok');
  const B = R('shokupan-junnama').variants[1];
  const sw = clone(B); sw.basePan = { ...B.basePan, w: 20, d: 12 };
  const sw2 = clone(B); sw2.basePan = { ...B.basePan, w: 12, d: 20 };
  sw.baseFlour = sw2.baseFlour = 250 * 20 / 12;
  ok('型 12×20 と 20×12 は同じ型', C.panKey(sw.basePan) === C.panKey(sw2.basePan) && C.compatVariants(sw, sw2).reasons.find((r) => r.key === 'shape').status === 'ok');
  const tall = clone(B); tall.basePan = { ...B.basePan, h: 14 };
  ok('型 12×12×12 × 12×12×14：型が違う', C.compatVariants(B, tall).reasons.find((r) => r.key === 'shape').status === 'ng');
  const more = clone(B); more.baseFlour = 260;
  ok('同じ型で容積あたりの粉量が違う：違う', C.compatVariants(B, more).reasons.find((r) => r.key === 'shape').status === 'ng');
  const fp = clone(B); fp.baseFlour = 250 + 1e-10;
  ok('浮動小数の誤差は同じ扱い', C.compatVariants(B, fp).reasons.find((r) => r.key === 'shape').status === 'ok');
  const piece = clone(B); piece.scaleMode = 'flour'; piece.baseCount = 2;
  ok('型焼き × 分割：成形が違う', C.compatVariants(B, piece).reasons.find((r) => r.key === 'shape').status === 'ng');
  const nocount = clone(R('rodev-90').variants[0]); delete nocount.baseCount;
  ok('分割数なし：判定不能（違うとは言わない）', C.compatVariants(R('rodev-90').variants[0], nocount).level === 'nojudge');
}

console.log('v1.5-7. 判定の優先順位・variant 単位');
{
  const a = sweet[0][1];
  const x = clone(sweet[2][1]);
  x.steps.find((s) => s.phase === 'bake').bake.temp = 200;         // 条件違い
  delete x.steps.find((s) => s.phase === 'shape').phase;           // かつデータ不足
  const c = C.compatVariants(a, x);
  ok('データ不足と条件違いが両方 → データ不足を優先（同時製作判定なし）', c.level === 'nojudge' && c.reasons.some((r) => /工程データ不足/.test(r.text)));
  const m = clone(sweet[2][1]); m.mix = false; delete m.steps[0].phase;
  ok('mix:false とデータ不足 → mix:false を優先', C.compatVariants(a, m).reasons[0].key === 'mix');
  // 編集で二次発酵を変えた → stripStaleMixMeta で外れる → 判定なし（「違う」とは言わない）
  const before = clone(sweet[2][1]); const after = clone(before);
  after.steps.find((s) => s.id === 'cp-ferm2').ferment.temp = '30〜32℃';
  C.stripStaleMixMeta(before, after);
  ok('編集で工程条件を変えた variant：tempMode も外れる', after.steps.every((s) => !s.ferment || s.ferment.tempMode == null));
  ok('   → 同じ配合（同時製作判定なし）', C.compatVariants(a, after).level === 'nojudge');
  // variant 単位：あんぱん A は互換、B は条件違い → 情報を失わない
  const an = clone(R('anpan'));
  Object.assign(an.variants[1].steps.find((s) => s.phase === 'proof').ferment, { tempMin: 38, tempMax: 40 });
  const cp = R('cream-pan').variants[0];
  const res = an.variants.map((v) => C.compatVariants(cp, v).level);
  ok('あんぱん A は same、B は split（variant ごとに保持）', res[0] === 'same' && res[1] === 'split', res.join());
  ok('配合違い・同じ系統：family（差分つき）', (() => { const s2 = clone(cp); s2.ingredientGroups[1].items[0].name = '豆乳'; delete s2.ingredientGroups[1].items[0].ingKey; const r = C.compatVariants(a, s2); return r.level === 'family' && r.diff.some((d) => /豆乳/.test(d)); })());
  ok('配合違い・系統なし：関係なし', (() => { const s2 = clone(cp); s2.ingredientGroups[1].items[0].pct.target = 70; delete s2.dough; return C.compatVariants(a, s2).level === null; })());
  ok('ラベル4種', C.COMPAT_LEVELS.same === '同じ生地で同時に作れる' && C.COMPAT_LEVELS.split === '生地は一緒に仕込める（途中から別工程）' && C.COMPAT_LEVELS.nojudge === '同じ配合（同時製作判定なし）' && C.COMPAT_LEVELS.family === '同じ系統・配合違い');
}

/* ───────────────────────── V2.0 まとめて作る ───────────────────────── */
const M = (id, vid, count, v = null) => { const r = R(id); return { recipe: { id: r.id, name: r.name, category: r.category, version: r.version }, v: v || (vid ? r.variants.find((x) => x.id === vid) : r.variants[0]), count }; };

console.log('v2-1. planBatch：基本（あんぱんB・クリーム・チョコ 各4個）');
{
  const p = C.planBatch([M('anpan', 'hand', 4), M('cream-pan', null, 4), M('choco-pan', null, 4)], { leadIndex: 0 });
  ok('開始できる', p.ok, p.errors.join());
  ok('合計12個・粉300g・1個 約48.7g', p.total === 12 && Math.abs(p.totalFlour - 300) < 1e-9 && Math.abs(p.pieceWeight - 48.675) < 0.01, [p.total, p.totalFlour, p.pieceWeight].join());
  ok('allocation：各4個・生地量＝1個の生地量×個数・合計＝生地総量', p.allocation.every((a) => a.count === 4 && Math.abs(a.doughG - p.pieceWeight * 4) < 1e-9) && Math.abs(p.allocation.reduce((s2, a) => s2 + a.doughG, 0) - p.totalDough) < 1e-6);
  const ph = p.steps.map((s2) => C.PHASE_ORDER.indexOf(s2.phase));
  ok('工程は区分の順（prep→dough→divide→shape→proof→top→bake→after）', ph.every((x, i) => i === 0 || x >= ph[i - 1]));
  const by = (phase) => p.steps.filter((s2) => s2.phase === phase);
  ok('prep はパン別（3つのパンの下準備）', by('prep').every((s2) => s2.member) && new Set(by('prep').map((s2) => s2.member.index)).size === 3);
  ok('dough は生地の作り方（あんぱんB・手ごね）の工程だけ・共通', by('dough').every((s2) => !s2.member && s2.id.startsWith('L:h')) && by('dough').length === 7);
  ok('divide は共通1つ・内訳つき', by('divide').length === 1 && by('divide')[0].allocation.length === 3 && /12分割/.test(by('divide')[0].body));
  ok('shape・top・after はパン別', ['shape', 'top', 'after'].every((k) => by(k).length === 3 && by(k).every((s2) => s2.member)));
  ok('proof・bake は共通1つ', by('proof').length === 1 && !by('proof')[0].member && by('bake').length === 1 && !by('bake')[0].member);
  ok('二次発酵：共通範囲 35℃ 30〜45分（ビストロの発酵）・目安（cue）を残す', (() => { const f = by('proof')[0].ferment; return f.tempMin === 35 && f.tempMax === 35 && f.min === 30 && f.max === 45 && /ひと回り弱/.test(f.cue); })());
  ok('焼き時間が同じなら bakeOut なし', !by('bake')[0].bakeOut && p.bakeOut === null);
  ok('カスタード冷却は parallel のまま', p.steps.find((s2) => s2.id === 'm1:cp1')?.parallel === true);
  ok('本文のテンプレートは開始時に埋める（{{ }} が残らない）', p.steps.every((s2) => !/\{\{/.test(s2.body || '')), p.steps.filter((s2) => /\{\{/.test(s2.body || '')).map((s2) => s2.id).join());
  ok('パン別の工程はそのパンの個数で（あんこ4等分・カスタード4個分）', /あんこを4等分/.test(p.steps.find((s2) => s2.id === 'm0:h0').body) && /4個分炊く/.test(p.steps.find((s2) => s2.id === 'm1:cp0').body));
  ok('使う材料（uses）はすべて分量に対応', p.steps.every((s2) => (s2.uses || []).every((u) => p.amounts.rows[typeof u === 'string' ? u : u.ref])));
  ok('生地の材料は合計12個分（牛乳 180g）', p.amounts.rows['L:milk'].g === 180);
  ok('クリームパンの下準備：カスタード4個分×1回', p.memberAmounts[1].groups.find((g) => g.id === 'custard').prep.units === 1);
  ok('子Bake 用の分量はそれぞれの個数（チョコ 4個）', p.memberAmounts[2].count === 4 && p.memberScales[2].count === 4);
  ok('クリームパンの焼成の注意を名前つきで共通工程へ', (by('bake')[0].tips || []).some((t) => /^基本のクリームパン：12分/.test(t)));
}

console.log('v2-2. planBatch：開始できない条件');
{
  const E = (members, o = {}) => C.planBatch(members, o).errors.join(' / ');
  ok('1つだけ：不可', /2つ以上/.test(E([M('cream-pan', null, 4)])));
  ok('同じレシピの A と B：不可', /同じレシピは1つだけ/.test(E([M('anpan', 'hb', 4), M('anpan', 'hand', 4)])));
  ok('個数 0・2.5：不可', /個数は1以上の整数/.test(E([M('anpan', 'hb', 0), M('cream-pan', null, 4)])) && /個数は1以上の整数/.test(E([M('anpan', 'hb', 2.5), M('cream-pan', null, 4)])));
  const hb13 = C.planBatch([M('cream-pan', null, 5), M('choco-pan', null, 4), M('anpan', 'hb', 4)], { leadIndex: 0 });
  ok('HB（パン生地 320g）で13個＝粉325g：不可・文言', !hb13.ok && hb13.errors.includes('選択したHBコースの粉量上限320gを超えています（325g）。個数を減らすか、手ごねを選んでください。'), hb13.errors.join());
  ok('12個＝粉300g：可', C.planBatch([M('cream-pan', null, 4), M('choco-pan', null, 4), M('anpan', 'hb', 4)]).ok);
  ok('同じ13個でも手ごね（あんぱんB）を生地の作り方にすれば可', C.planBatch([M('cream-pan', null, 5), M('choco-pan', null, 4), M('anpan', 'hand', 4)], { leadIndex: 2 }).ok);
  const hot = clone(R('choco-pan').variants[0]); hot.steps.find((s2) => s2.phase === 'bake').bake.temp = 190;
  ok('「同じ生地で同時に作れる」でない組（焼成 190℃）：不可・理由つき', /同じ生地で同時に作れません.*焼成条件が違う/.test(E([M('cream-pan', null, 4), M('choco-pan', null, 4, hot)])));
  const late = clone(R('choco-pan').variants[0]); Object.assign(late.steps.find((s2) => s2.phase === 'proof').ferment, { min: 70, max: 90 });
  ok('二次発酵の時間が重ならない（30〜45 × 70〜90）：不可', /二次発酵の時間が重なりません/.test(E([M('cream-pan', null, 4), M('choco-pan', null, 4, late)])));
  const mid = clone(R('choco-pan').variants[0]); Object.assign(mid.steps.find((s2) => s2.phase === 'proof').ferment, { min: 35, max: 50 });
  const pm = C.planBatch([M('cream-pan', null, 4), M('choco-pan', null, 4, mid), M('anpan', 'hb', 4)]);
  ok('30〜45 × 35〜50：共通範囲 35〜45分', pm.ok && pm.commonProof[0].min === 35 && pm.commonProof[0].max === 45, JSON.stringify(pm.commonProof));
  ok('型焼き（食パン B・C）：不可', /型焼き/.test(E([M('shokupan-junnama', 'hb-pan12', 1), M('cream-pan', null, 4)])));
  const nomix = clone(R('choco-pan').variants[0]); nomix.mix = false;
  ok('mix:false の variant：不可', !C.planBatch([M('cream-pan', null, 4), M('choco-pan', null, 4, nomix)]).ok);
  const bad = clone(R('choco-pan').variants[0]); bad.steps = [];
  ok('入力チェックに通らない variant：不可', /工程を1つ以上/.test(E([M('cream-pan', null, 4), M('choco-pan', null, 4, bad)])));
}

console.log('v2-3. 焼き時間が違う・発酵計画');
{
  const t = clone(R('choco-pan').variants[0]); const bs = t.steps.find((s2) => s2.phase === 'bake'); bs.bake.min = 13; bs.bake.max = 16;
  const p = C.planBatch([M('cream-pan', null, 4), M('choco-pan', null, 4, t)]);
  const bake = p.steps.find((s2) => s2.phase === 'bake');
  ok('最終段の焼き時間が違う：判定は下げず、パンごとの取り出し（12〜15／13〜16分）', p.ok && bake.bakeOut?.length === 2 && bake.bakeOut[0].min === 12 && bake.bakeOut[1].min === 13 && bake.bakeOut[1].max === 16, JSON.stringify(bake.bakeOut));
  // 発酵計画：選んだ計画どうしで判定する（variant 全体の最良ではない）
  const rd = R('rodev-90').variants[0];
  const rd2 = clone(rd); C.findStep(rd2.steps, 'cd-bake2').bake.temp = 240;   // 冷蔵ルートだけ焼成が違う
  const mem = [M('rodev-90', null, 2), { recipe: { id: 'rodev-copy', name: '私のロデヴ', category: '高加水', version: 1 }, v: rd2, count: 2 }];
  ok('全体の判定は same（当日×当日が一致）', C.compatVariants(rd, rd2).level === 'same');
  ok('当日焼きを選んだ Batch：可', C.planBatch(mem, { planId: 'today' }).ok);
  ok('冷蔵発酵を選んだ Batch：不可（選んだ計画の条件で判定）', /焼成条件が違う/.test(C.planBatch(mem, { planId: 'cold' }).errors.join()));
  ok('計画を選んでいない：不可', /発酵計画を選んで/.test(C.planBatch(mem, { planId: null }).errors.join()));
  const pt = C.planBatch(mem, { planId: 'today' });
  ok('当日焼き：イーストは当日の量・工程に冷蔵なし・2段焼成は共通', pt.amounts.rows['L:yeast'].g != null && !pt.steps.some((s2) => s2.cold) && pt.steps.filter((s2) => s2.phase === 'bake').length === 2, pt.steps.map((s2) => s2.id).join());
  ok('ロデヴ（粉基準・分割数あり）も個数で分けられる：4個＝粉500g', Math.abs(pt.totalFlour - 500) < 1e-9);
}

console.log('v2.0.1-1. まとめて作るときの分割重量は 0.1g 単位で一致');
{
  const withPiece = (w) => { const v = clone(R('cream-pan').variants[0]); v.baseFlour = 200 * w / 48.675; return v; };
  const an = M('anpan', 'hand', 4);
  ok('48.675g × 48.675g：可', C.planBatch([an, M('cream-pan', null, 4)]).ok);
  const v2 = withPiece(48.70);
  ok('48.675g × 48.70g（同じ 0.1g）：可', Math.abs(C.pieceWeight(v2) - 48.70) < 1e-9 && C.planBatch([an, M('cream-pan', null, 4, v2)]).ok);
  const v3 = withPiece(49.575);
  ok('48.675g × 49.575g：V1.5 の判定は same のまま', Math.abs(C.pieceWeight(v3) - 49.575) < 1e-9 && C.compatVariants(an.v, v3).level === 'same' && C.compatForPlan(an.v, v3).level === 'same');
  const p3 = C.planBatch([an, M('cream-pan', null, 4, v3)]);
  ok('48.675g × 49.575g：まとめて作るのは不可・文言', !p3.ok && p3.errors.some((e) => e === '分割重量が異なります（基本のあんぱん 48.7g／基本のクリームパン 49.6g）。V2.0では同じ分割重量のパンだけまとめて作れます。'), p3.errors.join());
  ok('不可のときは allocation・子Bake 用の分量を作らない（矛盾する値が出ない）', p3.allocation === undefined && p3.memberAmounts === undefined && p3.steps === undefined);
  const v4 = withPiece(48.64);
  ok('48.675g × 48.64g（0.1g 単位で 48.7 と 48.6）：不可', !C.planBatch([an, M('cream-pan', null, 4, v4)]).ok);
  ok('batchPieceKey：48.675 → 487・48.70 → 487', C.batchPieceKey(an.v) === 487 && C.batchPieceKey(v2) === 487);
}

console.log('v2.0.1-2. 知らない工程区分があれば止める（黙って捨てない）');
{
  const add = (pos) => { const v = clone(R('choco-pan').variants[0]); const st = { id: 'x', title: '重要な工程', phase: 'foo', body: '' }; if (pos === 'first') v.steps.unshift(st); else if (pos === 'last') v.steps.push(st); else v.steps.splice(5, 0, st); return v; };
  for (const [pos, label] of [['first', '先頭'], ['mid', '途中'], ['last', '最後']]) {
    const v = add(pos);
    const pp = C.planBatch([M('cream-pan', null, 4), M('choco-pan', null, 4, v)]);
    ok(`${label}に phase:'foo'：不可（「重要な工程」を名指し）`, C.phaseComplete(v) && C.compatVariants(R('cream-pan').variants[0], v).level === 'same' && !pp.ok && pp.errors.some((e) => /扱えない工程区分/.test(e) && /重要な工程/.test(e)), pp.errors.join());
  }
  const all8 = C.planBatch([M('cream-pan', null, 4), M('choco-pan', null, 4), M('anpan', 'hb', 4)]);
  ok('既存の8区分だけなら従来どおり可・工程は1つも落ちない', all8.ok && all8.steps.length === [M('cream-pan', null, 4), M('choco-pan', null, 4), M('anpan', 'hb', 4)].reduce((n, m) => n + m.v.steps.length, 0) - 2 * (3 + 1 + 1 + 1) , `${all8.steps.length}`);
}

console.log('v2.0.2-1. 二次発酵：全員が時間範囲を持つときだけまとめて作れる');
{
  const noTime = () => { const v = clone(R('cream-pan').variants[0]); const f = v.steps.find((s2) => s2.phase === 'proof').ferment; delete f.min; delete f.max; return v; };
  const t45 = clone(R('choco-pan').variants[0]); Object.assign(t45.steps.find((s2) => s2.phase === 'proof').ferment, { min: 35, max: 50 });
  const p1 = C.planBatch([M('anpan', 'hb', 4), M('choco-pan', null, 4, t45)]);
  ok('30〜45 × 35〜50：可・共通 35〜45分', p1.ok && p1.commonProof[0].min === 35 && p1.commonProof[0].max === 45 && p1.steps.find((s2) => s2.phase === 'proof').ferment.min === 35);
  const nt = noTime();
  ok('時間なしの二次発酵も、通常の入力チェックでは許可のまま', C.validateVariant(nt).length === 0);
  ok('   V1.5 の判定も same のまま（温度で判定）', C.compatVariants(R('anpan').variants[0], nt).level === 'same');
  const p2 = C.planBatch([M('anpan', 'hb', 4), M('cream-pan', null, 4, nt)]);
  ok('40〜60 × 時間なし：不可（ほかのパンの時間で補わない）・文言', !p2.ok && p2.errors.includes('「基本のクリームパン」の二次発酵に時間範囲が設定されていないため、まとめて作れません'), p2.errors.join());
  const nt2 = clone(R('choco-pan').variants[0]); const f2 = nt2.steps.find((s2) => s2.phase === 'proof').ferment; delete f2.min; delete f2.max;
  ok('時間なし × 時間なし：不可', !C.planBatch([M('cream-pan', null, 4, nt), M('choco-pan', null, 4, nt2)]).ok);
  const onlyMin = clone(R('choco-pan').variants[0]); delete onlyMin.steps.find((s2) => s2.phase === 'proof').ferment.max;
  ok('最短だけ（最長なし）：不可', !C.planBatch([M('anpan', 'hb', 4), M('choco-pan', null, 4, onlyMin)]).ok);
}

console.log('v2.0.2-2. 多段焼成：途中の段は全員の時間範囲の重なりを使う');
{
  const rd = R('rodev-90').variants[0];
  const withStages = (s1, s2x) => {
    const v = clone(rd);
    for (const p of ['td', 'cd']) {
      const a = C.findStep(v.steps, `${p}-bake1`), b = C.findStep(v.steps, `${p}-bake2`);
      if (s1) { a.bake.min = s1[0]; a.bake.max = s1[1]; a.timer = { ...a.timer, min: s1[0], ...(s1[1] > s1[0] ? { max: s1[1] } : {}) }; if (s1[1] === s1[0]) delete a.timer.max; }
      if (s2x) { b.bake.min = s2x[0]; b.bake.max = s2x[1]; b.timer = { ...b.timer, min: s2x[0], max: s2x[1] }; }
    }
    return v;
  };
  const mem = (a, b) => [{ recipe: { id: 'rA', name: 'ロデヴA', category: '高加水', version: 1 }, v: a, count: 2 }, { recipe: { id: 'rB', name: 'ロデヴB', category: '高加水', version: 1 }, v: b, count: 2 }];
  const A = withStages([10, 12]), B = withStages([11, 13]);
  ok('第1段 10〜12 × 11〜13：V1.5 は same', C.compatForPlan(A, B, 'today', 'today').level === 'same');
  const p = C.planBatch(mem(A, B), { planId: 'today' });
  const s1 = p.steps.find((x) => x.id === 'L:td-bake1');
  ok('まとめて作れる・生成された第1段は 11〜12分（timer と bake の両方）', p.ok && s1.timer.min === 11 && s1.timer.max === 12 && s1.bake.min === 11 && s1.bake.max === 12, JSON.stringify([s1?.timer, s1?.bake]));
  ok('   lead の時間と違うので、共通の時間を注記', (s1.tips || []).some((t) => /まとめて作るときの時間：11〜12分/.test(t)));
  const p2 = C.planBatch(mem(withStages([10, 11]), withStages([12, 13])), { planId: 'today' });
  ok('第1段 10〜11 × 12〜13：不可', !p2.ok, p2.errors.join());
  const p3 = C.planBatch(mem(clone(rd), clone(rd)), { planId: 'today' });
  const s3 = p3.steps.find((x) => x.id === 'L:td-bake1');
  ok('第1段 5 × 5：そのまま 5分（注記なし）', p3.ok && s3.timer.min === 5 && s3.timer.max == null && s3.bake.min === 5 && !(s3.tips || []).some((t) => /まとめて作るときの時間/.test(t)), JSON.stringify(s3?.timer));
  const p4 = C.planBatch(mem(withStages(null, [15, 18]), withStages(null, [16, 20])), { planId: 'today' });
  const last = p4.steps.find((x) => x.id === 'L:td-bake2');
  ok('最終段 15〜18 × 16〜20：可・パン別の取り出しタイマーのまま', p4.ok && last.bakeOut?.length === 2 && last.bakeOut[0].min === 15 && last.bakeOut[1].max === 20, JSON.stringify(last?.bakeOut));
  ok('   最終段の時間は共通範囲に書き換えない', last.bake.min === 15 && last.bake.max === 18);
}

console.log('v2.0.2-3. 途中の子Bake の修復（進行中の Batch が実際に持っているか）');
{
  const kid = (id, batchId) => ({ id, batchId, status: 'inBatch', updatedAt: 5 });
  const batches = [
    { id: 'bA', status: 'active', childBakeIds: ['k1'] },
    { id: 'bD', status: 'done', finishedAt: 9, childBakeIds: ['k3'] },
  ];
  const fixes = C.batchChildRepairs([kid('k1', 'bA'), kid('k2', 'bA'), kid('k3', 'bD'), kid('k4', 'none'), { id: 'k5', status: 'done' }], batches, 100);
  const f = Object.fromEntries(fixes.map((x) => [x.id, x]));
  ok('進行中の Batch が childBakeIds に持つ子：inBatch のまま', !f.k1);
  ok('進行中の Batch を指すが childBakeIds に無い子：途中終了へ', f.k2?.status === 'aborted');
  ok('完了した Batch の子：done へ（finishedAt は Batch のもの）', f.k3?.status === 'done' && f.k3.finishedAt === 9);
  ok('親の無い子：途中終了へ', f.k4?.status === 'aborted' && f.k4.finishedAt === 5);
  ok('inBatch 以外は触らない', !f.k5 && fixes.length === 3);
}

console.log('v2.0.3. カレーパン rev3（A：ベーキングパウダー／B：イースト）');
{
  const r = R('curry-pan');
  const [A, B] = r.variants;
  ok('seedRev 4・2通り（A は従来の id std のまま、B は yeast）', r.seedRev === 4 && r.variants.length === 2 && A.id === 'std' && B.id === 'yeast');
  ok('両方とも入力チェックを通り、工程データがそろう', [A, B].every((v) => C.validateVariant(v).length === 0 && C.phaseComplete(v)));
  const aa = C.computeAmounts(A, C.scaleFor(A, {}));
  ok('A の配合は従来どおり（粉150g・生地 約268g・1本 約44.7g）', Math.abs(aa.dough - 268) < 1e-9 && Math.abs(aa.piece - 44.667) < 0.01);
  ok('A の配合の指紋も従来どおり（配合は変えていない）', C.doughSignature(A) === C.doughSignature(normalizeVariant({ baseFlour: 150, ingredientGroups: [
    { id: 'flour', kind: 'flour', items: [{ id: 'haru', name: '春よ恋', g: 100 }, { id: 'kitano', name: 'キタノカオリ', g: 20 }, { id: 'lys', name: 'リスドォル', g: 15 }, { id: 'tapioca', name: 'タピオカ粉', g: 15 }] },
    { id: 'dough', kind: 'dough', items: [{ id: 'sugar', name: '砂糖', g: 15 }, { id: 'salt', name: '塩', g: 2 }, { id: 'bp', name: 'ベーキングパウダー', g: 3 }, { id: 'skim', name: 'スキムミルク', g: 8 }, { id: 'egg', name: '全卵', g: 30 }, { id: 'water', name: '水', g: { target: 50, min: 45, max: 55 } }, { id: 'oil', name: '米油またはサラダ油', g: 10 }] }] })));
  const ba = C.computeAmounts(B, C.scaleFor(B, {}));
  const g = (id) => ba.rows[id].g;
  ok('B：春よ恋120・キタノカオリ15・タピオカ15・砂糖15・塩2.3・イースト2.3・スキム6・卵23・水60〜70・バター12', g('haru') === 120 && g('kitano') === 15 && g('tapioca') === 15 && g('sugar') === 15 && g('salt') === 2.3 && g('yeast') === 2.3 && g('skim') === 6 && g('egg') === 23 && g('water') === 60 && ba.rows.water.max === 70 && g('butter') === 12);
  ok('B：1本 約45g（生地 約270g）', Math.abs(ba.piece - 45) < 0.1);
  ok('衣：薄力粉＋水（6本で 15g・22g）・中目パン粉', aa.rows.bflour.g === 15 && Math.round(aa.rows.bwater.raw) === 22 && aa.rows.panko.name === '中目パン粉' && !aa.rows.cwater);
  ok('衣の量は本数に比例（12本で薄力粉30g）', C.computeAmounts(A, C.scaleFor(A, { count: 12 })).rows.bflour.g === 30);
  ok('A・B は同じ系統・配合違い（まとめて作る対象ではない）', C.compatVariants(A, B).level === 'family' && A.dough.familyId === 'curry-bread-dough' && B.dough.familyId === 'curry-bread-dough');
  const fry = (v) => v.steps.find((s2) => s2.phase === 'bake');
  ok('揚げ：A 170〜175℃ 3〜4分／B 170℃ 4分（phase:bake・method:fry）', fry(A).bake.method === 'fry' && fry(A).bake.tempMin === 170 && fry(A).bake.tempMax === 175 && fry(B).bake.method === 'fry' && fry(B).bake.tempMin === 170 && fry(B).bake.max === 4);
  ok('揚げは2本ずつ・網に立てかけて油を切る（A・B とも本文に）', [A, B].every((v) => /2本ずつ/.test(fry(v).body) && /立てかけ/.test(fry(v).body)));
  ok('B：衣を付けてから二次発酵（ビストロの発酵35℃・給水タンクは空・20〜25分）', (() => { const i = B.steps.findIndex((s2) => s2.id === 'y8'); const pr = B.steps.find((s2) => s2.phase === 'proof'); return i >= 0 && B.steps.indexOf(pr) > i && pr.ferment.min === 20 && pr.ferment.max === 25 && pr.ferment.tempMin === 35 && pr.ferment.tempMax === 35 && /給水タンクは空/.test(pr.body); })());
  ok('B：工程の区分は順番どおり（衣は成形の区分）', (() => { let last = -1; return B.steps.every((s2) => { const k = C.PHASE_ORDER.indexOf(s2.phase); const okk = k >= last; last = k; return okk; }); })());
  ok('使う材料（uses）はすべて材料にある', [A, B].every((v) => { const a = C.computeAmounts(v, C.scaleFor(v, {})); return v.steps.every((s2) => (s2.uses || []).every((u) => a.rows[typeof u === 'string' ? u : u.ref])); }));
  ok('本文のテンプレートがすべて埋まる', [A, B].every((v) => { const a = C.computeAmounts(v, C.scaleFor(v, {})); return v.steps.every((s2) => !/\{\{/.test(C.tpl(s2.body, a))); }));
  ok('冷凍の手順を tips に（A：揚げる前／B：揚げた後）', A.tips.some((t) => /冷凍.*160〜165℃/.test(t)) && B.tips.some((t) => /冷凍.*200℃/.test(t)));
  ok('説明文とタグ（「発酵なし」タグは外す）', !r.tags.includes('発酵なし') && /A：/.test(r.description) && /B：/.test(r.description));
}

console.log('v2.0.4. 外パリ中ふわフランスパン（4つの形）');
{
  const r = R('french-soft');
  ok('標準レシピに追加（7件目）・4つの形', seeds.length === 7 && r && r.variants.map((v) => v.id).join() === 'baguette,batard,coupe,mentai' && r.category === 'ハード系');
  ok('すべて入力チェックを通り、工程データがそろう', r.variants.every((v) => C.validateVariant(v).length === 0 && C.phaseComplete(v)));
  const amt = (v) => C.computeAmounts(v, C.scaleFor(v, {}));
  const a = amt(r.variants[0]);
  ok('共通生地：春よ恋180・リスドォル120・水207・塩6・イースト1.0・砂糖3（生地 517g・加水69%）', a.rows.haru.g === 180 && a.rows.lys.g === 120 && a.rows.water.g === 207 && a.rows.salt.g === 6 && a.rows.yeast.g === 1 && a.rows.sugar.g === 3 && Math.round(a.dough) === 517 && Math.round(a.hydration) === 69);
  ok('4つの形は同じ配合（同じ系統・同じ指紋）', new Set(r.variants.map((v) => C.doughSignature(v))).size === 1 && r.variants.every((v) => v.dough.familyId === 'french-soft') && DOUGH_FAMILIES['french-soft']);
  ok('ロデヴとは別の系統・別の配合', C.compatVariants(r.variants[0], R('rodev-90').variants[0]).level === null);
  ok('分割：バゲット2本 約259g／バタール1本 517g／クッペ・明太 4個 約129g', [[0, 258.5], [1, 517], [2, 129.25], [3, 129.25]].every(([i, w]) => Math.abs(amt(r.variants[i]).piece - w) < 0.01));
  ok('単位：バゲット・バタールは「本」、クッペ・明太は「個」', r.variants.map((v) => v.countUnit).join() === '本,本,個,個');
  const stages = (v) => v.steps.filter((s) => s.phase === 'bake').map((s) => [s.bake.temp, s.bake.min, s.bake.max, !!s.bake.steam, s.bake.preheat ?? null]);
  ok('バゲット：250℃予熱・250℃ 5分 → 自動で210℃ 13〜15分（合計18〜20分）', JSON.stringify(stages(r.variants[0])) === JSON.stringify([[250, 5, 5, false, 250], [210, 13, 15, false, null]]));
  ok('バタール：250℃ 5分 → 自動で210℃ 22〜27分（合計27〜32分・中心95℃の目安）', JSON.stringify(stages(r.variants[1])) === JSON.stringify([[250, 5, 5, false, 250], [210, 22, 27, false, null]]) && /95℃/.test(r.variants[1].steps.find((s) => s.id === 'bt-bake2').body));
  ok('クッペ（プレーン）：250℃ 5分 → 自動で210℃ 8〜10分（合計13〜15分）', JSON.stringify(stages(r.variants[2])) === JSON.stringify([[250, 5, 5, false, 250], [210, 8, 10, false, null]]));
  ok('明太フランス：250℃ 5分 → 自動で210℃ 6〜8分（淡く）→ 塗って 190℃ 4〜6分', JSON.stringify(stages(r.variants[3])) === JSON.stringify([[250, 5, 5, false, 250], [210, 6, 8, false, null], [190, 4, 6, false, null]]));
  const m = amt(r.variants[3]);
  ok('明太バターは1.5倍（4個で明太子50g・バター45g・マヨネーズ12g）・個数に比例', m.rows.mentaiko.g === 50 && m.rows.mbutter.g === 45 && m.rows.mayo.g === 12 && C.computeAmounts(r.variants[3], C.scaleFor(r.variants[3], { flour: 150 })).rows.mentaiko.g === 25);
  ok('バゲットのクープ：斜めに3〜4本・浅め', /斜めに3〜4本/.test(r.variants[0].steps.find((s) => s.phase === 'top').body));
  ok('こねの目安（手ごね8〜10分）', r.variants.every((v) => v.steps.some((s) => s.timer && s.timer.min === 8 && s.timer.max === 10 && /8〜10分/.test(s.body))));
  ok('二次発酵：ひと回り〜1.5倍弱・35〜50分', r.variants.every((v) => { const f = v.steps.find((s) => s.phase === 'proof').ferment; return f.min === 35 && f.max === 50 && /1\.5倍弱/.test(f.cue); }));
  ok('本文のテンプレートがすべて埋まり、使う材料はすべて材料にある', r.variants.every((v) => { const a2 = amt(v); return v.steps.every((s) => !/\{\{/.test(C.tpl(s.body, a2)) && (s.uses || []).every((u) => a2.rows[typeof u === 'string' ? u : u.ref])); }));
  ok('バタールの分割は「分割せず1個にまとめる」', /分割せず1個/.test(C.tpl(r.variants[1].steps.find((s) => s.phase === 'divide').body, amt(r.variants[1]))));
}

console.log('v2.1.0. オーブン（ビストロ NE-BS655）に合わせた設計');
{
  const all = seeds.flatMap((r) => r.variants.map((v) => ({ r, v })));
  const bakeSteps = all.flatMap(({ r, v }) => { const out = []; C.eachStep(v.steps, (s2) => { if (s2.phase === 'bake' && s2.bake?.method !== 'fry' && s2.bake?.method !== 'hb') out.push({ r, v, s: s2 }); }); return out; });
  ok('オーブンの温度はすべて 80〜250℃・10℃単位（195℃・215℃などを使わない）', bakeSteps.every(({ s }) => [s.bake.temp, s.bake.preheat].filter((x) => x != null).every((t) => t >= 80 && t <= 250 && t % 10 === 0)), bakeSteps.map(({ r, s }) => `${r.id}:${s.bake.temp}/${s.bake.preheat}`).join());
  ok('220℃以上で焼くのは最初の約5分だけ（そのあとは自動で210℃）', bakeSteps.every(({ s }) => !(s.bake.temp >= 220) || (s.bake.max ?? s.bake.min) <= 5));
  ok('オーブン内でスチームを前提にしない（霧吹きで代わり）', bakeSteps.every(({ s }) => !s.bake.steam) && bakeSteps.filter(({ s }) => s.bake.mist).every(({ s }) => /霧吹き/.test(s.body)));
  ok('ロデヴ・フランスパンの最初の段は霧吹き', bakeSteps.filter(({ r, s }) => (r.id === 'rodev-90' || r.id === 'french-soft') && s.bake.temp === 250).every(({ s }) => s.bake.mist === true) && bakeSteps.some(({ r }) => r.id === 'rodev-90'));
  const ferments = all.flatMap(({ r, v }) => { const out = []; C.eachStep(v.steps, (s2) => { if (s2.ferment && /ビストロ/.test(s2.ferment.temp || '')) out.push({ r, v, s: s2 }); }); return out; });
  ok('ビストロの発酵機能を使う工程は 35℃（設定は35℃か40℃）', ferments.length >= 6 && ferments.every(({ s }) => s.ferment.tempMin === 35 && s.ferment.tempMax === 35));
  ok('甘い生地の二次発酵：35℃ 30〜45分（予熱の間も膨らむ分を見込む）', sweet.every(([, v]) => { const f = v.steps.find((s2) => s2.phase === 'proof').ferment; return f.min === 30 && f.max === 45 && /予熱/.test(f.cue); }));
  ok('甘い生地の焼成：190℃予熱 → 180℃・下段', sweet.every(([, v]) => { const b = v.steps.find((s2) => s2.phase === 'bake'); return b.bake.preheat === 190 && b.bake.temp === 180 && /下段/.test(b.body); }));
  ok('食パン B・C：210℃予熱 → 200℃ 28〜31分（195℃は使わない）', R('shokupan-junnama').variants.slice(1, 3).every((v) => { const b = v.steps.find((s2) => s2.phase === 'bake'); return b.bake.preheat === 210 && b.bake.temp === 200 && b.bake.min === 28 && b.bake.max === 31; }));
  ok('バゲットは30cmまで（グリル皿に2本）', /30cmまで/.test(R('french-soft').variants[0].steps.find((s2) => s2.phase === 'shape').body));
  ok('カレーパン B の二次発酵はスチームなし（パン粉が湿らない）', /給水タンクは空/.test(R('curry-pan').variants[1].steps.find((s2) => s2.phase === 'proof').body));
  ok('予熱は庫内を空にして行う案内（甘い生地・食パン・ロデヴ・フランスパン）', ['anpan', 'shokupan-junnama', 'rodev-90', 'french-soft'].every((id) => { let hit = false; R(id).variants.forEach((v) => C.eachStep(v.steps, (s2) => { if ((s2.tips || []).some((t) => /庫内を空にして/.test(t))) hit = true; })); return hit; }));
  ok('OVEN の定義', C && typeof OVEN === 'object' && /NE-BS655/.test(OVEN.name));
  // グリル皿の個数
  ok('グリル皿：甘い生地は9個まで（8個は注意なし・12個は注意）', sweet.every(([, v]) => v.trayMax === 9) && C.trayWarning(sweet[0][1], 8) === null && /約9個まで.*12個/.test(C.trayWarning(sweet[0][1], 12)));
  ok('trayMax の無いレシピは注意なし', C.trayWarning(R('french-soft').variants[2], 20) === null);
  const pb12 = C.planBatch([M('cream-pan', null, 4), M('choco-pan', null, 4), M('anpan', 'hb', 4)]);
  ok('まとめて作る 12個：開始はできる・グリル皿の注意を出す', pb12.ok && pb12.warnings.length === 1 && /約9個まで/.test(pb12.warnings[0]));
  ok('まとめて作る 8個：注意なし', C.planBatch([M('cream-pan', null, 4), M('choco-pan', null, 4)]).warnings.length === 0);
}

console.log('v2.1.1. 純生食パン D（湯種）');
{
  const r = R('shokupan-junnama');
  const D = r.variants.find((v) => v.id === 'yudane-pan12');
  ok('seedRev 5・4通り（D を追加。A〜C はそのまま）', r.seedRev === 5 && r.variants.map((v) => v.id).join() === 'hb-auto,hb-pan12,hand-pan12,yudane-pan12');
  ok('入力チェックを通り、工程データがそろう', D && C.validateVariant(D).length === 0 && C.phaseComplete(D));
  const a = C.computeAmounts(D, C.scaleFor(D, {}));
  ok('粉の合計は250g（湯種の春よ恋50g＝20%を含む）', Math.round(a.flour) === 250 && a.rows.yflour.g === 50 && Math.abs(a.rows.yflour.pct.target - 20) < 1e-9 && a.rows.haru.g === 169 && a.rows.kitano.g === 31);
  ok('湯種：熱湯50g（粉と同量）・水は入れず牛乳120〜130g', a.rows.ywater.g === 50 && !a.rows.water && a.rows.milk.min === 120 && a.rows.milk.max === 130);
  ok('そのほか（生クリーム・砂糖・はちみつ・塩・バター・イースト）は B と同じ', ['cream', 'sugar', 'honey', 'salt', 'butter', 'yeast'].every((k) => a.rows[k].g === C.computeAmounts(r.variants[1], C.scaleFor(r.variants[1], {})).rows[k].g));
  ok('B より水分が多い（約70%）', Math.round(a.hydration) === 70);
  ok('前日の工程：湯種を作る → 冷蔵8〜24時間（下準備）', D.steps[0].phase === 'prep' && D.steps[1].phase === 'prep' && D.steps[1].timer.min === 480 && D.steps[1].timer.max === 1440);
  ok('焼成：210℃予熱 → 200℃ 29〜32分（B・C より少し長め）', (() => { const b = D.steps.find((x) => x.phase === 'bake').bake; return b.preheat === 210 && b.temp === 200 && b.min === 29 && b.max === 32; })());
  ok('二次発酵：ビストロの発酵35℃・型の縁2cm下で取り出す', /2cm下/.test(D.steps.find((x) => x.phase === 'proof').ferment.cue));
  ok('型：12cm角型・型容積で分量変更', D.scaleMode === 'panVolume' && C.panKey(D.basePan) === C.panKey(r.variants[1].basePan));
  ok('B・C と同じ系統・配合違い', C.compatVariants(r.variants[1], D).level === 'family' && D.dough.familyId === 'rich-shokupan');
  ok('本文のテンプレートが埋まり、使う材料はすべて材料にある', D.steps.every((x) => !/\{\{/.test(C.tpl(x.body, a)) && (x.uses || []).every((u) => a.rows[typeof u === 'string' ? u : u.ref])));
  ok('「冷蔵発酵」のレシピ扱いにしない（湯種の冷蔵はタイマー）', !C.hasCold(D.steps));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
