// Initial recipes. Written in grams for readability, then normalized to baker's % (the stored truth).
import { doughSignature } from './calc.js';

export const SEED_VERSION = 7;

// 生地の系統（表示名はここから引く。variant には familyId だけを持たせる）
export const DOUGH_FAMILIES = {
  'basic-sweet-dough': { name: '基本の菓子パン生地' },
  'lean-high-hydration': { name: 'リーン・高加水' },
  'rich-shokupan': { name: 'リッチ食パン生地' },
  'curry-bread-dough': { name: 'カレーパン生地' },
  'french-soft': { name: 'フランスパン生地（外パリ中ふわ）' },
};

// ingredient helper: g = number | {target,min,max}
const I = (id, name, g, o = {}) => ({ id, name, g, ...o });

export function normalizeVariant(v) {
  const base = v.baseFlour;
  for (const grp of v.ingredientGroups) {
    for (const it of grp.items) {
      if (grp.kind === 'prep' && it.basis === 'batch') {
        // 下準備の材料は「1単位あたりのg」をそのまま持つ。ベーカーズ％にしない
        it.precision ??= 1;
        continue;
      }
      if (it.g != null) {
        const gg = typeof it.g === 'number' ? { target: it.g } : it.g;
        it.basis = 'flour';
        it.pct = {};
        for (const k of ['target', 'min', 'max']) if (gg[k] != null) it.pct[k] = (gg[k] / base) * 100;
        delete it.g;
        if (it.byPlanG) {
          it.byPlan = {};
          for (const [k, g] of Object.entries(it.byPlanG)) it.byPlan[k] = { target: (g / base) * 100 };
          delete it.byPlanG;
        }
      } else if (it.perCount) it.basis = 'perCount';
      else it.basis = 'text';
      it.precision ??= 1;
    }
  }
  return v;
}

function recipe(r) {
  const now = Date.now();
  r.variants = r.variants.map(normalizeVariant);
  return {
    version: 1, seedRev: 1, userEdited: false, favorite: false, status: '調整中', tags: [], changeLog: [{ version: 1, at: now, note: '初期登録' }],
    createdAt: now, updatedAt: now, defaultVariantId: r.variants[0].id,
    ...r,
  };
}

// 2段焼成は焼成工程を2つ持つ（1段目の時間は温度を切り替える時刻なので、同時製作の判定にも使う）
const RODEV_BAKE = (p) => [
  { id: `${p}-bake1`, phase: 'bake', title: '焼成①', body: '250℃・スチームあり。', timer: { min: 10, label: '焼成① 250℃' },
    bake: { method: 'oven', preheat: 250, temp: 250, min: 10, max: 10, steam: true } },
  { id: `${p}-bake2`, phase: 'bake', title: '焼成②', body: '蒸気を抜き、230℃に下げて焼く。焼き色を見て15〜18分。', timer: { min: 15, max: 18, label: '焼成② 230℃' },
    bake: { method: 'oven', temp: 230, min: 15, max: 18, steam: false } },
  { id: `${p}-cool`, phase: 'after', title: '冷ます', body: '網の上で完全に冷ます。断面は冷めてから。' },
];

// 12cm角型の2バリエーション（B: HB＋型 / C: 手ごね＋型）は配合を完全共通にする
const PAN12_GROUPS = () => ([
  { id: 'flour', name: '粉', kind: 'flour', items: [I('haru', '春よ恋', 218.75), I('kitano', 'キタノカオリ', 31.25)] },
  { id: 'dough', name: 'その他', kind: 'dough', items: [
    I('milk', '牛乳', 142.857142857, { moisture: 0.88 }),
    I('water', '水', { target: 22.321428571, min: 22.321428571, max: 26.785714286 }, { moisture: 1, note: '生地が硬い場合のみ最大＋約4g' }),
    I('cream', '生クリーム', 22.321428571, { moisture: 0.5 }),
    I('sugar', '砂糖', 17.857142857),
    I('honey', 'はちみつ', 13.392857143, { moisture: 0.2 }),
    I('salt', '塩', 4.017857143, { precision: 0.1 }),
    I('butter', '無塩バター', 25),
    I('yeast', 'ドライイースト', 2.678571429, { precision: 0.1 }),
  ] },
  { id: 'finish', name: '仕上げ', kind: 'finish', items: [{ id: 'mbutter', name: '溶かしバター（好みで）', text: '2〜3g' }] },
]);


// ───────────────────────────── 基本の菓子パン生地（あんぱん・クリームパン・チョコ包みパン共通）
const SWEET_DOUGH_GROUPS = () => ([
  { id: 'flour', name: '粉', kind: 'flour', items: [
    I('haru', '春よ恋', 180, { ingKey: 'flour.haruyokoi' }),
    I('kitano', 'キタノカオリ', 20, { ingKey: 'flour.kitanokaori' }),
  ] },
  { id: 'dough', name: 'その他', kind: 'dough', items: [
    I('milk', '牛乳', { target: 120, max: 130 }, { ingKey: 'milk', moisture: 0.88, note: '硬ければ最大130gまで足す' }),
    I('egg', '全卵', 20, { ingKey: 'egg.whole', moisture: 0.75, note: '溶き卵から取り分け、残りは艶出しに使う' }),
    I('sugar', '砂糖', 24, { ingKey: 'sugar' }),
    I('salt', '塩', 3, { ingKey: 'salt', precision: 0.1 }),
    I('yeast', 'ドライイースト', 2.4, { ingKey: 'yeast.dry', precision: 0.1 }),
    I('butter', '無塩バター', 20, { ingKey: 'butter.unsalted' }),
  ] },
]);
const EGGWASH = () => ({ id: 'eggwash', name: '艶出し用の溶き卵', text: '適量（生地用の残り）' });

const SWEET_BASE = () => ({
  scaleMode: 'count', baseCount: 8, countUnit: '個', baseFlour: 200, yieldLabel: '8個分',
  dough: { familyId: 'basic-sweet-dough' },
  bakeSummary: '190℃予熱 → 180℃ 12〜15分',
});
const SWEET_HB = () => ({
  mode: 'knead_first_fermentation', recommendation: 'recommended', model: 'siroca SB-2D271', course: 'パン生地コース',
  capacity: { course: 'パン生地', flourMax: 320 },
  notes: ['こね〜一次発酵までHB', '塩とイーストが直接重ならないように入れる', 'バターの投入タイミングは機種の指示に従う'],
});

// HBでこね〜一次発酵（工程IDは p＋番号。あんぱん a1〜a3 は従来IDのまま）
const HB_DOUGH = (p, n0) => ([
  { id: `${p}${n0}`, phase: 'dough', title: 'HBへ材料を投入', uses: ['haru', 'kitano', 'milk', 'egg', 'sugar', 'salt', 'yeast'],
    body: '機種の指示に従う順番で投入する。塩とイーストが直接重ならないようにする。牛乳はまず{{min:milk}}、生地が硬ければ最大{{max:milk}}まで足す。',
    hb: 'siroca SB-2D271：パン生地コース（こね〜一次発酵）' },
  { id: `${p}${n0 + 1}`, phase: 'dough', title: 'バターを加える', uses: ['butter'],
    body: '生地がある程度つながってからバターを加える。投入タイミングは機種の指示に従う。' },
  { id: `${p}${n0 + 2}`, phase: 'dough', title: '一次発酵の仕上がりを確認',
    body: 'パン生地コース終了。約2倍がめやす。足りなければ28〜30℃で10〜20分追加する。' },
]);
const SWEET_DIVIDE = (p) => ({ id: `${p}-div`, phase: 'divide', title: '分割・ベンチ', body: '{{count}}分割。1個約{{piece}}g。軽く丸めて休ませる。',
  timer: { min: 15, label: 'ベンチタイム' } });
const SWEET_PROOF = (p) => ({ id: `${p}-ferm2`, phase: 'proof', title: '二次発酵', body: '時間より生地の状態を優先する。',
  ferment: { temp: '32〜35℃', tempMode: 'range', tempMin: 32, tempMax: 35, cue: 'ひと回りふっくら・指で軽く触ると柔らかい', min: 40, max: 60 },
  tips: ['過発酵になると焼成時に横へ広がりやすい', '終盤に190℃で予熱を開始'] });
const SWEET_BAKE = (p, extraTips = []) => ({ id: `${p}-bake`, phase: 'bake', title: '焼成',
  body: '190℃で予熱 → 180℃で焼く。12分で焼き色を確認し、濃いきつね色になれば焼き上がり。弱ければ1〜2分追加。',
  timer: { min: 12, max: 15, label: '焼成 180℃' },
  bake: { method: 'oven', preheat: 190, temp: 180, min: 12, max: 15, steam: false, vessel: 'tray' },
  ...(extraTips.length ? { tips: extraTips } : {}) });
const SWEET_COOL = (p, body = '網にのせて冷ます。') => ({ id: `${p}-cool`, phase: 'after', title: '冷ます', body });
const GLAZE_TIPS = ['塗るのは必要量だけ。厚塗りしない', '（好みで）牛乳少量で薄めて漉すとムラになりにくい'];

