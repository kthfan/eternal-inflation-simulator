# 永恆暴脹模擬器（Eternal Inflation）

以 Canvas 即時繪製的永恆暴脹模擬器：假真空以指數速率膨脹，量子穿隧不斷開出口袋宇宙；仍在膨脹的口袋宇宙裡又會生出下一層。同種真空相遇會融合，不同真空之間的疇壁被能量較低的一方推著走；負真空能的宇宙走向大擠壓，真空能近乎為零的宇宙走入熱寂。

所有版本（基礎版、日後的控制版、遊戲版……）**共用同一個核心**，各版本只以「外掛」加入自己的功能。核心一改，所有版本一起更新。

## 直接使用

`dist/` 裡的每個 HTML 檔都是單一、自足的檔案，直接用瀏覽器開啟即可：

| 檔案 | 內容 |
|---|---|
| `dist/base.html` | 基礎版（第三版模擬器本體） |
| `dist/control.html` | 控制版：點擊放下泡泡（向下／向上穿隧）、暫停演化、動作紀錄重播（P：放置模式、K：暫停演化） |
| `dist/game.html` | 遊戲版雛形：成為有自我意識的宇宙（N：誕生、WASD：移動、Q／E：大小、1／2：技能、空白鍵：暫停） |
| `dist/inspector.html` | 範例：基礎版 + 「檢視器」外掛（示範外掛 API） |
| `dist/harness.html` | 自動化測試用（基礎版 + `window.__ei`），不要加功能 |

網址可帶參數：`#seed=12345`（指定宇宙種子）、`&obs=typical`（典型觀測者模式）。

## 開發

需要 Node.js 18 以上。

```bash
npm install          # 安裝 esbuild（建置用）
npm run build        # 建置所有版本到 dist/
npm run watch        # 監看原始碼並自動重建
npm test             # 核心自我檢查（不需要瀏覽器）
npm run test:e2e     # 瀏覽器端到端測試（第一次需先 npx playwright install chromium）
```

修改後請一律：`npm test` → `npm run build` → 開啟 `dist/*.html` 按「自我檢查」（或 `npm run test:e2e`）。

## 目錄

```
src/
  core/        模擬核心（純計算、可重現、不依賴瀏覽器）
    math.js        亂數、雜湊、Poisson、顏色
    territory.js   領域幾何：「某一點屬於哪個宇宙」的唯一規則
    universe.js    真空地景、泡泡演化、疇壁、退場、歷史
    selfcheck.js   不變式檢查（npm test 與瀏覽器共用）
  render/      繪製（紋理、攝影機、每格場景）
  ui/          介面（時間軸、面板、資訊卡、輸入、效能、自我檢查按鈕）
  audio/       生成式音樂
  app/         組裝：共用狀態 S、設定、主迴圈、擴充點 hooks、外掛 API、進入點 startApp
  styles/      CSS
  template.html  HTML 外殼（建置時把 CSS 與 JS 內嵌進去）
plugins/       可重複使用的外掛（例：inspector、control、player）
variants/      各版本 = 核心 + 選用的外掛（每個資料夾輸出一個 dist/<名稱>.html）
test/          npm test（核心）與 e2e（瀏覽器）
docs/          架構、外掛指南、開發歷程、路線圖
```

## 文件

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：架構、資料流、共用狀態、不變式
- [docs/PLUGINS.md](docs/PLUGINS.md)：如何建立新版本與撰寫外掛
- [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md)：開發歷程、重要決策與踩過的坑
- [docs/ROADMAP.md](docs/ROADMAP.md)：後續規劃（大範圍視角、移動泡泡、控制版與遊戲版；D 節為遊戲版的物理設計與實作 TODO）
- [CLAUDE.md](CLAUDE.md)：給 Claude Code 的開發守則
