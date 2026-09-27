# パンノート（v1.5.0）

パンを作って、記録して、次をもっと良くするための PWA。サーバー不要（GitHub Pages）。

## デプロイ
1. このフォルダの中身をリポジトリ直下（または任意のサブフォルダ）に置く
2. GitHub → Settings → Pages → Branch: main / root
3. iPhone の Safari で開き「共有 → ホーム画面に追加」
   - ホーム画面から起動すると保存領域が安定し、全画面表示になります
4. 更新時は `sw.js` の `VERSION` を上げる（古いキャッシュが破棄されます）。v1.1.3 から Service Worker はネットワーク優先なので、オンラインなら更新後の最初の起動から新しい版が動きます

## ファイル
| ファイル | 役割 |
|---|---|
| `index.html` / `styles.css` | 画面の枠とデザイン |
| `js/app.js` | 画面・作るモード・タイマー・記録・編集・バックアップ |
| `js/calc.js` | ベーカーズ％ → g 計算、スケーリング、工程の分岐展開 |
| `js/seed.js` | 初期レシピ（6件） |
| `js/db.js` | IndexedDB |
| `sw.js` / `manifest.webmanifest` / `icons/` | PWA |

## データ設計（要点）
IndexedDB `bread-note` のストア：`recipes` / `recipeVersions` / `bakes` / `photos` / `meta`

- **recipe**：`id, name, category, status, version, favorite, variants[], changeLog[]`
- **variant**（食パンA/Bなど）：`scaleMode: flour|count|panVolume`, `baseFlour`, `baseCount`, `basePan{w,d,h}`, `hb{mode, recommendation, model, course, notes}`, `ingredientGroups[]`, `steps[]`, `tips[]`
- **ingredient**：`basis: flour` のとき `pct{target,min,max}`（正データ）、`precision: 1|0.1`、`moisture`（水分率計算用）、`tentative`（要確認）。フィリングは `basis: perCount`、適量は `basis: text`
- **step**：`timer{min,max}` / `ferment{temp,cue,min,max}` / `cold{minH,maxH}` / `uses[]` / `hb`。分岐は `{type:'branch', options:[{id,label,steps[]}]}`。本文は `{{count}}` `{{piece}}` `{{min:water}}` などのテンプレートで分量に追従
- **bake（製作記録）**：`snapshot`（開始時点の variant 全体・スケール・計算済みg・recipeVersion を丸ごと複製）、`progress{currentStepId, choices, log}`、`timers[]`（`endAt` タイムスタンプ保存）、`env`、`rating`、`scores{}`（V2用）、`nextMemo`、`photoIds[]`
- **photo**：`{id, bakeId, recipeId, kind: exterior|crumb|other, blob}`（1600px JPEG に縮小）
- レシピ編集で保存すると `version+1`、旧版は `recipeVersions` に `id@vN` で保存（履歴UIはV2）

## iPhone での注意
- タイマーは終了時刻で管理しているので、ロック・アプリ切替から戻ると正しい残り時間／経過時間に復元され、その時点で終了を知らせます。**ロック中に音は鳴りません**（Web アプリの制約）
- アラーム音はマナーモード（消音スイッチ）だと鳴らないことがあります
- 作るモード中は Wake Lock で画面を点けたままにします（iOS 16.4以降）

## v1.1.0 で追加したデータ
- **生地の系統** `variant.dough = { familyId }`。表示名は `seed.js` の `DOUGH_FAMILIES` から引く
- **配合の指紋** `doughSignature(v)`（`calc.js`）。保存せず毎回計算。kind が flour / dough の材料だけを、材料キー（`ingKey`、なければ正規化した名前）と 0.01% 単位のベーカーズ％で比較する。材料の並び順・計量単位・メモは無関係
- **下準備グループ** `kind: 'prep'` ＋ `batch: { unit, maxUnitsPerCook, yieldPerUnit }`。材料は `basis: 'batch'`（1単位あたりの g）。仕込む単位数は `max(1, ceil(個数 ÷ unit))`、1回に炊くのは最大 `maxUnitsPerCook` 単位。フィリングとは `madeBy` でつなぐ
- **工程の構造化** `step.phase`（prep / dough / divide / shape / proof / top / bake / after）、`ferment.tempMin/tempMax`、`step.bake`、`step.parallel`（次の工程へ進んでもタイマーを止めない）
- **HBの容量** `hb.capacity = { course, flourMax }`。その variant の機種・コースにだけ使う