// あんぱん
const ANPAN_GROUPS = () => ([
  ...SWEET_DOUGH_GROUPS(),
  { id: 'filling', name: 'フィリング', kind: 'filling', items: [
    { id: 'anko', name: 'あんこ', perCount: { target: 35 }, note: '1個35g・冷やしておく' },
  ] },
  { id: 'finish', name: '仕上げ', kind: 'finish', items: [EGGWASH(), { id: 'sesame', name: '黒ごま', text: '少量' }] },
]);
const ANPAN_PREP = (id) => ({ id, phase: 'prep', title: 'あんこを準備', uses: ['anko'],
  body: 'あんこを{{count}}等分して丸め（1個{{per:anko}}）、冷蔵庫で冷やしておく。柔らかいあんこほど、冷やした方が包みやすい。' });
const ANPAN_AFTER = (p) => ([
  SWEET_DIVIDE(p),
  { id: `${p}-wrap`, phase: 'shape', title: 'あんこを包む', uses: ['anko'],
    body: '生地を中央がやや厚く、周囲が薄くなるように直径10cm前後へ伸ばす。中央にあんこ{{per:anko}}を置き、周囲の生地を集めてしっかり閉じる。閉じ目を下にして、手のひらで軽く押さえて平たく整える。',
    tips: ['閉じ目付近にあんこを付けない', '平たく整えると焼成中に転がりにくく、底も浮きにくい'] },
  SWEET_PROOF(p),
  { id: `${p}-glaze`, phase: 'top', title: '艶出し・黒ごま', uses: ['eggwash', 'sesame'],
    body: '表面に溶き卵を薄く塗り、中央に黒ごまを少量のせる。',
    tips: [...GLAZE_TIPS, '黒ごまは、ほかの菓子パンと同じ天板で焼くときの目印にもなる'] },
  SWEET_BAKE(p),
  SWEET_COOL(p),
]);
const ANPAN_TIPS = [
  '基準は粉200g・8個（生地 約49g＋あんこ35g）',
  '全卵1個を溶き、生地用に20g取り分け、残りを艶出しに使う',
  '閉じ目付近にあんこを付けない',
  'あん多めが好みなら40gまで増やせる',
  '40gにする場合は、中央を残して周囲をやや薄く大きく伸ばす',
  '黒ごまは、ほかの菓子パンと同じ天板で焼くときの目印にもなる',
];

// クリームパン：カスタードは 4個分を1単位として切り上げ、1回に炊くのは最大8個分
const CUSTARD_PREP = () => ({
  id: 'custard', name: 'カスタード', kind: 'prep', prepKey: 'custard-basic',
  batch: { unit: 4, maxUnitsPerCook: 2, yieldPerUnit: 145 },
  items: [
    { id: 'cu-milk', name: '牛乳', basis: 'batch', g: 110, ingKey: 'milk' },
    { id: 'cu-yolk', name: '卵黄', basis: 'batch', g: 20, ingKey: 'egg.yolk', note: '卵1個分' },
    { id: 'cu-sugar', name: '砂糖', basis: 'batch', g: 25, ingKey: 'sugar' },
    { id: 'cu-starch', name: 'コーンスターチ', basis: 'batch', g: 10, ingKey: 'cornstarch' },
    { id: 'cu-butter', name: '無塩バター', basis: 'batch', g: 5, ingKey: 'butter.unsalted' },
    { id: 'cu-vanilla', name: 'バニラ', basis: 'text', text: '少量' },
  ],
});

// ───────────────────────────── 外パリ中ふわフランスパン（4つの形で共通の生地）
const FR_GROUPS = (extra = []) => ([
  { id: 'flour', name: '粉', kind: 'flour', items: [I('haru', '春よ恋', 180), I('lys', 'リスドォル', 120)] },
  { id: 'dough', name: 'その他', kind: 'dough', items: [
    I('water', '水', 207, { moisture: 1 }),
    I('salt', '塩', 6, { precision: 0.1 }),
    I('yeast', 'インスタントドライイースト', 1.0, { precision: 0.1, note: '発酵が遅い時期は1.2gまで' }),
    I('sugar', '砂糖', 3),
  ] },
  ...extra,
]);
const FR_BASE = (count, yieldLabel, countUnit) => ({
  scaleMode: 'flour', baseFlour: 300, baseCount: count, countUnit, yieldLabel,
  timeLabel: '約3.5時間',
  hb: { mode: 'none', label: '手ごね', recommendation: 'not_recommended', model: '', course: '', notes: ['手ごね（HBは使わない）'] },
  dough: { familyId: 'french-soft' },
});
const FR_DOUGH = (p) => ([
  { id: `${p}1`, phase: 'dough', title: '粉と水を混ぜる', uses: ['haru', 'lys', 'water'],
    body: 'ボウルに粉と水を入れ、粉気がなくなるまで混ぜる。' },
  { id: `${p}2`, phase: 'dough', title: '休ませる（オートリーズ）', body: '覆って休ませる。', timer: { min: 20, label: 'オートリーズ' } },
  { id: `${p}3`, phase: 'dough', title: '塩・イースト・砂糖を加えてこねる', uses: ['salt', 'yeast', 'sugar'],
    body: '塩・イースト・砂糖を加えてこねる。生地が均一になり、表面がなめらかになるまで（手ごねで8〜10分が目安）。',
    timer: { min: 8, max: 10, label: 'こね' },
    tips: ['少し長めにこねてなめらかにすると、気泡が細かく均一になり中がふんわりする'] },
  { id: `${p}4`, phase: 'dough', title: '一次発酵', body: '30分ごとに生地を折りたたむ。時間より状態を優先する。',
    ferment: { temp: '25℃', tempMode: 'range', tempMin: 25, tempMax: 25, cue: '約1.5倍・指で押した跡がゆっくり戻る', min: 75, max: 100 },
    tips: ['発酵が遅いと感じたら、次回はイーストを1.2gに'] },
  { id: `${p}5`, phase: 'divide', title: '分割・ベンチ', body: '{{divide}}。軽く丸め、乾燥しないよう覆う。', timer: { min: 20, label: 'ベンチタイム' } },
]);
const FR_PROOF = (p) => ({ id: `${p}7`, phase: 'proof', title: '二次発酵', body: '綴じ目を下に置く。発酵が足りないと中が詰まって硬く感じる。',
  ferment: { temp: '25℃', tempMode: 'range', tempMin: 25, tempMax: 25, cue: 'ひと回り〜1.5倍弱にふっくら', min: 35, max: 50 },
  tips: ['終盤にオーブンを250℃で予熱する（天板も入れて温める）', '蒸気を使う場合は予熱時から金属皿も入れて温める'] });
const FR_COOL = (p, body = '網の上で冷ます。温かいうちは袋に入れない（皮が柔らかくなる）。') => ({ id: `${p}-cool`, phase: 'after', title: '冷ます', body });
const FR_STEAM_TIP = '蒸気はオーブンの取扱説明書を確認。使う場合は予熱で温めた金属皿に熱湯30〜50mlを注ぐ（蒸気でのやけどに注意）';

