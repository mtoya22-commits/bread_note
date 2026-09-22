// Initial recipes. Written in grams for readability, then normalized to baker's % (the stored truth).
export const SEED_VERSION = 2;

// ingredient helper: g = number | {target,min,max}
const I = (id, name, g, o = {}) => ({ id, name, g, ...o });

function normalizeVariant(v) {
  const base = v.baseFlour;
  for (const grp of v.ingredientGroups) {
    for (const it of grp.items) {
      if (it.g != null) {
        const gg = typeof it.g === 'number' ? { target: it.g } : it.g;
        it.basis = 'flour';
        it.pct = {};
        for (const k of ['target', 'min', 'max']) if (gg[k] != null) it.pct[k] = (gg[k] / base) * 100;
        delete it.g;
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
    version: 1, favorite: false, status: '調整中', tags: [], changeLog: [{ version: 1, at: now, note: '初期登録' }],
    createdAt: now, updatedAt: now, defaultVariantId: r.variants[0].id,
    ...r,
  };
}

const RODEV_BAKE = (p) => [
  { id: `${p}-bake1`, title: '焼成①', body: '250℃・スチームあり。', timer: { min: 10, label: '焼成① 250℃' } },
  { id: `${p}-bake2`, title: '焼成②', body: '230℃に下げて焼く。', timer: { min: 15, label: '焼成② 230℃' } },
  { id: `${p}-cool`, title: '冷ます', body: '網の上で完全に冷ます。断面は冷めてから。' },
];

export function buildSeedRecipes() {
  return [
    // ───────────────────────────── カレーパン
    recipe({
      id: 'curry-pan',
      name: '薄皮もちもち俵型カレーパン',
      category: '惣菜パン',
      difficulty: 2,
      tags: ['当日完成', '揚げパン', '発酵なし'],
      description: '発酵なし・ベーキングパウダー使用。薄皮でもちもち、冷たく固いカレーを包んで揚げる。',
      variants: [{
        id: 'std', name: '基本',
        scaleMode: 'count', baseCount: 6, countUnit: '本', baseFlour: 150,
        yieldLabel: '6本分',
        hb: {
          mode: 'optional_knead', recommendation: 'optional', model: 'siroca SB-2D271', course: 'こねる',
          notes: ['使用する場合「こねる」5分', '生地が硬ければ水を少量追加', '必要ならさらに2分', '発酵機能は使用しない'],
        },
        bakeSummary: '170〜175℃で揚げ 3〜4分',
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
            { id: 'curry', name: '固めのカレー', perCount: { target: 47.5, min: 45, max: 50 }, note: '1本45〜50g・冷たく固く' },
          ] },
          { id: 'finish', name: '仕上げ', kind: 'finish', items: [
            { id: 'panko', name: '細目パン粉', text: '適量' },
            { id: 'cwater', name: '衣用の水', text: '適量' },
            { id: 'fryoil', name: '揚げ油', text: '適量' },
          ] },
        ],
        steps: [
          { id: 'c1', title: 'カレーを固く・冷たくする', uses: ['curry'],
            body: 'カレーを煮詰め、流れない硬さにする。{{count}}等分して1本{{per:curry}}。細長い俵型にして冷蔵庫でしっかり冷やす。' },
          { id: 'c2', title: '生地を作る',
            uses: ['haru', 'kitano', 'lys', 'tapioca', 'sugar', 'salt', 'bp', 'skim', 'egg', { ref: 'water', show: 'min' }, 'oil'],
            body: '粉類、砂糖、塩、ベーキングパウダー、スキムミルクを混ぜる。卵・油・水{{min:water}}を加え、5〜7分こねる。硬い場合だけ残りの水を少量ずつ加える（合計最大{{max:water}}）。',
            hb: 'HB使用時：「こねる」5分 → 硬ければ水を少量追加 → 必要ならさらに2分。発酵機能は使わない。',
            timer: { min: 5, max: 7, label: 'こね' } },
          { id: 'c3', title: '休ませる', body: 'ラップをして室温で休ませる。これは発酵ではなく、生地を伸ばしやすくするため。',
            timer: { min: 20, max: 30, label: '生地を休ませる' } },
          { id: 'c4', title: '分割・伸ばす',
            body: '{{count}}等分。1個約{{piece}}gを目安にする。長さ15〜17cm、幅8〜9cm程度の楕円に伸ばす。中央は少し厚め、端は薄め。' },
          { id: 'c5', title: '包む', uses: ['curry'],
            body: '冷たいカレーを中央に置き、長辺同士を合わせて強くつまむ。両端も完全に閉じ、長さ約15cmの俵型に整える。',
            tips: ['閉じ目に打ち粉や油を付けない'] },
          { id: 'c6', title: '衣', uses: ['cwater', 'panko'],
            body: '表面を水で軽く湿らせ、細目パン粉を薄くまぶす。閉じ目は特にしっかり密着させる。',
            tips: ['薄皮感を残すためパン粉も薄くする'] },
          { id: 'c7', title: '揚げる', uses: ['fryoil'],
            body: '170〜175℃。閉じ目を下にして入れ、途中で返しながら揚げる。全体がきつね色になったら取り出す。',
            timer: { min: 3, max: 4, label: '揚げ' } },
        ],
        tips: ['発酵なし', 'カレーは必ず固く、冷たくする', '閉じ目に打ち粉や油を付けない', '薄皮感を残すためパン粉も薄くする'],
      }],
    }),

    // ───────────────────────────── ロデヴ
    recipe({
      id: 'rodev-90',
      name: '高加水90%ロデヴ',
      category: '高加水',
      difficulty: 3,
      tags: ['オーバーナイト', 'ハード系', 'モルト使用'],
      description: 'リスドォル主体の高加水ロデヴ。3回目のフォールド後に「今日焼く／冷蔵庫へ」を選べる。',
      reviewNote: '会話中の断片から再構成した仮データです。「要確認」の付いた材料・工程を実際の配合に合わせて編集してください。',
      variants: [{
        id: 'std', name: '基本',
        scaleMode: 'flour', baseFlour: 250, baseCount: 2, countUnit: '個',
        yieldLabel: '2個分',
        hb: { mode: 'none', recommendation: 'not_recommended', model: '', course: '', notes: ['HB非推奨', '使用する場合は初期混合5分のみ'] },
        bakeSummary: '250℃ 10分 → 230℃ 15分',
        ingredientGroups: [
          { id: 'flour', name: '粉', kind: 'flour', items: [
            I('lys', 'リスドォル', 150), I('kitano', 'キタノカオリ', 75), I('haru', '春よ恋', 25),
          ] },
          { id: 'dough', name: 'その他', kind: 'dough', items: [
            I('water', '水', 225, { moisture: 1 }),
            I('salt', '塩', 5, { precision: 0.1 }),
            I('yeast', 'インスタントドライイースト', 1, { precision: 0.1, tentative: true, note: '量は要確認' }),
            I('malt', 'モルト', 0.5, { precision: 0.1, tentative: true, note: '使用有無・量は要確認' }),
          ] },
        ],
        steps: [
          { id: 'r1', title: '粉と水を混ぜる', uses: ['lys', 'kitano', 'haru', 'water'], body: '粉気がなくなるまで混ぜる。' },
          { id: 'r2', title: 'オートリーズ', body: 'ラップをして休ませる。', timer: { min: 20, label: 'オートリーズ' } },
          { id: 'r3', title: 'イースト・塩を加える', uses: ['yeast', 'salt', 'malt'], tentative: true,
            body: '生地に加えて、全体に行き渡るまでしっかり混ぜ込む。' },
          { id: 'r4', title: '休ませ①', body: 'ラップをして休ませる。', timer: { min: 20, label: '休ませ①' } },
          { id: 'r5', title: '1回目のフォールド', body: '生地の四方を持ち上げて中央へ折りたたむ。' },
          { id: 'r6', title: '休ませ②', body: 'ラップをして休ませる。', timer: { min: 20, label: '休ませ②' } },
          { id: 'r7', title: '2回目のフォールド', body: '生地の四方を持ち上げて中央へ折りたたむ。' },
          { id: 'r8', title: '休ませ③', body: 'ラップをして休ませる。', timer: { min: 20, label: '休ませ③' } },
          { id: 'r9', title: '3回目のフォールド', body: '生地の四方を持ち上げて中央へ折りたたむ。' },
          { id: 'route', type: 'branch', title: '今日焼く？ 冷蔵庫へ？', body: '3回目のフォールド完了。ここからルートを選びます。',
            options: [
              { id: 'today', label: '今日焼く', icon: '🔥', sub: 'このまま一次発酵 → 焼成', steps: [
                { id: 'td-ferm1', title: '一次発酵', tentative: true, body: '室温で発酵させる。',
                  ferment: { temp: '室温', cue: '1.5〜2倍・表面に気泡', min: 60, max: 90 } },
                { id: 'td-div', title: '分割', tentative: true, body: '打ち粉をした台に出し、{{divide}}。成形はせず、形を軽く整える。' },
                { id: 'td-ferm2', title: '二次発酵', body: '布どり等で休ませる。',
                  ferment: { temp: '室温', cue: 'ひと回り大きく', min: 40, max: 60 },
                  tips: ['終盤にオーブンを250℃で予熱'] },
                ...RODEV_BAKE('td'),
              ] },
              { id: 'cold', label: '冷蔵庫へ', icon: '❄️', sub: '8〜15時間の冷蔵発酵', steps: [
                { id: 'cd-cold', title: '冷蔵発酵', body: '容器ごと冷蔵庫へ入れる。', cold: { minH: 8, maxH: 15 } },
                { id: 'cd-div', title: '取り出し・分割', tentative: true, body: '冷蔵庫から出し、{{divide}}。成形はせず、形を軽く整える。' },
                { id: 'cd-ferm2', title: '二次発酵', body: '布どり等で休ませる。',
                  ferment: { temp: '室温', cue: 'ひと回り大きく', min: 40, max: 60 },
                  tips: ['終盤にオーブンを250℃で予熱'] },
                ...RODEV_BAKE('cd'),
              ] },
            ] },
        ],
      }],
    }),

    // ───────────────────────────── 食パン（2 variants）
    recipe({
      id: 'shokupan-junnama',
      name: 'ふわもち純生食パン',
      category: '食パン',
      difficulty: 2,
      tags: ['当日完成'],
      description: 'しっとりふわもち。HB全自動と、HB＋12cm角型の2通りで作れる。',
      variants: [
        {
          id: 'hb-auto', name: 'A. HB全自動',
          scaleMode: 'flour', baseFlour: 250,
          yieldLabel: '1斤',
          hb: { mode: 'full_auto', recommendation: 'recommended', model: 'siroca SB-2D271', course: '食パン／ソフト系', notes: ['焼き色「淡め」'] },
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
            { id: 'a1', title: 'HBへ材料を投入',
              uses: ['haru', 'kitano', 'milk', 'water', 'cream', 'sugar', 'honey', 'salt', 'butter', 'yeast'],
              body: '機種の説明書に従う順番で投入する。イースト専用投入口がある場合はそこへ。' },
            { id: 'a2', title: 'コースを開始', body: '食パンまたはソフト系コース。焼き色は「淡め」。',
              hb: 'siroca SB-2D271：食パン／ソフト系コース、焼き色 淡め' },
            { id: 'a3', title: '取り出す', body: '焼き上がったらすぐケースから出して網にのせる。' },
            { id: 'a4', title: '袋に入れる', body: '粗熱が取れ、まだ少し温かいうちに袋へ入れる。クラストへ少し水分を戻して、耳を柔らかくする。' },
          ],
          tips: ['この食パンではモルトとリスドォルは使わない', '有塩バター使用時は塩を0.5g減らす'],
        },
        {
          id: 'hb-pan12', name: 'B. HB＋12cm角型',
          scaleMode: 'panVolume', baseFlour: 280,
          basePan: { name: '蓋付き12cm角型', w: 12, d: 12, h: 12 },
          yieldLabel: '12cm角型 1本',
          equipment: ['蓋付き12cm角型'],
          hb: { mode: 'knead_first_fermentation', recommendation: 'recommended', model: 'siroca SB-2D271', course: 'パン生地コース', notes: ['こね〜一次発酵までHB'] },
          bakeSummary: '210℃予熱 → 195℃ 30〜33分',
          ingredientGroups: [
            { id: 'flour', name: '粉', kind: 'flour', items: [I('haru', '春よ恋', 245), I('kitano', 'キタノカオリ', 35)] },
            { id: 'dough', name: 'その他', kind: 'dough', items: [
              I('milk', '牛乳', 160, { moisture: 0.88 }),
              I('water', '水', { target: 25, min: 25, max: 30 }, { moisture: 1, note: '生地が硬い場合のみ最大＋5g' }),
              I('cream', '生クリーム', 25, { moisture: 0.5 }),
              I('sugar', '砂糖', 20),
              I('honey', 'はちみつ', 15, { moisture: 0.2 }),
              I('salt', '塩', 4.5, { precision: 0.1 }),
              I('butter', '無塩バター', 28),
              I('yeast', 'ドライイースト', 3, { precision: 0.1 }),
            ] },
            { id: 'finish', name: '仕上げ', kind: 'finish', items: [{ id: 'mbutter', name: '溶かしバター（好みで）', text: '2〜3g' }] },
          ],
          steps: [
            { id: 'b1', title: 'HBでこね〜一次発酵',
              uses: ['haru', 'kitano', 'milk', 'water', 'cream', 'sugar', 'honey', 'salt', 'butter', 'yeast'],
              body: 'パン生地コースを使用。一次発酵終了時の目安は約2倍。',
              hb: 'siroca SB-2D271：パン生地コース（こね〜一次発酵）' },
            { id: 'b2', title: '分割・ベンチ', body: '2分割して軽く丸め、休ませる。', timer: { min: 15, label: 'ベンチタイム' } },
            { id: 'b3', title: '成形', body: '縦長に伸ばす。左右を中央へ折り、軽く伸ばして上から巻く。同じものを2本作り、巻き終わりを下にして型へ入れる。' },
            { id: 'b4', title: '二次発酵', body: '時間固定ではなく高さを優先して判定する。',
              ferment: { temp: '32〜35℃', cue: '生地頂点が型の縁より約1cm下 → 蓋をする' },
              tips: ['終盤に210℃で予熱を開始', '初回は「型の縁より約1cm下」で蓋をする'] },
            { id: 'b5', title: '焼成', body: '210℃で予熱 → 195℃で焼く。焼き不足なら2〜3分追加。', timer: { min: 30, max: 33, label: '焼成 195℃' } },
            { id: 'b6', title: '焼成後', uses: ['mbutter'], body: '型に軽くショックを与え、すぐ型から取り出す。好みで表面に溶かしバターを薄く塗る。' },
            { id: 'b7', title: '冷却', body: '粗熱を取り、まだ少し温かい段階で袋へ。' },
          ],
          tips: [
            '角が丸すぎる → 二次発酵不足',
            '角が鋭すぎる、側面がへこむ → 発酵しすぎ',
            '初回は「型の縁より約1cm下」で蓋をする',
            '有塩バター使用時は塩を0.5g減らす',
            'この食パンではモルトとリスドォルは使わない',
          ],
        },
      ],
    }),
  ];
}

/** Non-destructive upgrades for data already saved on the device. */
export function migrateRecipes(recipes, fromVersion) {
  const changed = [];
  if (fromVersion < 2) {
    const r = recipes.find((x) => x.id === 'rodev-90');
    const v = r?.variants.find((x) => x.id === 'std');
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
  return changed;
}