## 自動テスト
`node tests.mjs`（このフォルダで実行）。計算・標準レシピ・移行処理・入力チェックのテストです（v1.5.0 時点で283件）。

## バックアップの互換性
- 同時製作の判定は工程の条件だけ。数量・HB容量・天板やオーブンの容量は含まない（Batch と合わせて V2 で扱う）
- 一次発酵を HB で行う variant と、手ごねで温度を決めて行う variant は「どちらかに合わせる」という注記にとどめ、判定は下げない
- v1.1.6 より前に保存した不正な値（負の分割数・冷蔵の最長なしなど）は自動では直しません。「このレシピで作る」を押すと理由を表示して止まるので、編集画面で直してください
- 古いバックアップ（v1.0.x）は v1.1 系でそのまま読み込めます。復元した直後に移行処理と新レシピの追加が行われます
- v1.1.0 のバックアップを古い版で読み込むと、下準備の材料（basis: batch）は「適量」と表示されます

## 編集時の安全策（v1.1.2）
- 材料名を実質的に変えると（NFKC・空白除去後に一致しない）、その材料の `ingKey` を外し、名前で比較する
- 工程の条件（タイマー・発酵・冷蔵・分岐）を変えたり工程を増減したりすると、その variant の `phase`・`bake`・`ferment.tempMin/tempMax` を外し、同時製作の対象外にする（`parallel` は残す）
- カスタードなど下準備の仕上がり不足は、編集中にその場で警告し、保存時にも確認する

## v1.1.3 の変更
- 焼成工程（`phase:'bake'` または `step.bake`）は本文の変更も条件の変更とみなす。焼成の要約（`bakeSummary`）の変更も同じ。移行処理も同じ基準
- 標準レシピの同じ材料（同じ group・item ID）の名前に戻したら、標準の `ingKey` を戻す
- 下準備の材料を変えたら `batch.yieldVerified = false`（仕上がり目安は未確認）、`prepKey` は `prepKeyOrigin` へ移して外す。編集画面の「実際に作って確認した」で確認済みに戻せる
- 保存前チェック（1個あたりの量の必須、最小 ≤ 目安 ≤ 最大）
- 作るモードで、下準備を2回以上に分けて炊くときは回ごとの量を表示
- 編集画面の不具合修正：空欄の最小・最大が 0% として保存されていた。`SEED_VERSION 6` の移行で、既存データの「最大0%」と、それと対になった「最小0%」（標準に最小が無い材料の最小0%も）を取り除く

## v1.1.4 の変更
- 条件を変えて同時製作用データ（phase・bake・tempMin/tempMax）が外れた variant も、工程を標準と完全に同じ内容へ戻して保存すれば付け直す（判定は移行処理の `applyStepMeta` と同じ）
- 保存前チェックに工程の時間を追加：タイマー・発酵の最短は0より大きく、最長 ≥ 最短。冷蔵も同じ。ベーカーズ％の目安・最大は0以上
- カスタードを標準の配合・設定に完全に戻し、仕上がりも確認済みにして保存すると `prepKey` を戻す（`prepKeyOrigin` は残す）
- 保存せずに編集画面を離れたら、下書きは捨てる

## v1.1.5 の変更（入力の境界チェック）
- 発酵計画ごとのベーカーズ％（ロデヴのイーストの当日・冷蔵など）も1つずつ確認：目安・最小・最大は0以上、最小 ≤ 目安 ≤ 最大
- 個数・分割数（`baseCount`）：個数基準のレシピは1以上の整数が必須。粉基準の分割数は空欄可、入力したら1以上の整数
- `panVolume()` は幅・奥行・高さがすべて0より大きい数のときだけ容積を返し、それ以外は0（無効）。負の寸法2つで正の容積になる問題を解消。レシピ画面で無効な寸法を入力すると、入力値を残したまま警告し、計算は基準の型で行う
- `phaseComplete()` は工程が1つもない variant では false
- 下準備の仕上がり目安（`yieldPerUnit`）は入力されていれば0より大きい数。仕込みの単位・1回の最大量は入力されていれば1以上の整数