export function buildSeedRecipes() {
  return [
    // ───────────────────────────── カレーパン（rev3：A ベーキングパウダー／B イースト の2通り）
    recipe({
      id: 'curry-pan',
      seedRev: 3, // rev3：衣を「薄い衣＋中目パン粉」に、揚げ方を2本ずつに。B（イースト）を追加
      name: '薄皮もちもち俵型カレーパン',
      category: '惣菜パン',
      difficulty: 2,
      tags: ['当日完成', '揚げパン'],
      description: 'もっちり・ほんのり甘い生地で、冷たく固いカレーを包んで揚げる。A：発酵なし・ベーキングパウダーで約1時間。B：イースト発酵で、パンらしい香りとふんわり感（約2.5時間）。',
      variants: [{
        id: 'std', name: 'A. ベーキングパウダー',
        scaleMode: 'count', baseCount: 6, countUnit: '本', baseFlour: 150,
        yieldLabel: '6本分',
        timeLabel: '約1時間',
        hb: {
          mode: 'optional_knead', recommendation: 'optional', model: 'siroca SB-2D271', course: 'こねる',
          notes: ['使用する場合「こねる」5分', '生地が硬ければ水を少量追加', '必要ならさらに2分', '発酵機能は使用しない'],
        },
        bakeSummary: '170〜175℃で揚げ 3〜4分',
        dough: { familyId: 'curry-bread-dough' },
        ingredientGroups: [
          { id: 'flour', name: '基準粉', kind: 'flour', items: [
            I('haru', '春よ恋', 100), I('kitano', 'キタノカオリ', 20), I('lys', 'リスドォル', 15), I('tapioca', 'タピオカ粉', 15),
          ] },
          { id: 'dough', name: 'その他', kind: 'dough', items: [
            I('sugar', '砂糖', 15),
            I('salt', '塩', 2, { precision: 0.1 }),
            I('bp', 'ベーキングパウダー', 3, { precision: 0.1 }),
            I('skim', 'スキムミルク', 8),
            I('egg', '全卵', 30, { moisture: 0.75 }),
            I('water', '水', { target: 50, min: 45, max: 55 }, { moisture: 1, note: 'まず下限を入れ、硬い場合だけ追加' }),
            I('oil', '米油またはサラダ油', 10),
          ] },
          { id: 'filling', name: 'フィリング', kind: 'filling', items: [
            { id: 'curry', name: '固めのカレー', perCount: { target: 47.5, min: 45, max: 50 }, note: '1本45〜50g・前日に作って冷たく固く' },
          ] },
          { id: 'finish', name: '仕上げ', kind: 'finish', items: [
            { id: 'bflour', name: '衣用の薄力粉', perCount: { target: 2.5 } },
            { id: 'bwater', name: '衣用の水', perCount: { target: 3.7 }, note: '薄力粉1：水1.5で薄い衣にする' },
            { id: 'panko', name: '中目パン粉', text: '適量' },
            { id: 'fryoil', name: '揚げ油', text: '適量' },
          ] },
        ],
        steps: [
          { id: 'c1', phase: 'prep', title: 'カレーを固く・冷たくする', uses: ['curry'],
            body: 'カレーを煮詰め、流れない硬さにする。前日に作って一晩冷蔵すると味がなじみ、固まって包みやすい。{{count}}等分して1本{{per:curry}}。細長い俵型にして冷蔵庫でしっかり冷やす。',
            tips: ['仕上げにガラムマサラを少し加えると、揚げたときに香りが立つ'] },
          { id: 'c2', phase: 'dough', title: '生地を作る',
            uses: ['haru', 'kitano', 'lys', 'tapioca', 'sugar', 'salt', 'bp', 'skim', 'egg', { ref: 'water', show: 'min' }, 'oil'],
            body: '粉類、砂糖、塩、ベーキングパウダー、スキムミルクを混ぜる。卵・油・水{{min:water}}を加え、5〜7分こねる。硬い場合だけ残りの水を少量ずつ加える（合計最大{{max:water}}）。',
            hb: 'HB使用時：「こねる」5分 → 硬ければ水を少量追加 → 必要ならさらに2分。発酵機能は使わない。',
            timer: { min: 5, max: 7, label: 'こね' } },
          { id: 'c3', phase: 'dough', title: '休ませる', body: 'ラップをして室温で休ませる。これは発酵ではなく、生地を伸ばしやすくするため。30分を大きく超えて休ませない。',
            timer: { min: 20, max: 30, label: '生地を休ませる' } },
          { id: 'c4', phase: 'divide', title: '分割・伸ばす',
            body: '{{count}}等分。1個約{{piece}}gを目安にする。長さ15〜17cm、幅8〜9cm程度の楕円に伸ばす。中央は少し厚め、端は薄め。' },
          { id: 'c5', phase: 'shape', title: '包む', uses: ['curry'],
            body: '冷たいカレーを中央に置き、長辺同士を合わせて強くつまむ。両端も完全に閉じ、長さ約15cmの俵型に整える。',
            tips: ['閉じ目に打ち粉や油を付けない'] },
          { id: 'c6', phase: 'top', title: '衣・パン粉', uses: ['bflour', 'bwater', 'panko'],
            body: '薄力粉と水を混ぜた薄い衣を表面に塗り、中目パン粉を付ける。閉じ目は特にしっかり密着させる。',
            tips: ['水だけより衣が均一に付き、揚げても剥がれにくい', '衣とパン粉は付けすぎない（薄皮感を残す）'] },
          // 揚げも phase は「焼成」。加熱方法を method: 'fry' で区別する
          { id: 'c7', phase: 'bake', title: '揚げる', uses: ['fryoil'],
            bake: { method: 'fry', tempMin: 170, tempMax: 175, min: 3, max: 4, steam: false },
            body: '170〜175℃。一度に2本ずつ、閉じ目を下にして入れ、途中で返しながら揚げる。全体がきつね色になったら取り出し、網の上に立てかけて油を切る。',
            tips: ['一度にたくさん入れると油の温度が下がり、衣が油を吸ってべちゃっとする', '冷たいカレーを包むため、揚げ上がりでも中心が熱々にならない場合がある', '熱々で食べたい場合は食べる直前に軽く温め直す'],
            timer: { min: 3, max: 4, label: '揚げ' } },
        ],
        tips: ['発酵なし（ベーキングパウダー）', 'カレーは前日に作り、固く冷たくする', '休ませは20〜30分まで（30分を大きく超えない）', '閉じ目に打ち粉や油を付けない', '衣は「薄力粉＋水」の薄い衣＋中目パン粉', '揚げるのは2本ずつ。網に立てかけて油を切る',
          '冷凍する場合：衣を付けたところで冷凍し、凍ったまま160〜165℃で6〜8分揚げる（中心が温まっているか確認）'],
      }, {
        id: 'yeast', name: 'B. イースト',
        scaleMode: 'count', baseCount: 6, countUnit: '本', baseFlour: 150,
        yieldLabel: '6本分',
        timeLabel: '約2.5時間',
        hb: { mode: 'none', label: '手ごね', recommendation: 'optional', model: 'siroca SB-2D271', course: '', notes: ['基本は手ごね', '2倍量（粉300g・12本）なら、HBのパン生地コースでこね〜一次発酵も可（パン生地コースの上限 粉320g以内）'] },
        bakeSummary: '170℃で揚げ 4分',
        dough: { familyId: 'curry-bread-dough' },
        ingredientGroups: [
          { id: 'flour', name: '基準粉', kind: 'flour', items: [
            I('haru', '春よ恋', 120), I('kitano', 'キタノカオリ', 15), I('tapioca', 'タピオカ粉', 15),
          ] },
          { id: 'dough', name: 'その他', kind: 'dough', items: [
            I('sugar', '砂糖', 15),
            I('salt', '塩', 2.25, { precision: 0.1 }),
            I('yeast', 'ドライイースト', 2.25, { precision: 0.1 }),
            I('skim', 'スキムミルク', 6),
            I('egg', '全卵', 22.5, { moisture: 0.75 }),
            I('water', '水', { target: 60, max: 70 }, { moisture: 1, note: 'まず60g、硬い場合だけ追加（最大70g）' }),
            I('butter', '無塩バター', 12),
          ] },
          { id: 'filling', name: 'フィリング', kind: 'filling', items: [
            { id: 'curry', name: '固めのカレー', perCount: { target: 47.5, min: 45, max: 50 }, note: '1本45〜50g・前日に作って冷たく固く' },
          ] },
          { id: 'finish', name: '仕上げ', kind: 'finish', items: [
            { id: 'bflour', name: '衣用の薄力粉', perCount: { target: 2.5 } },
            { id: 'bwater', name: '衣用の水', perCount: { target: 3.7 }, note: '薄力粉1：水1.5で薄い衣にする' },
            { id: 'panko', name: '中目パン粉', text: '適量' },
            { id: 'fryoil', name: '揚げ油', text: '適量' },
          ] },
        ],
        steps: [
          { id: 'y1', phase: 'prep', title: 'カレーを固く・冷たくする', uses: ['curry'],
            body: 'カレーを煮詰め、流れない硬さにする。前日に作って一晩冷蔵すると味がなじみ、固まって包みやすい。{{count}}等分して1本{{per:curry}}。短めの俵型にして冷蔵庫でしっかり冷やす。',
            tips: ['仕上げにガラムマサラを少し加えると、揚げたときに香りが立つ'] },
          { id: 'y2', phase: 'dough', title: '材料を混ぜる',
            uses: ['haru', 'kitano', 'tapioca', 'sugar', 'salt', 'yeast', 'skim', 'egg', { ref: 'water', show: 'min' }],
            body: '粉類・砂糖・塩・ドライイースト・スキムミルクを混ぜる（塩の上にイーストを置かない）。卵と水{{min:water}}を加えてまとめる。硬ければ水を少しずつ足す（合計最大{{max:water}}）。バターはまだ入れない。' },
          { id: 'y3', phase: 'dough', title: 'こねる', body: '台に出してこねる。生地がつながり、表面が少しなめらかになったら次へ。',
            timer: { min: 5, label: 'こね' } },
          { id: 'y4', phase: 'dough', title: 'バターを加えてこねる', uses: ['butter'],
            body: '柔らかくしたバターを加え、さらにこねる。薄く伸ばすと少し透ける程度でよい。こね上がりの生地温は26〜28℃が目安。',
            timer: { min: 8, max: 10, label: '本ごね' },
            tips: ['バター投入直後に生地が一度バラバラになるのは正常'] },
          { id: 'y5', phase: 'dough', title: '一次発酵', body: '丸めてボウルへ。時間より膨らみを優先する。',
            ferment: { temp: '30℃', tempMode: 'range', tempMin: 30, tempMax: 30, cue: '約2倍', min: 40, max: 50 } },
          { id: 'y6', phase: 'divide', title: '分割・ベンチ', body: '{{count}}等分。1個約{{piece}}g。軽く丸めて休ませる。',
            timer: { min: 15, label: 'ベンチタイム' } },
          { id: 'y7', phase: 'shape', title: '包む', uses: ['curry'],
            body: '生地を13×9cm程度の楕円に伸ばす（中央は少し厚め、端は薄め）。冷たいカレーを中央に置き、長辺同士を合わせて強くつまむ。両端も完全に閉じ、長さ12〜13cmの短めの俵形に整える。',
            tips: ['閉じ目に打ち粉や油を付けない'] },
          // 二次発酵の前に衣を付けるので、区分は「成形」（工程の順番を保つ）
          { id: 'y8', phase: 'shape', title: '衣・パン粉', uses: ['bflour', 'bwater', 'panko'],
            body: '薄力粉と水を混ぜた薄い衣を表面に塗り、中目パン粉を付ける。閉じ目は特にしっかり密着させる。',
            tips: ['衣を付けてから二次発酵させる'] },
          { id: 'y9', phase: 'proof', title: '二次発酵', body: '湿度は上げない（パン粉が湿るため）。発酵させすぎると揚げたときに破裂しやすく、油も吸うので控えめに。',
            ferment: { temp: '30〜35℃', tempMode: 'range', tempMin: 30, tempMax: 35, cue: 'ひと回り大きくなる（膨らませすぎない）', min: 20, max: 25 } },
          { id: 'y10', phase: 'bake', title: '揚げる', uses: ['fryoil'],
            bake: { method: 'fry', tempMin: 170, tempMax: 170, min: 4, max: 4, steam: false },
            body: '170℃。一度に2本ずつ、閉じ目を下にして入れ、途中で返しながら揚げる。全体がきつね色になったら取り出し、網の上に立てかけて油を切る。',
            tips: ['一度にたくさん入れると油の温度が下がり、衣が油を吸ってべちゃっとする'],
            timer: { min: 4, label: '揚げ' } },
        ],
        tips: ['イースト発酵で、もっちり＋ふんわり・パンらしい香り', 'カレーは前日に作り、固く冷たくする', 'こね上がり生地温 26〜28℃が目安', '衣を付けてから二次発酵。膨らませすぎない', '揚げるのは2本ずつ。網に立てかけて油を切る',
          '冷凍する場合：揚げてから冷凍し、凍ったまま200℃のオーブンかトースターで8〜10分温め直す'],
      }],
    }),

    // ───────────────────────────── ロデヴ（確定版）
    recipe({
      id: 'rodev-90',
      seedRev: 3, // 標準版の改訂番号。上げると未編集の端末は自動更新、編集済みの端末には更新の提案が出る
      name: '高加水90%ロデヴ',
      category: '高加水',
      difficulty: 3,
      tags: ['オーバーナイト', 'ハード系', '当日完成'],
      description: 'リスドォル主体の高加水ロデヴ。作り始めに「当日焼き／冷蔵発酵」を選び、イースト量だけを変える。',
      variants: [{
        id: 'std', name: '基本',
        scaleMode: 'flour', baseFlour: 250, baseCount: 2, countUnit: '個',
        yieldLabel: '2個分',
        hb: { mode: 'none', recommendation: 'not_recommended', model: '', course: '', notes: ['HB非推奨', '使用する場合は初期混合5分のみ'] },
        bakeSummary: '250℃スチーム 10分 → 230℃ 15〜18分',
        dough: { familyId: 'lean-high-hydration' },
        ingredientGroups: [
          { id: 'flour', name: '粉', kind: 'flour', items: [
            I('lys', 'リスドォル', 150), I('kitano', 'キタノカオリ', 75), I('haru', '春よ恋', 25),
          ] },
          { id: 'dough', name: 'その他', kind: 'dough', items: [
            I('water', '水', 225, { moisture: 1, note: '最初210g＋後入れ15g' }),
            I('salt', '塩', 5, { precision: 0.1 }),
            I('yeast', 'ドライイースト', 1, { precision: 0.1, byPlanG: { today: 1.0, cold: 0.5 } }),
          ] },
        ],
        steps: [
          { id: 'r1', phase: 'dough', title: '粉と水を混ぜる', uses: ['lys', 'kitano', 'haru', { ref: 'water', pctOfFlour: 84, label: '水（最初）' }],
            body: '粉3種と水{{part:water:84}}を、粉気がなくなるまで混ぜる。残りの水はまだ入れない。' },
          { id: 'r2', phase: 'dough', title: 'オートリーズ', body: 'ラップをして休ませる。', timer: { min: 20, label: 'オートリーズ' } },
          { id: 'r3', phase: 'dough', title: 'イースト・塩・残りの水を加える', uses: ['yeast', 'salt', { ref: 'water', pctOfFlour: 6, label: '残りの水' }],
            body: 'イーストと塩を加え、残りの水{{part:water:6}}を少しずつ揉み込むように加えて、全体がなじむまで混ぜる。混ぜ終えた時点の生地温は24〜26℃が目安。' },
          { id: 'r4', phase: 'dough', title: '休ませ①', body: 'ラップをして休ませる。', timer: { min: 20, label: '休ませ①' } },
          { id: 'r5', phase: 'dough', title: '1回目のフォールド', body: '生地の四方を持ち上げて中央へ折りたたむ。' },
          { id: 'r6', phase: 'dough', title: '休ませ②', body: 'ラップをして休ませる。', timer: { min: 20, label: '休ませ②' } },
          { id: 'r7', phase: 'dough', title: '2回目のフォールド', body: '生地の四方を持ち上げて中央へ折りたたむ。' },
          { id: 'r8', phase: 'dough', title: '休ませ③', body: 'ラップをして休ませる。', timer: { min: 20, label: '休ませ③' } },
          { id: 'r9', phase: 'dough', title: '3回目のフォールド', body: '生地の四方を持ち上げて中央へ折りたたむ。' },
          { id: 'route', type: 'branch', atStart: true, title: '発酵の計画', body: '作り始める時に選びます。イースト量がこの選択で決まります。',
            options: [
              { id: 'today', label: '当日焼き', icon: '🔥', sub: 'イースト0.4%・室温で一次発酵 → 当日焼成', steps: [
                // 「室温」は数値にしない（tempMode: 'ambient'）
                { id: 'td-ferm1', phase: 'dough', title: '一次発酵', body: '室温で発酵させる。',
                  ferment: { temp: '室温', tempMode: 'ambient', cue: '1.5倍前後・表面に気泡が見える' } },
                { id: 'td-div', phase: 'divide', title: '分割', body: '打ち粉をした台に出し、{{divide}}。成形はせず、形を軽く整える。' },
                { id: 'td-ferm2', phase: 'proof', title: '最終発酵', body: '布どり等で休ませる。時間より生地の状態を優先する。',
                  ferment: { temp: '室温', tempMode: 'ambient', cue: 'ひと回り膨らみ、内部にガスが保たれている', min: 40, max: 90 },
                  tips: ['終盤にオーブンを250℃で予熱（スチームの準備も）'] },
                ...RODEV_BAKE('td'),
              ] },
              { id: 'cold', label: '冷蔵発酵', icon: '❄️', sub: 'イースト0.2%・冷蔵4〜5℃で8〜15時間 → 翌日焼成', steps: [
                { id: 'cd-cold', phase: 'dough', title: '冷蔵発酵', body: '3回目のフォールド後、容器ごと冷蔵庫（4〜5℃想定）へ入れる。8時間は最短目安。通常は10〜14時間を狙い、生地の状態を優先する。', cold: { minH: 8, maxH: 15 } },
                { id: 'cd-div', phase: 'divide', title: '取り出し・分割', body: '冷蔵庫から出し、{{divide}}。成形はせず、形を軽く整える。' },
                { id: 'cd-ferm2', phase: 'proof', title: '復温・最終発酵', body: '布どり等で休ませ、復温を兼ねて最終発酵させる。時間より生地の状態を優先する。',
                  ferment: { temp: '室温', tempMode: 'ambient', cue: 'ひと回り膨らみ、内部にガスが保たれている', min: 40, max: 90 },
                  tips: ['終盤にオーブンを250℃で予熱（スチームの準備も）'] },
                ...RODEV_BAKE('cd'),
              ] },
            ] },
        ],
        tips: [
          '水は最初210g＋後入れ15g（グルテンを作ってから加水）',
          '追加モルトは使わない（リスドォルに麦芽入り）。焼き色・発酵が弱いと感じたときだけ0.1g程度を試す',
          '最終発酵は時間より「ひと回り膨らみ、ガスが保たれていること」を優先（40〜90分）',
          '混ぜ終えた時点の生地温 24〜26℃が目安',
          '冷蔵は8時間が最短目安。通常は10〜14時間',
        ],
      }],
    }),

    // ───────────────────────────── あんぱん（rev2：黒ごま標準・共通生地の部品化）
    recipe({
      id: 'anpan',
      seedRev: 2,
      name: '基本のあんぱん',
      category: '菓子パン',
      difficulty: 2,
      tags: ['当日完成', 'HB使用可', 'あんぱん'],
      description: '基本の菓子パン生地（春よ恋90%＋キタノカオリ10%）で作る定番のあんぱん。あんこ35g・中央に黒ごま。A（HB）とB（手ごね）は配合が同じ。',
      variants: [
        {
          id: 'hb', name: 'A. HBこね〜一次発酵',
          ...SWEET_BASE(),
          timeLabel: '約3〜3.5時間',
          hb: SWEET_HB(),
          ingredientGroups: ANPAN_GROUPS(),
          steps: [ANPAN_PREP('a0'), ...HB_DOUGH('a', 1), ...ANPAN_AFTER('a')],
          tips: [...ANPAN_TIPS, 'B（手ごね）とは配合・焼成が同じ。違うのはこね方と一次発酵の環境'],
        },
        {
          id: 'hand', name: 'B. 手ごね',
          ...SWEET_BASE(),
          timeLabel: '約3〜3.5時間',
          hb: { mode: 'none', label: '手ごね', recommendation: 'not_recommended', model: '', course: '', notes: ['手ごね（HBは使わない）'] },
          ingredientGroups: ANPAN_GROUPS(),
          steps: [
            ANPAN_PREP('h0'),
            { id: 'h1', phase: 'dough', title: '材料を混ぜる', uses: ['haru', 'kitano', 'sugar', 'salt', 'yeast', { ref: 'milk', show: 'min' }, 'egg'],
              body: 'ボウルに粉2種・砂糖・塩・ドライイーストを入れる（塩の上にイーストを置かない）。牛乳{{min:milk}}と溶き卵{{g:egg}}を加え、粉気がなくなるまで混ぜる。硬ければ牛乳を最大{{max:milk}}まで足す。バターはまだ入れない。' },
            { id: 'h2', phase: 'dough', title: '休ませる', body: 'ラップをして休ませる。水分をなじませて手ごねを楽にするための時間。',
              timer: { min: 5, max: 10, label: '水分をなじませる' } },
            { id: 'h3', phase: 'dough', title: '一次こね', body: '台に出してこねる。生地がつながり、表面が少し滑らかになったら次へ。',
              timer: { min: 5, max: 8, label: '一次こね' } },
            { id: 'h4', phase: 'dough', title: 'バターを加える', uses: ['butter'], body: '柔らかくした無塩バターを加え、そのままこね続ける。',
              tips: ['バター投入直後に生地が一度バラバラになるのは正常'] },
            { id: 'h5', phase: 'dough', title: '本ごね', body: '時間より生地の状態で判断する。薄く伸ばすと指が透ける膜ができればOK。',
              timer: { min: 8, max: 15, label: '本ごね' } },
            { id: 'h6', phase: 'dough', title: '生地温を確認', body: 'こね上がりの生地温は26〜28℃が目安。記録の「生地温」に残しておく。',
              tips: ['28℃を超えたときは発酵が速くなりやすい。時間より「約2倍」の状態を優先する', '次回は牛乳の温度を下げる'] },
            { id: 'h7', phase: 'dough', title: '一次発酵', body: '丸めてボウルへ。時間より膨らみを優先する。',
              ferment: { temp: '28〜30℃', tempMode: 'range', tempMin: 28, tempMax: 30, cue: '約2倍', min: 60, max: 90 } },
            ...ANPAN_AFTER('h'),
          ],
          tips: [
            '配合・焼成はAと同じ。違うのはこね方と一次発酵の環境',
            'こね上がり生地温 26〜28℃が目安',
            '本ごねは時間より膜の状態を優先',
            ...ANPAN_TIPS,
          ],
        },
      ],
    }),

    // ───────────────────────────── クリームパン
    recipe({
      id: 'cream-pan',
      seedRev: 1,
      name: '基本のクリームパン',
      category: '菓子パン',
      difficulty: 3,
      tags: ['当日完成', 'HB使用可', 'クリームパン', '自家製カスタード'],
      description: '基本の菓子パン生地に、自家製カスタード35gを包むグローブ型。',
      variants: [{
        id: 'hb', name: 'HBこね〜一次発酵',
        ...SWEET_BASE(),
        timeLabel: '約3.5〜4時間',
        timeNote: 'カスタードを前日に用意しておけば約3〜3.5時間',
        hb: SWEET_HB(),
        ingredientGroups: [
          ...SWEET_DOUGH_GROUPS(),
          CUSTARD_PREP(),
          { id: 'filling', name: 'フィリング', kind: 'filling', items: [
            { id: 'custard', name: 'カスタード', perCount: { target: 35 }, madeBy: 'custard', note: '1個35g・冷えたものを使う' },
          ] },
          { id: 'finish', name: '仕上げ', kind: 'finish', items: [EGGWASH()] },
        ],
        steps: [
          { id: 'cp0', phase: 'prep', title: 'カスタードを炊く', uses: ['cu-milk', 'cu-yolk', 'cu-sugar', 'cu-starch', 'cu-butter', 'cu-vanilla'],
            body: 'カスタードを{{batch:custard}}炊く。卵黄と砂糖を混ぜ、コーンスターチを加える。温めた牛乳を少しずつ加えて鍋に戻し、混ぜながら加熱する。しっかり沸騰してとろみが付いてから約30秒加熱し、火を止めてバターとバニラを混ぜる。' },
          { id: 'cp1', phase: 'prep', parallel: true, title: 'カスタードを冷やす',
            body: 'バットに薄く広げ、表面にラップを密着させて、包める硬さまで冷やす。冷やしている間に生地作りを始めてよい（タイマーは次の工程に進んでも動き続ける）。',
            timer: { min: 30, max: 60, label: 'カスタードを冷やす' } },
          ...HB_DOUGH('cp', 2),
          SWEET_DIVIDE('cp'),
          { id: 'cp-shape', phase: 'shape', title: 'カスタードを包む・グローブ型', uses: ['custard'],
            body: '生地を楕円形に伸ばす（中央はやや厚く、縁は少し薄め）。冷えたカスタード{{per:custard}}を置いて半月形に二つ折りにし、縁をしっかり閉じる。丸い側から4〜5本の切り込みを入れてグローブ型にする。',
            tips: ['閉じ目にカスタードを付けない', '切り込みはカスタードまで届かせない', '冷やしたカスタードは練り直しすぎない（へらで軽くほぐす程度）'] },
          SWEET_PROOF('cp'),
          { id: 'cp-glaze', phase: 'top', title: '艶出し', uses: ['eggwash'], body: '表面に溶き卵を薄く塗る。', tips: GLAZE_TIPS },
          SWEET_BAKE('cp', ['12分で切り込み部分の焼き色を確認']),
          SWEET_COOL('cp', '網にのせて冷ます。カスタード入りは当日中に食べるのが基本。残りは冷蔵保存。'),
        ],
        tips: [
          '基準は粉200g・8個（生地 約49g＋カスタード35g）',
          'カスタードは4個分単位で仕込む（1回に炊くのは最大8個分）',
          '冷えたカスタードは練り直しすぎない。へらで軽くほぐす程度',
          '閉じ目にカスタードを付けない',
          '切り込みはカスタードまで届かせない',
          '12分で切り込み部分の焼き色を確認',
          'カスタード入りは当日中を基本に。残りは冷蔵保存',
          '余ったカスタードは冷蔵で翌日まで',
          '全卵1個を溶き、生地用に20g取り分け、残りを艶出しに使う',
          '手ごねの場合は、菓子パン生地の手ごね手順（混合→休ませ→一次こね→バター→本ごね→生地温26〜28℃）で',
        ],
      }],
    }),

    // ───────────────────────────── チョコ包みパン
    recipe({
      id: 'choco-pan',
      seedRev: 1,
      name: '基本のチョコ包みパン',
      category: '菓子パン',
      difficulty: 2,
      tags: ['当日完成', 'HB使用可', 'チョコ'],
      description: '基本の菓子パン生地に、チョコ18gを包むプレーンな丸型。',
      variants: [{
        id: 'hb', name: 'HBこね〜一次発酵',
        ...SWEET_BASE(),
        timeLabel: '約3〜3.5時間',
        hb: SWEET_HB(),
        ingredientGroups: [
          ...SWEET_DOUGH_GROUPS(),
          { id: 'filling', name: 'フィリング', kind: 'filling', items: [
            { id: 'choco', name: '焼成用チョコ（または板チョコ）', perCount: { target: 18, min: 15, max: 20 }, note: '2〜3片にまとめる' },
          ] },
          { id: 'finish', name: '仕上げ', kind: 'finish', items: [EGGWASH()] },
        ],
        steps: [
          { id: 'ch0', phase: 'prep', title: 'チョコを分ける', uses: ['choco'],
            body: 'チョコを{{count}}等分（1個{{per:choco}}）に分け、板状なら2〜3片程度にまとめる。細かく砕きすぎない。' },
          ...HB_DOUGH('ch', 1),
          SWEET_DIVIDE('ch'),
          { id: 'ch-wrap', phase: 'shape', title: 'チョコを包む', uses: ['choco'],
            body: '生地を円形に伸ばす（中央はやや厚く、周囲は少し薄め）。中央にチョコを置き、周囲の生地を集めてしっかり閉じる。閉じ目を下にして丸く整え、手のひらでごく軽く押さえて安定させる。',
            tips: ['チョコを閉じ目に挟まない'] },
          SWEET_PROOF('ch'),
          { id: 'ch-glaze', phase: 'top', title: '艶出し', uses: ['eggwash'], body: '表面に溶き卵を薄く塗る。トッピングはしない（プレーンの丸型）。', tips: GLAZE_TIPS },
          SWEET_BAKE('ch'),
          SWEET_COOL('ch', '網にのせて冷ます。焼きたては中のチョコが熱いので少し冷ましてから。'),
        ],
        tips: [
          '基準は粉200g・8個（生地 約49g＋チョコ18g）',
          '焼成用チョコ、または市販の板チョコが標準',
          'クーベルチュールは溶けて漏れやすい',
          'チョコを閉じ目に挟まない',
          '焼きたては中のチョコが熱いので少し冷ましてから',
          'チョコチップを生地に練り込む方式にはしない（生地が変わるため）',
          '全卵1個を溶き、生地用に20g取り分け、残りを艶出しに使う',
          '手ごねの場合は、菓子パン生地の手ごね手順（混合→休ませ→一次こね→バター→本ごね→生地温26〜28℃）で',
        ],
      }],
    }),

    // ───────────────────────────── 食パン（2 variants）
    recipe({
      id: 'shokupan-junnama',
      seedRev: 3,
      name: 'ふわもち純生食パン',
      category: '食パン',
      difficulty: 2,
      tags: ['当日完成', '手ごね'],
      description: 'しっとりふわもち。HB全自動、HB＋12cm角型、手ごね＋12cm角型の3通り。BとCは配合が同じなので、こね方の違いを記録で比べられる。',
      variants: [
        {
          id: 'hb-auto', name: 'A. HB全自動',
          scaleMode: 'flour', baseFlour: 250,
          yieldLabel: '1斤',
          hb: { mode: 'full_auto', recommendation: 'recommended', model: 'siroca SB-2D271', course: '食パン／ソフト系', notes: ['焼き色「淡め」'] },
          dough: { familyId: 'rich-shokupan' },
          mix: false, // HB全自動：途中で生地を取り出せないので、同時製作の対象外
          bakeSummary: 'HB 食パン／ソフト系コース・焼き色 淡め',
          ingredientGroups: [
            { id: 'flour', name: '粉', kind: 'flour', items: [I('haru', '春よ恋', 220), I('kitano', 'キタノカオリ', 30)] },
            { id: 'dough', name: 'その他', kind: 'dough', items: [
              I('milk', '牛乳', 160, { moisture: 0.88 }),
              I('water', '水', 25, { moisture: 1 }),
              I('cream', '生クリーム', 25, { moisture: 0.5 }),
              I('sugar', '砂糖', 18),
              I('honey', 'はちみつ', 15, { moisture: 0.2 }),
              I('salt', '塩', 4, { precision: 0.1 }),
              I('butter', '無塩バター', 25),
              I('yeast', 'ドライイースト', 3, { precision: 0.1 }),
            ] },
          ],
          steps: [
            { id: 'a1', phase: 'dough', title: 'HBへ材料を投入',
              uses: ['haru', 'kitano', 'milk', 'water', 'cream', 'sugar', 'honey', 'salt', 'butter', 'yeast'],
              body: '機種の説明書に従う順番で投入する。イースト専用投入口がある場合はそこへ。' },
            { id: 'a2', phase: 'bake', title: 'コースを開始', body: '食パンまたはソフト系コース。焼き色は「淡め」。',
              bake: { method: 'hb' },
              hb: 'siroca SB-2D271：食パン／ソフト系コース、焼き色 淡め' },
            { id: 'a3', phase: 'after', title: '取り出す', body: '焼き上がったらすぐケースから出して網にのせる。' },
            { id: 'a4', phase: 'after', title: '袋に入れる', body: '粗熱が取れ、まだ少し温かいうちに袋へ入れる。クラストへ少し水分を戻して、耳を柔らかくする。' },
          ],
          tips: ['この食パンではモルトとリスドォルは使わない', '有塩バター使用時は塩を0.5g減らす'],
        },
        {
          id: 'hb-pan12', name: 'B. HB＋12cm角型',
          scaleMode: 'panVolume', baseFlour: 250,
          basePan: { name: '蓋付き12cm角型', w: 12, d: 12, h: 12 },
          yieldLabel: '12cm角型 1本',
          equipment: ['蓋付き12cm角型'],
          hb: { mode: 'knead_first_fermentation', recommendation: 'recommended', model: 'siroca SB-2D271', course: 'パン生地コース', notes: ['こね〜一次発酵までHB'] },
          bakeSummary: '210℃予熱 → 195℃ 30〜33分',
          timeLabel: '約2.5〜3.5時間',
          dough: { familyId: 'rich-shokupan' },
          ingredientGroups: PAN12_GROUPS(),
          steps: [
            { id: 'b1', phase: 'dough', title: 'HBでこね〜一次発酵',
              uses: ['haru', 'kitano', 'milk', 'water', 'cream', 'sugar', 'honey', 'salt', 'butter', 'yeast'],
              body: 'パン生地コースを使用。一次発酵終了時の目安は約2倍。',
              hb: 'siroca SB-2D271：パン生地コース（こね〜一次発酵）' },
            { id: 'b2', phase: 'divide', title: '分割・ベンチ', body: '2分割して軽く丸め、休ませる。', timer: { min: 15, label: 'ベンチタイム' } },
            { id: 'b3', phase: 'shape', title: '成形', body: '縦長に伸ばす。左右を中央へ折り、軽く伸ばして上から巻く。同じものを2本作り、巻き終わりを下にして型へ入れる。' },
            { id: 'b4', phase: 'proof', title: '二次発酵', body: '時間固定ではなく高さを優先して判定する。',
              ferment: { temp: '32〜35℃', tempMode: 'range', tempMin: 32, tempMax: 35, cue: '生地頂点が型の縁より約1cm下 → 蓋をする' },
              tips: ['終盤に210℃で予熱を開始', '初回は「型の縁より約1cm下」で蓋をする'] },
            { id: 'b5', phase: 'bake', title: '焼成', body: '210℃で予熱 → 195℃で焼く。焼き不足なら2〜3分追加。', timer: { min: 30, max: 33, label: '焼成 195℃' },
              bake: { method: 'oven', preheat: 210, temp: 195, min: 30, max: 33, steam: false, vessel: 'pan' } },
            { id: 'b6', phase: 'after', title: '焼成後', uses: ['mbutter'], body: '型に軽くショックを与え、すぐ型から取り出す。好みで表面に溶かしバターを薄く塗る。' },
            { id: 'b7', phase: 'after', title: '冷却', body: '粗熱を取り、まだ少し温かい段階で袋へ。' },
          ],
          tips: [
            '基準は粉250g・総生地量 約500g（12cm角型＝1728cm³で型比容積 約3.45）',
            '角が丸すぎる → 二次発酵不足',
            '角が鋭すぎる、側面がへこむ → 発酵しすぎ',
            '初回は「型の縁より約1cm下」で蓋をする',
            '有塩バター使用時は塩を0.5g減らす',
            'この食パンではモルトとリスドォルは使わない',
            'C（手ごね）とは配合・型・焼成が同じ。ただし一次発酵の環境が違うので、純粋なこね方だけの比較ではない',
          ],
        },
        {
          id: 'hand-pan12', name: 'C. 手ごね＋12cm角型',
          scaleMode: 'panVolume', baseFlour: 250,
          basePan: { name: '蓋付き12cm角型', w: 12, d: 12, h: 12 },
          yieldLabel: '12cm角型 1本',
          equipment: ['蓋付き12cm角型'],
          hb: { mode: 'none', label: '手ごね', recommendation: 'not_recommended', model: '', course: '', notes: ['手ごね（HBは使わない）'] },
          bakeSummary: '210℃予熱 → 195℃ 30〜33分',
          timeLabel: '約3〜4時間',
          dough: { familyId: 'rich-shokupan' },
          ingredientGroups: PAN12_GROUPS(),
          steps: [
            { id: 'h1', phase: 'dough', title: '材料を混ぜる',
              uses: ['haru', 'kitano', 'sugar', 'salt', 'yeast', 'milk', 'cream', 'honey', 'water'],
              body: 'ボウルに粉2種・砂糖・塩・ドライイーストを入れる（塩の上にイーストを置かない）。別容器で牛乳・生クリーム・はちみつ・水を混ぜて加え、ヘラやカードで粉気がなくなるまで混ぜる。バターはまだ入れない。' },
            { id: 'h2', phase: 'dough', title: '休ませる', body: 'ラップをして休ませる。発酵ではなく、水分をなじませて手ごねを楽にするための時間。',
              timer: { min: 10, label: '水分をなじませる' } },
            { id: 'h3', phase: 'dough', title: '一次こね', body: '台に出してこねる。打ち粉は原則使わず、「押す・折る・転がす」を繰り返す。生地がつながり、表面が少し滑らかになったら次へ。',
              timer: { min: 5, max: 8, label: '一次こね' },
              tips: ['べたつくうちはカードで台から剥がしながら続ける'] },
            { id: 'h4', phase: 'dough', title: 'バターを加える', uses: ['butter'],
              body: '柔らかくした無塩バターを加え、そのままこね続ける。',
              tips: ['バター投入直後に生地が一度バラバラになるのは正常'] },
            { id: 'h5', phase: 'dough', title: '本ごね', body: '時間より生地の状態で判断する。滑らかで弾力があり、薄く伸ばすと指が透ける膜ができればOK。完全に破れない極薄膜まで追い込む必要はない。',
              timer: { min: 8, max: 15, label: '本ごね' } },
            { id: 'h6', phase: 'dough', title: '生地温を確認', body: 'こね上がりの生地温は26〜28℃が目安。記録の「生地温」に残しておく。',
              tips: ['28℃を超えたときは発酵が速くなりやすい。時間より「約2倍」の状態を優先する', '次回は牛乳などの液温を下げる'] },
            { id: 'h7', phase: 'dough', title: '一次発酵', body: '丸めてボウルへ。時間より膨らみを優先する。',
              ferment: { temp: '28〜30℃', tempMode: 'range', tempMin: 28, tempMax: 30, cue: '約2倍', min: 60, max: 90 } },
            { id: 'h8', phase: 'divide', title: '分割・ベンチ', body: '2分割して軽く丸め、休ませる。', timer: { min: 15, label: 'ベンチタイム' } },
            { id: 'h9', phase: 'shape', title: '成形', body: '縦長に伸ばす。左右を中央へ折り、軽く伸ばして上から巻く。同じものを2本作り、巻き終わりを下にして型へ入れる。' },
            { id: 'h10', phase: 'proof', title: '二次発酵', body: '時間固定ではなく高さを優先して判定する。',
              ferment: { temp: '32〜35℃', tempMode: 'range', tempMin: 32, tempMax: 35, cue: '生地頂点が型の縁より約1cm下 → 蓋をする', min: 45, max: 75 },
              tips: ['終盤に210℃で予熱を開始', '初回は「型の縁より約1cm下」で蓋をする'] },
            { id: 'h11', phase: 'bake', title: '焼成', body: '210℃で予熱 → 195℃で焼く。焼き不足なら2〜3分追加。', timer: { min: 30, max: 33, label: '焼成 195℃' },
              bake: { method: 'oven', preheat: 210, temp: 195, min: 30, max: 33, steam: false, vessel: 'pan' } },
            { id: 'h12', phase: 'after', title: '焼成後', uses: ['mbutter'], body: '型に軽くショックを与え、すぐ型から取り出す。好みで表面に溶かしバターを薄く塗る。' },
            { id: 'h13', phase: 'after', title: '冷却', body: '粗熱を取り、まだ少し温かい段階で袋へ。' },
          ],
          tips: [
            '配合・型・焼成はBと同じ。違うのはこね方と一次発酵の環境',
            '基準は粉250g・総生地量 約500g（12cm角型＝1728cm³で型比容積 約3.45）',
            'こね上がり生地温 26〜28℃が目安（ロデヴの24〜26℃とは別）',
            '本ごねは時間より膜の状態を優先',
            '角が丸すぎる → 二次発酵不足 ／ 角が鋭すぎる、側面がへこむ → 発酵しすぎ',
            '有塩バター使用時は塩を0.5g減らす',
          ],
        },
      ],
    }),

    // ───────────────────────────── 外パリ中ふわフランスパン（4つの形）
    recipe({
      id: 'french-soft',
      seedRev: 1,
      name: '外パリ中ふわフランスパン',
      category: 'ハード系',
      difficulty: 3,
      tags: ['当日完成'],
      description: 'ザクザクではなく、外は薄くパリッ、中はふんわり柔らかいフランスパン。春よ恋60％＋リスドォル40％・加水69％の共通生地で、バゲット／バタール／クッペ／明太フランスの4つの形に。',
      variants: [
        {
          id: 'baguette', name: 'バゲット', ...FR_BASE(2, '2本分', '本'),
          bakeSummary: '250℃蒸気 7分 → 220℃ 10〜12分',
          ingredientGroups: FR_GROUPS(),
          steps: [
            ...FR_DOUGH('bg'),
            { id: 'bg6', phase: 'shape', title: '成形', body: '軽く長方形に広げ、上下を中央へ折って巻き、綴じ目を閉じる。中央から外へ転がし、約30〜40cmに伸ばす（オーブンの天板に合わせる）。' },
            FR_PROOF('bg'),
            { id: 'bg8', phase: 'top', title: 'クープ', body: '斜めに3〜4本、刃を寝かせて浅めに入れる。' },
            { id: 'bg-bake1', phase: 'bake', title: '焼成①', body: '250℃・蒸気あり。', timer: { min: 7, label: '焼成① 250℃' },
              bake: { method: 'oven', preheat: 250, temp: 250, min: 7, max: 7, steam: true } },
            { id: 'bg-bake2', phase: 'bake', title: '焼成②', body: '蒸気を止め、220℃に下げて焼く。濃い色まで焼かず、しっかりきつね色で止める。', timer: { min: 10, max: 12, label: '焼成② 220℃' },
              bake: { method: 'oven', temp: 220, min: 10, max: 12, steam: false },
              tips: ['薄い色で止めると皮がすぐしんなりする。パリッとさせるにはきつね色まで'] },
            FR_COOL('bg'),
          ],
          tips: ['細めなので焼きすぎると硬くなりやすい', 'クープは斜めに3〜4本・浅め', FR_STEAM_TIP],
        },
        {
          id: 'batard', name: 'バタール', ...FR_BASE(1, '1本分', '本'),
          bakeSummary: '250℃予熱 → 230℃蒸気 7分 → 215℃ 18〜23分',
          ingredientGroups: FR_GROUPS(),
          steps: [
            ...FR_DOUGH('bt'),
            { id: 'bt6', phase: 'shape', title: '成形', body: '長方形に広げて上下を中央へ折り、巻いて綴じ目を閉じる。両端を少し細くし、約25〜28cmに整える。' },
            FR_PROOF('bt'),
            { id: 'bt8', phase: 'top', title: 'クープ', body: '斜めに2〜3本、刃を寝かせて浅めに入れる。' },
            { id: 'bt-bake1', phase: 'bake', title: '焼成①', body: '250℃で予熱し、入れたら230℃に下げる。蒸気あり。', timer: { min: 7, label: '焼成① 230℃' },
              bake: { method: 'oven', preheat: 250, temp: 230, min: 7, max: 7, steam: true } },
            { id: 'bt-bake2', phase: 'bake', title: '焼成②', body: '蒸気を止め、215℃で焼く。中程度のきつね色まで。中心温度を測れる場合は95℃前後が目安。', timer: { min: 18, max: 23, label: '焼成② 215℃' },
              bake: { method: 'oven', temp: 215, min: 18, max: 23, steam: false },
              tips: ['焼き色が付いても中心温度が低ければ数分追加する', '底を叩いて軽い音がすれば焼き上がり'] },
            FR_COOL('bt', '網の上で20分以上冷ます。温かいうちは袋に入れない。'),
          ],
          tips: ['1本で焼くので、バゲットより長めに焼く', FR_STEAM_TIP],
        },
        {
          id: 'coupe', name: 'クッペ', ...FR_BASE(4, '4個分', '個'),
          bakeSummary: '250℃予熱 → 230℃蒸気 6分 → 210℃ 7〜9分',
          ingredientGroups: FR_GROUPS(),
          steps: [
            ...FR_DOUGH('cu'),
            { id: 'cu6', phase: 'shape', title: '成形', body: '軽く楕円に広げ、上下を中央へ折って巻き、綴じ目を閉じる。両端を細め、約13〜15cmの舟形に整える。' },
            FR_PROOF('cu'),
            { id: 'cu8', phase: 'top', title: 'クープ', body: '中央に長いクープを1本入れる。' },
            { id: 'cu-bake1', phase: 'bake', title: '焼成①', body: '250℃で予熱し、入れたら230℃に下げる。蒸気あり。', timer: { min: 6, label: '焼成① 230℃' },
              bake: { method: 'oven', preheat: 250, temp: 230, min: 6, max: 6, steam: true } },
            { id: 'cu-bake2', phase: 'bake', title: '焼成②', body: '蒸気を止め、210℃で焼く。淡い色より少ししっかり、きつね色まで。', timer: { min: 7, max: 9, label: '焼成② 210℃' },
              bake: { method: 'oven', temp: 210, min: 7, max: 9, steam: false } },
            FR_COOL('cu'),
          ],
          tips: ['プレーンで食べる用。明太フランスにするときは「明太フランス」の焼き方で（一度目は淡く焼く）', FR_STEAM_TIP],
        },
        {
          id: 'mentai', name: '明太フランス', ...FR_BASE(4, '4個分', '個'),
          timeLabel: '約3.5〜4時間',
          bakeSummary: '230℃蒸気 6分 → 210℃ 5〜7分 → 明太バターを塗って190℃ 4〜6分',
          ingredientGroups: FR_GROUPS([
            { id: 'filling', name: '明太バター', kind: 'filling', items: [
              { id: 'mentaiko', name: '明太子（薄皮を除く）', perCount: { target: 12.5 }, note: '4個で50g。控えめにするなら2/3量' },
              { id: 'mbutter', name: '無塩バター（柔らかくする）', perCount: { target: 11.25 } },
              { id: 'mayo', name: 'マヨネーズ', perCount: { target: 3 } },
              { id: 'lemon', name: 'レモン汁（好みで）', text: '少量' },
            ] },
          ]),
          steps: [
            { id: 'mt0', phase: 'prep', title: '明太バターを作る', uses: ['mentaiko', 'mbutter', 'mayo', 'lemon'],
              body: '明太子の薄皮を除き、柔らかくしたバター・マヨネーズ・レモン汁（好みで）と混ぜる。塗るまで室温に置いておく（暑い時期は冷蔵し、塗る前に柔らかくする）。',
              tips: ['子ども用は明太子を少なめにして別に取り分ける'] },
            ...FR_DOUGH('mt'),
            { id: 'mt6', phase: 'shape', title: '成形', body: '軽く楕円に広げ、上下を中央へ折って巻き、綴じ目を閉じる。両端を細め、約13〜15cmの舟形に整える。' },
            FR_PROOF('mt'),
            { id: 'mt8', phase: 'top', title: 'クープ', body: '中央に長いクープを1本入れる。' },
            { id: 'mt-bake1', phase: 'bake', title: '一度目の焼成①', body: '250℃で予熱し、入れたら230℃に下げる。蒸気あり。', timer: { min: 6, label: '焼成① 230℃' },
              bake: { method: 'oven', preheat: 250, temp: 230, min: 6, max: 6, steam: true } },
            { id: 'mt-bake2', phase: 'bake', title: '一度目の焼成②', body: '蒸気を止め、210℃で焼く。完全に焼き切らず、淡いきつね色で取り出す。', timer: { min: 5, max: 7, label: '焼成② 210℃' },
              bake: { method: 'oven', temp: 210, min: 5, max: 7, steam: false } },
            { id: 'mt9', phase: 'top', title: '明太バターを塗る', uses: ['mentaiko', 'mbutter', 'mayo'],
              body: '5分ほど粗熱を取る。クープの切れ目を浅く広げ、明太バターを{{count}}等分して塗る。側面まで切り開かない。オーブンは190℃にしておく。',
              timer: { min: 5, label: '粗熱を取る' } },
            { id: 'mt-bake3', phase: 'bake', title: '二度焼き', body: '190℃で焼く。バターが溶け、表面が乾いて軽く色づいたら止める。焼きすぎるとパンが硬くなる。', timer: { min: 4, max: 6, label: '二度焼き 190℃' },
              bake: { method: 'oven', temp: 190, min: 4, max: 6, steam: false } },
            FR_COOL('mt', '5分ほど休ませ、温かいうちに食べる。'),
          ],
          tips: ['明太子は薄皮を除いて計量', '辛さは明太子の種類で調整', '一度目は淡く焼く（二度焼きで色が付く）', FR_STEAM_TIP],
        },
      ],
    }),
  ];
}

