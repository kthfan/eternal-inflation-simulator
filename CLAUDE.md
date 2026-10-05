# Claude Code 開發守則

這個專案是「永恆暴脹模擬器」。所有版本共用 `src/` 的核心，各版本（`variants/`）只以外掛（`plugins/`）擴充。
介面文字、程式註解、文件一律使用**繁體中文**。

## 常用指令

- `npm test`：核心不變式檢查（必須全過）
- `npm run build`：建置 `dist/*.html`（`dist/` 有進版控，修改原始碼後務必重建再提交）
- `npm run test:e2e`：瀏覽器端到端測試（含畫面相關的自我檢查）。若 playwright 找不到瀏覽器，可設 `CHROMIUM_PATH`

## 必須遵守的規則

1. **歸屬只有一個定義**：「某一點屬於哪個宇宙」只能由 `src/core/territory.js` 決定（`ownerAt` 就是「畫面上最後被誰畫到」）。
   物理（成核、觀測者、點選）與畫面（填色、泡壁、疇壁）都不得自行另寫一套判斷。
2. **泡泡幾何只有一個來源**：所有圓（中心、半徑）都必須經過 `U.circleAt(b, t)`。日後的「移動泡泡」只改這裡。
3. **核心必須可重現**：`src/core/` 只能用種子化的 `rng`，不得用 `Math.random`、`Date`、`performance.now` 影響演化；
   模擬以固定步長 `STEP` 推進。使用者介入若要可重現，必須以「動作紀錄」的形式進入核心（見 docs/ROADMAP.md）。
4. **核心不碰瀏覽器**：`src/core/` 不得使用 DOM、Canvas、`window`。它要能在 Node 中執行（`npm test`）。
5. **版本差異只放在外掛**：不要在 `src/` 寫「如果是遊戲版就……」。外掛需要的能力不夠時，擴充 `src/app/api.js` 與 `src/app/hooks.js`，
   讓所有版本都能用，並在 docs/PLUGINS.md 補上說明。
6. **跨模組會被重新指定的狀態放在 `S`**（`src/app/state.js`）；其他模組以 `S.xxx` 讀寫。不要再新增跨模組的 `export let` 然後在別處賦值。
7. **初始化順序**由 `src/app/main.js` 固定（沿用重構前單檔版本的執行順序），調整前請先確認相依關係。
8. **每修一個問題，就加一個能抓到它的檢查**到 `src/core/selfcheck.js`（核心）或 `src/ui/selfcheck-ui.js`（需要畫面）。
   這個專案過去多次「修好一個、冒出另一個」，自我檢查是防止回歸的主要手段。
9. 效能預算：中畫質、一般畫面每格 < 16 毫秒。新增繪製特效前先量測（自我檢查中的「繪製效能」「巨大泡泡繪製」）。

## 架構速覽

見 docs/ARCHITECTURE.md。開發歷程與每個設計決策的來由見 docs/DEVELOPMENT_LOG.md。