## v1.1.6 の変更（保存・開始前のチェック）
- 材料名が空欄の行があると保存しない（以前は黙って消していたため、基準粉量や工程の「使う材料」とずれることがあった）。材料を消すときは削除ボタンを使う
- 実行できる工程（分岐以外、分岐の中も数える）が1つもないと保存しない
- 冷蔵工程は最短・最長の両方が必須（0より大きく、最長 ≥ 最短）。タイマー・発酵の「最長なし」は従来どおり可
- 編集画面でタイマー・発酵時間に 0 を入れたとき、未設定にせず 0 のまま保存前チェックで止める（空欄だけが「なし」）
- 「このレシピで作る」の前にも同じチェックを行い、古いデータや古いバックアップ由来の不正値のまま作り始めない（発酵計画を選ぶ画面の前で止める）
- 作り始めの工程は、選んだ計画で展開した順番の先頭にする（計画の分岐が先頭にあっても正しく始まる）

## v1.5.0：同じ生地で同時に作れるかの判定
### 追加したデータ（SEED_VERSION 7。本文・配合は変えていないので seedRev は上げない）
- ロデヴ・純生食パン A/B/C・カレーパンに `phase`（prep / dough / divide / shape / proof / top / bake / after）
- 発酵温度 `ferment.tempMode`：`'range'`（`tempMin`/`tempMax`）か `'ambient'`（室温。数値にしない）。`tempMode` が無くても `tempMin`/`tempMax` があれば range とみなす
- 焼成 `step.bake.method`：`'oven'`（未指定も oven）／`'fry'`（`tempMin`/`tempMax`）／`'hb'`。揚げも phase は `bake`
- 多段焼成は焼成工程を段の数だけ持つ（ロデヴ：250℃スチーム10分 → 230℃ 15〜18分）
- 系統：`lean-high-hydration`（リーン・高加水）、`rich-shokupan`（リッチ食パン生地：A/B/C 共通）、`curry-bread-dough`（カレーパン生地）
- `variant.mix = false`：同時製作の対象外（食パン A＝HB全自動）

### 移行（SEED_VERSION 6 → 7）
- 工程メタデータは、工程が標準と完全に同じ variant にだけ付ける（v1.1.0 と同じ基準）。違えば付けない
- 系統は配合が標準と同じときだけ、`mix:false` は HB の使い方が標準と同じときだけ付ける
- version・changeLog・seedRev は変えない。この移行だけで「新しい標準版があります」は出さない

### 判定（`calc.js` の `compatVariants(a, b)`。必ず variant 対 variant）
配合（`doughSignature`）が同じとき、次の順で決める。
1. どちらかが `mix:false` → 同じ配合（同時製作判定なし）
2. 判定に必要なデータが足りない（phase なし・室温と数値の比較・焼成条件なし・分割数なし など）→ 同じ配合（同時製作判定なし）。データが無いことを「条件が違う」とは扱わない
3. すべて合う → 同じ生地で同時に作れる
4. 一部が違う → 生地は一緒に仕込める（途中から別工程）

配合が違い、系統が同じ → 同じ系統・配合違い

比べる条件：
- 分割重量（±1g）。型焼きは型（幅と奥行の入れ替えは同じ型）と容積あたりの粉量
- 一次発酵：温度範囲は重なれば一致（端点一致も一致）。室温同士は一致。冷蔵は時間範囲が重なれば一致。冷蔵と冷蔵以外は違う
- 二次発酵：同じ
- 焼成：加熱方法・温度（完全一致）・スチーム・1段目の予熱。多段焼成は段の数と、最後の段より前の時間（温度を切り替える時刻）も一致が必要。最後の段の焼き時間の違いは注記だけ
- 発酵計画のある variant（ロデヴ）は計画ごとに比べる（同じ計画 id どうし）

レシピ詳細の生地カードに4段階で表示し、条件ごとのチップ（✓ 一致／✗ 違う／？ 比較できない／※ 注記）を出す。同じレシピの別バリエーションは出さない。

## 既知の制限
- `SEED_VERSION 6` の修復は、旧編集画面由来の 0% と区別できないため、標準レシピの材料に意図的に設定した「最小0%」も取り除く（自作レシピの「最小0%・最大が正の値」の組は残す）