/** Non-destructive upgrades for data already saved on the device. */
export function migrateRecipes(recipes, fromVersion) {
  const changed = [];
  // 破壊的な置き換えより前に「ユーザーが編集したか」を判定しておく
  const edited = (r) => (r.userEdited != null ? !!r.userEdited : inferUserEdited(r));
  if (fromVersion < 2) {
    const r = recipes.find((x) => x.id === 'rodev-90');
    const v = r && !edited(r) ? r.variants.find((x) => x.id === 'std') : null;
    if (v) {
      let touched = false;
      if (v.baseCount == null) { v.baseCount = 2; v.countUnit = '個'; touched = true; }
      const fix = (steps) => steps.forEach((s) => {
        if (typeof s.body === 'string' && s.body.includes('2等分') && /div$/.test(s.id)) { s.body = s.body.replace('2等分', '{{divide}}'); touched = true; }
        if (s.type === 'branch') s.options.forEach((o) => fix(o.steps));
      });
      fix(v.steps);
      if (touched) changed.push(r);
    }
  }
  if (fromVersion < 3) {
    // ロデヴ確定版：作り始めに当日／冷蔵を選び、イースト量を切り替える。追加モルトなし。
    const i = recipes.findIndex((x) => x.id === 'rodev-90');
    // 編集済みのロデヴは置き換えない（後で「新しい標準版があります」として提案される）
    if (i >= 0 && !edited(recipes[i])) {
      const old = recipes[i];
      const fresh = buildSeedRecipes().find((x) => x.id === 'rodev-90');
      fresh.favorite = old.favorite;
      fresh.version = (old.version || 1) + 1;
      fresh.createdAt = old.createdAt || fresh.createdAt;
      fresh.changeLog = [...(old.changeLog || []), { version: fresh.version, at: Date.now(), note: '確定版：当日0.4%／冷蔵0.2%、追加モルトなし、水210＋15g' }];
      fresh._previous = old; // app stores this into recipeVersions
      fresh.userEdited = false;
      recipes[i] = fresh;
      if (!changed.includes(fresh)) changed.push(fresh);
      const j = changed.findIndex((x) => x.id === 'rodev-90' && x !== fresh);
      if (j >= 0) changed.splice(j, 1);
    }
  }
  if (fromVersion < 5) {
    // 中身を変えないメタデータの追加（seedRev は上げない）
    const seeds = buildSeedRecipes();
    for (const r of recipes) {
      const sr = seeds.find((x) => x.id === r.id);
      if (!sr) continue;
      let touched = false;
      for (const v of r.variants || []) {
        const sv = sr.variants.find((x) => x.id === v.id);
        if (!sv) continue;
        if (sv.dough && !v.dough) { v.dough = { ...sv.dough }; touched = true; }
        // 材料キー（配合の指紋用）：同じ id・同じ名前の材料にだけ付ける
        for (const g of v.ingredientGroups || []) {
          const sg = sv.ingredientGroups.find((x) => x.id === g.id);
          if (!sg) continue;
          for (const it of g.items) {
            const si = sg.items.find((x) => x.id === it.id);
            if (si?.ingKey && !it.ingKey && norm(si.name) === norm(it.name)) { it.ingKey = si.ingKey; touched = true; }
          }
        }
        if (applyStepMeta(v, sv)) touched = true;
      }
      if (touched && !changed.includes(r)) changed.push(r);
    }
  }
  if (fromVersion < 6) {
    // v1.0〜v1.1.2 の編集画面の不具合の修復：空欄の最小・最大が 0% として保存されていた
    // 既知の制限：標準レシピの材料に対して意図的に設定した「最小0%」は、この不具合由来のものと
    // 区別できないため、標準に最小が無い材料では取り除かれる（自作レシピの最小0%・最大が正の値の組は残す）
    const seeds = buildSeedRecipes();
    for (const r of recipes) {
      let touched = false;
      for (const v of r.variants || []) {
        const sv = seeds.find((x) => x.id === r.id)?.variants.find((x) => x.id === v.id);
        for (const g of v.ingredientGroups || []) {
          for (const it of g.items) {
            const p = it.pct;
            if (!p || !(+p.target > 0)) continue;
            const si = sv?.ingredientGroups.find((x) => x.id === g.id)?.items.find((x) => x.id === it.id);
            const maxArtifact = p.max === 0;
            if (maxArtifact) { delete p.max; touched = true; }
            if (p.min === 0 && (maxArtifact || (si && si.pct && si.pct.min == null))) { delete p.min; touched = true; }
          }
        }
      }
      if (touched && !changed.includes(r)) changed.push(r);
    }
  }
  if (fromVersion < 7) {
    // V1.5：同時製作の判定用メタデータ（phase・ferment.tempMode/tempMin/tempMax・bake・系統・mix）だけを足す。
    // 本文・配合は変えないので seedRev は上げず、「新しい標準版があります」も出さない。
    const seeds = buildSeedRecipes();
    for (const r of recipes) {
      const sr = seeds.find((x) => x.id === r.id);
      if (!sr) continue;
      let touched = false;
      for (const v of r.variants || []) {
        const sv = sr.variants.find((x) => x.id === v.id);
        if (!sv) continue;
        // 系統：配合が標準と同じときだけ付ける（編集で配合を変えた variant には付けない）
        if (sv.dough && !v.dough?.familyId && safeSig(v) === safeSig(sv)) { v.dough = { ...(v.dough || {}), ...sv.dough }; touched = true; }
        // HB全自動など：HBの使い方が標準と同じときだけ mix:false を付ける
        if (sv.mix === false && v.mix == null && v.hb?.mode === sv.hb?.mode) { v.mix = false; touched = true; }
        // 工程：標準と完全に同じ variant にだけ付ける（v1.1.0 と同じ基準）
        if (applyStepMeta(v, sv)) touched = true;
      }
      if (touched && !changed.includes(r)) changed.push(r);
    }
  }
  return changed;
}
const safeSig = (v) => { try { return doughSignature(v); } catch { return null; } };

