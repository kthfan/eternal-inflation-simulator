# 建立新版本與撰寫外掛

## 建立新版本

```
variants/<名稱>/
  main.js        必要：startApp({ plugins: [...] })
  variant.json   選用：{ "title": "頁面標題", "description": "說明" }
  style.css      選用：附加在核心 CSS 之後
  extra.html     選用：附加在頁面 <body> 末端（腳本之前）的 HTML
```

```js
// variants/game/main.js
import { startApp } from '../../src/app/main.js';
import { myGame } from '../../plugins/my-game/index.js';
startApp({ plugins: [myGame()] });
```

`npm run build` 後輸出 `dist/<名稱>.html`。

## 外掛的形狀

```js
export function myPlugin(options){
  return {
    name: 'my-plugin',
    setup(api){ /* 在任何核心模組初始化之前呼叫：登記事件、加面板 */ },
    ready(api){ /* 全部初始化完成、第一個宇宙已建立之後呼叫 */ },
  };
}
```

外掛**只透過 `api` 互動**，不要直接 import `src/` 內部模組。能力不夠時，擴充 `src/app/api.js`（所有版本都受益），並更新本文件。

## 事件（api.on）

| 事件 | 參數 | 時機 | 可攔截 |
|---|---|---|---|
| `universe` | `U` | 建立新宇宙之後（重新開始、換種子） | |
| `frame` | `{ dtR, dt, draw }` | 每次推進模擬之後（`draw` 為 false 代表背景運行） | |
| `render:world` | `{ ctx, t }` | 泡泡與疇壁畫完、暗角之前 | |
| `render:overlay` | `{ ctx, t }` | 整格畫完之後（最上層） | |
| `pointerdown` / `pointermove` / `pointerup` / `wheel` | 原生事件 | 畫布上的滑鼠／觸控 | ✓ |
| `keydown` | 原生事件 | 鍵盤（輸入框聚焦時不觸發） | ✓ |
| `select` | 泡泡或 `null` | 點選泡泡或取消 | |

可攔截的事件：處理函式回傳 `true`，核心就不再處理（例如拖曳泡泡時不要同時平移畫面）。
`api.on` 回傳一個取消訂閱的函式。宇宙本身另有事件：`U.on('born', b => …)`、`U.on('retire', b => …)`。

## api 一覽

| 名稱 | 說明 |
|---|---|
| `S`、`U`、`tView` | 共用狀態、目前宇宙、畫面顯示的時刻 |
| `tune`、`K`、`renderOpt` | 演化參數、畫面參數、顯示開關 |
| `Territory`、`createUniverse`、`STEP`、`mulberry32`、`SelfCheck` | 核心 |
| `camera.toScreen(x,y)`、`camera.toPhysical(sx,sy)` | 物理 ↔ 螢幕座標 |
| `camera.set(x, y, Z)`、`camera.zoomAbout`、`camera.animateZoom`、`camera.P`、`camera.Z`、`camera.cv` | 攝影機 |
| `ctx`、`render(t)`、`rgba`、`mix`、`resetTemporal()` | 繪製 |
| `time.seek(t)`、`time.goLive()`、`time.togglePlay()` | 時間軸 |
| `restart()`、`openCard(b)` | 重新開始、開啟資訊卡 |
| `$`、`store` | DOM 取元素、本機設定儲存 |
| `addPanel({ title, html, open })` | 在設定面板加一個區塊，回傳內容容器 |
| `addCheck({ name, desc, run })` | 加入自我檢查項目，`run()` 回傳 `{ pass, detail }` |

## 範例

`plugins/inspector/index.js`（版本 `variants/inspector`）示範了：overlay 繪製、宇宙事件、面板、攔截按鍵、自我檢查。

## 注意

- 會影響演化的操作（例如手動放泡泡、移動泡泡）**目前還沒有正式 API**。直接改 `U` 的內部資料會破壞可重現性與回放。
  請先依 docs/ROADMAP.md 的「動作紀錄」設計在核心加入正式介面。
- 外掛的錯誤會被攔下並印在主控台，不會中斷模擬。
