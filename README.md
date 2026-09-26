# パンノート（v1.1.1）

パンを作って、記録して、次をもっと良くするための PWA。サーバー不要（GitHub Pages）。

## デプロイ
1. このフォルダの中身をリポジトリ直下（または任意のサブフォルダ）に置く
2. GitHub → Settings → Pages → Branch: main / root
3. iPhone の Safari で開き「共有 → ホーム画面に追加」
   - ホーム画面から起動すると保存領域が安定し、全画面表示になります
4. 更新時は `sw.js` の `VERSION` を上げる（古いキャッシュが破棄されます）

## ファイル
| ファイル | 役割 |
|---|---|
| `index.html` / `styles.css` | 画面の枠とデザイン |
| `app.js` | 画面・作るモード・タイマー・記録・編集・バックアップ |
| `calc.js` | ベーカーズ％ → g 計算、スケーリング、工程の分岐展開 |
| `seed.js` | 初期レシピ3件 |
| `db.js` | IndexedDB |
| `sw.js` / `manifest.webmanifest` / アイコンpng | PWA |

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
`node tests.mjs`（このフォルダで実行）。計算・標準レシピ・移行処理のテストです。

## バックアップの互換性
- 古いバックアップ（v1.0.x）は v1.1.0 でそのまま読み込めます
- v1.1.0 のバックアップを古い版で読み込むと、下準備の材料（basis: batch）は「適量」と表示されます