const norm = (x) => String(x ?? '').normalize('NFKC').replace(/\s+/g, '');

/* phase などの工程メタデータは、工程IDの並びと構造化値が標準版と完全一致する variant にだけ、全工程まとめて付ける */
function flatSteps(steps, out = []) {
  for (const s of steps || []) {
    out.push(s);
    if (s.type === 'branch') for (const o of s.options || []) flatSteps(o.steps, out);
  }
  return out;
}
function stepStruct(s) {
  // 見出しと構造化された値を比べる（本文 body の言い回しは無視）
  const f = s.ferment ? { temp: s.ferment.temp ?? null, min: s.ferment.min ?? null, max: s.ferment.max ?? null, cue: s.ferment.cue ?? null } : null;
  const t = s.timer ? { min: s.timer.min ?? null, max: s.timer.max ?? null } : null;
  const c = s.cold ? { minH: s.cold.minH ?? null, maxH: s.cold.maxH ?? null } : null;
  const b = s.type === 'branch' ? { atStart: !!s.atStart, options: (s.options || []).map((o) => o.id) } : null;
  return JSON.stringify({ type: s.type || 'step', title: s.title ?? null, t, f, c, b });
}
const META_KEYS = ['phase', 'parallel', 'bake'];
export function applyStepMeta(v, sv) {
  const A = flatSteps(v.steps), B = flatSteps(sv.steps);
  if (!B.some((s) => s.phase)) return false;                       // 標準版にメタデータがない
  if (A.every((s) => s.type === 'branch' || s.phase)) return false; // もう付いている
  if (A.length !== B.length || A.some((s, i) => s.id !== B[i].id)) return false;
  if (A.some((s, i) => stepStruct(s) !== stepStruct(B[i]))) return false;
  // 焼成工程は温度が本文に書かれているので、本文・焼成の要約まで標準と同じときだけ付ける
  if (A.some((s, i) => (B[i].phase === 'bake' || B[i].bake) && norm(s.body) !== norm(B[i].body))) return false;
  if (B.some((s) => s.phase === 'bake' || s.bake) && norm(v.bakeSummary) !== norm(sv.bakeSummary)) return false;
  A.forEach((s, i) => {
    const src = B[i];
    for (const k of META_KEYS) if (src[k] != null && s[k] == null) s[k] = JSON.parse(JSON.stringify(src[k]));
    if (s.ferment && src.ferment) {
      if (src.ferment.tempMode != null && s.ferment.tempMode == null) s.ferment.tempMode = src.ferment.tempMode;
      if (src.ferment.tempMin != null && s.ferment.tempMin == null) s.ferment.tempMin = src.ferment.tempMin;
      if (src.ferment.tempMax != null && s.ferment.tempMax == null) s.ferment.tempMax = src.ferment.tempMax;
    }
  });
  return true;
}

/** Did the user change this recipe after it last came from the standard (seed) version? */
export function inferUserEdited(r) {
  const log = r.changeLog || [];
  let last = -1;
  log.forEach((c, i) => { if (c.note === '初期登録' || (c.note || '').startsWith('確定版') || (c.note || '').startsWith('標準版')) last = i; });
  return log.length - 1 > last;
}
