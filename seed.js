// Initial recipes. Written in grams for readability, then normalized to baker's % (the stored truth).
export const SEED_VERSION = 4;

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

const RODEV_BAKE = (p) => [
  { id: `${p}-bake1`, title: '焼成①', body: '250℃・スチームあり。', timer: { min: 10, label: '焼成① 250℃' } },
  { id: `${p}-bake2`, title: '焼成②', body: '蒸気を抜き、230℃に下げて焼く。焼き色を見て15〜18分。', timer: { min: 15, max: 18, label: '焼成② 230℃' } },
  { id: `${p}-cool`, title: '冷ます', body: '網の上で完全に冷ます。断面は冷めてから。' },
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

export function buildSeedRecipes() {
  return [
    // ───────────────────────────── カレーパン
    recipe({
      id: 'curry-pan',
      seedRev: 2,
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
          { id: 'c3', title: '休ませる', body: 'ラップをして室温で休ませる。これは発酵ではなく、生地を伸ばしやすくするため。30分を大きく超えて休ませない。',
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
            tips: ['冷たいカレーを包むため、揚げ上がりでも中心が熱々にならない場合がある', '熱々で食べたい場合は食べる直前に軽く温め直す'],
            timer: { min: 3, max: 4, label: '揚げ' } },
        ],
        tips: ['発酵なし', 'カレーは必ず固く、冷たくする', '休ませは20〜30分まで（30分を大きく超えない）', '閉じ目に打ち粉や油を付けない', '薄皮感を残すためパン粉も薄くする'],
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
          { id: 'r1', title: '粉と水を混ぜる', uses: ['lys', 'kitano', 'haru', { ref: 'water', pctOfFlour: 84, label: '水（最初）' }],
            body: '粉3種と水{{part:water:84}}を、粉気がなくなるまで混ぜる。残りの水はまだ入れない。' },
          { id: 'r2', title: 'オートリーズ', body: 'ラップをして休ませる。', timer: { min: 20, label: 'オートリーズ' } },
          { id: 'r3', title: 'イースト・塩・残りの水を加える', uses: ['yeast', 'salt', { ref: 'water', pctOfFlour: 6, label: '残りの水' }],
            body: 'イーストと塩を加え、残りの水{{part:water:6}}を少しずつ揉み込むように加えて、全体がなじむまで混ぜる。混ぜ終えた時点の生地温は24〜26℃が目安。' },
          { id: 'r4', title: '休ませ①', body: 'ラップをして休ませる。', timer: { min: 20, label: '休ませ①' } },
          { id: 'r5', title: '1回目のフォールド', body: '生地の四方を持ち上げて中央へ折りたたむ。' },
          { id: 'r6', title: '休ませ②', body: 'ラップをして休ませる。', timer: { min: 20, label: '休ませ②' } },
          { id: 'r7', title: '2回目のフォールド', body: '生地の四方を持ち上げて中央へ折りたたむ。' },
          { id: 'r8', title: '休ませ③', body: 'ラップをして休ませる。', timer: { min: 20, label: '休ませ③' } },
          { id: 'r9', title: '3回目のフォールド', body: '生地の四方を持ち上げて中央へ折りたたむ。' },
          { id: 'route', type: 'branch', atStart: true, title: '発酵の計画', body: '作り始める時に選びます。イースト量がこの選択で決まります。',
            options: [
              { id: 'today', label: '当日焼き', icon: '🔥', sub: 'イースト0.4%・室温で一次発酵 → 当日焼成', steps: [
                { id: 'td-ferm1', title: '一次発酵', body: '室温で発酵させる。',
                  ferment: { temp: '室温', cue: '1.5倍前後・表面に気泡が見える' } },
                { id: 'td-div', title: '分割', body: '打ち粉をした台に出し、{{divide}}。成形はせず、形を軽く整える。' },
                { id: 'td-ferm2', title: '最終発酵', body: '布どり等で休ませる。時間より生地の状態を優先する。',
                  ferment: { temp: '室温', cue: 'ひと回り膨らみ、内部にガスが保たれている', min: 40, max: 90 },
                  tips: ['終盤にオーブンを250℃で予熱（スチームの準備も）'] },
                ...RODEV_BAKE('td'),
              ] },
              { id: 'cold', label: '冷蔵発酵', icon: '❄️', sub: 'イースト0.2%・冷蔵4〜5℃で8〜15時間 → 翌日焼成', steps: [
                { id: 'cd-cold', title: '冷蔵発酵', body: '3回目のフォールド後、容器ごと冷蔵庫（4〜5℃想定）へ入れる。8時間は最短目安。通常は10〜14時間を狙い、生地の状態を優先する。', cold: { minH: 8, maxH: 15 } },
                { id: 'cd-div', title: '取り出し・分割', body: '冷蔵庫から出し、{{divide}}。成形はせず、形を軽く整える。' },
                { id: 'cd-ferm2', title: '復温・最終発酵', body: '布どり等で休ませ、復温を兼ねて最終発酵させる。時間より生地の状態を優先する。',
                  ferment: { temp: '室温', cue: 'ひと回り膨らみ、内部にガスが保たれている', min: 40, max: 90 },
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
          scaleMode: 'panVolume', baseFlour: 250,
          basePan: { name: '蓋付き12cm角型', w: 12, d: 12, h: 12 },
          yieldLabel: '12cm角型 1本',
          equipment: ['蓋付き12cm角型'],
          hb: { mode: 'knead_first_fermentation', recommendation: 'recommended', model: 'siroca SB-2D271', course: 'パン生地コース', notes: ['こね〜一次発酵までHB'] },
          bakeSummary: '210℃予熱 → 195℃ 30〜33分',
          timeLabel: '約2.5〜3.5時間',
          ingredientGroups: PAN12_GROUPS(),
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
          ingredientGroups: PAN12_GROUPS(),
          steps: [
            { id: 'h1', title: '材料を混ぜる',
              uses: ['haru', 'kitano', 'sugar', 'salt', 'yeast', 'milk', 'cream', 'honey', 'water'],
              body: 'ボウルに粉2種・砂糖・塩・ドライイーストを入れる（塩の上にイーストを置かない）。別容器で牛乳・生クリーム・はちみつ・水を混ぜて加え、ヘラやカードで粉気がなくなるまで混ぜる。バターはまだ入れない。' },
            { id: 'h2', title: '休ませる', body: 'ラップをして休ませる。発酵ではなく、水分をなじませて手ごねを楽にするための時間。',
              timer: { min: 10, label: '水分をなじませる' } },
            { id: 'h3', title: '一次こね', body: '台に出してこねる。打ち粉は原則使わず、「押す・折る・転がす」を繰り返す。生地がつながり、表面が少し滑らかになったら次へ。',
              timer: { min: 5, max: 8, label: '一次こね' },
              tips: ['べたつくうちはカードで台から剥がしながら続ける'] },
            { id: 'h4', title: 'バターを加える', uses: ['butter'],
              body: '柔らかくした無塩バターを加え、そのままこね続ける。',
              tips: ['バター投入直後に生地が一度バラバラになるのは正常'] },
            { id: 'h5', title: '本ごね', body: '時間より生地の状態で判断する。滑らかで弾力があり、薄く伸ばすと指が透ける膜ができればOK。完全に破れない極薄膜まで追い込む必要はない。',
              timer: { min: 8, max: 15, label: '本ごね' } },
            { id: 'h6', title: '生地温を確認', body: 'こね上がりの生地温は26〜28℃が目安。記録の「生地温」に残しておく。',
              tips: ['28℃を超えたときは発酵が速くなりやすい。時間より「約2倍」の状態を優先する', '次回は牛乳などの液温を下げる'] },
            { id: 'h7', title: '一次発酵', body: '丸めてボウルへ。時間より膨らみを優先する。',
              ferment: { temp: '28〜30℃', cue: '約2倍', min: 60, max: 90 } },
            { id: 'h8', title: '分割・ベンチ', body: '2分割して軽く丸め、休ませる。', timer: { min: 15, label: 'ベンチタイム' } },
            { id: 'h9', title: '成形', body: '縦長に伸ばす。左右を中央へ折り、軽く伸ばして上から巻く。同じものを2本作り、巻き終わりを下にして型へ入れる。' },
            { id: 'h10', title: '二次発酵', body: '時間固定ではなく高さを優先して判定する。',
              ferment: { temp: '32〜35℃', cue: '生地頂点が型の縁より約1cm下 → 蓋をする', min: 45, max: 75 },
              tips: ['終盤に210℃で予熱を開始', '初回は「型の縁より約1cm下」で蓋をする'] },
            { id: 'h11', title: '焼成', body: '210℃で予熱 → 195℃で焼く。焼き不足なら2〜3分追加。', timer: { min: 30, max: 33, label: '焼成 195℃' } },
            { id: 'h12', title: '焼成後', uses: ['mbutter'], body: '型に軽くショックを与え、すぐ型から取り出す。好みで表面に溶かしバターを薄く塗る。' },
            { id: 'h13', title: '冷却', body: '粗熱を取り、まだ少し温かい段階で袋へ。' },
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
  if (fromVersion < 3) {
    // ロデヴ確定版：作り始めに当日／冷蔵を選び、イースト量を切り替える。追加モルトなし。
    const i = recipes.findIndex((x) => x.id === 'rodev-90');
    if (i >= 0) {
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
  return changed;
}

/** Did the user change this recipe after it last came from the standard (seed) version? */
export function inferUserEdited(r) {
  const log = r.changeLog || [];
  let last = -1;
  log.forEach((c, i) => { if (c.note === '初期登録' || (c.note || '').startsWith('確定版') || (c.note || '').startsWith('標準版')) last = i; });
  return log.length - 1 > last;
}
