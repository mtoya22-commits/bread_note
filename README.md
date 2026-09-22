# パンノート（V1 プロトタイプ）

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
