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
`api.on` 回傳一個取消訂閱的函式。宇宙本身另有事件：`U.on('born', b => …)`、`U.on('retire', b => …)`、`U.on('act', a => …)`（動作已套用，結果在 `a.result`）、
`U.on('rebase', ({ x, y, t, smooth }) => …)`（焦點跟隨：原點換到此刻位於 (x, y) 的共動點，之前記下的物理座標都要減去它；`smooth` 為 true 時是方案 B 每一步的小幅平移，畫面不需要淡入）。
方案 B 下 `U.hIn(b)` 為泡泡 b 內部的膨脹率（`b` 為 `null` 時是假真空的 H），`U.obsRegion` 為觀測者所在的區域。

## api 一覽

| 名稱 | 說明 |
|---|---|
| `S`、`U`、`tView` | 共用狀態、目前宇宙、畫面顯示的時刻 |
| `tune`、`K`、`renderOpt` | 演化參數、畫面參數、顯示開關 |
| `Territory`、`createUniverse`、`STEP`、`PLAYER`、`mulberry32`、`SelfCheck` | 核心（`PLAYER`：玩家宇宙的參數） |
| `camera.toScreen(x,y)`、`camera.toPhysical(sx,sy)` | 物理 ↔ 螢幕座標 |
| `camera.set(x, y, Z)`、`camera.zoomAbout`、`camera.animateZoom`、`camera.P`、`camera.Z`、`camera.cv` | 攝影機 |
| `ctx`、`render(t)`、`rgba`、`mix`、`resetTemporal()` | 繪製 |
| `time.seek(t)`、`time.goLive()`、`time.togglePlay()` | 時間軸 |
| `restart({ actions })`、`openCard(b)` | 重新開始（可帶入要重播的動作紀錄）、開啟資訊卡 |
| `act(a)`、`actions` | 送出會影響演化的動作（見下方）、目前宇宙的動作紀錄 |
| `sim.paused`、`sim.setPaused(v)` | 暫停／繼續演化（模擬本身停止） |
| `$`、`store` | DOM 取元素、本機設定儲存 |
| `addPanel({ title, html, open })` | 在設定面板加一個區塊，回傳內容容器 |
| `addCheck({ name, desc, run })` | 加入自我檢查項目，`run()` 回傳 `{ pass, detail }` |

## 會影響演化的操作：動作紀錄

**一律經由 `api.act(a)`**，不要直接改 `U` 的內部資料（會破壞可重現性與回放）。

```js
const a = api.act({ type: 'nucleate', x, y, vac, r });   // 物理座標；r 只用於向上穿隧
// 下一個模擬步套用後：a.result = { ok: true, id, up } 或 { ok: false, reason }
api.restart({ actions: api.U.actionLog() });               // 以相同種子重播
```

- 動作在下一個固定步長的開頭套用，並記錄步數；相同種子 + 相同動作紀錄 → 相同歷史。
- `nucleate`：擁有者由核心決定。目標真空比所在處低 → 一般泡泡；比所在處高 → 收縮泡泡（初始半徑 `r`）。
  大擠壓區、太靠近泡壁、範圍跨越其他宇宙地盤、同種真空都會被拒絕（拒絕也會記錄，重播時結果相同）。
- 回看過去時（`api.S.isLive` 為 false）不應送出動作：動作一律在直播時刻套用。
- `spawn { x, y, vac, r, eta, mode }`：在假真空中誕生玩家宇宙（`api.U.player`）；`steer { dx, dy, rT }`：玩家輸入（方向、目標半徑），只在變化時送出。
  玩家宇宙的狀態在 `api.U.player.ctl`（`E` 能量、`exhausted`、`in`、`fate`……）。
- `nucleate { …, by: 'player' }`：玩家技能，限影響範圍並扣除能量（`a.result.cost`）。
- `warp { on: true, dx, dy, k }`／`warp { on: false }`：曲速的啟動與停下（D12）。狀態在 `P.ctl.warp`（`{ k, dx, dy, t0, B }`，B 為已借貸）、
  `P.ctl.repay`（`{ left, rate }`，償還量子利息中）、`P.ctl.lastWarp`（上一次的 `{ tau, borrowed, due, why }`）；參數在 `api.PLAYER.warp`。
  曲速的方向跟著 `steer` 的方向改變（沒有輸入時維持）。
- `recycle {}`：再循環（D13），以玩家為中心向上穿隧出再循環假真空（`kind: 'rf'`）。`api.U.recycleCheck()` 回傳此刻能否使用（`{ reason, trapped }` 或 `{ r0, cost, … }`）。
  `P.ctl.trap` 為困在 Λ ≤ 0 處的秒數，達到 `api.PLAYER.recycle.trapT` 時遊戲結束：玩家被放手，`ctl.fate = 'trapped'`（被吞沒則是 `'eaten'`）。
- 需要新的動作類型時，在 `src/core/universe.js` 的動作紀錄區加入（所有版本共用），並補上自我檢查。

## 範例

- `plugins/inspector/index.js`（版本 `variants/inspector`）：overlay 繪製、宇宙事件、面板、攔截按鍵、自我檢查。
- `plugins/control/index.js`（版本 `variants/control`）：動作紀錄（放置泡泡、重播、匯出匯入）、攔截滑鼠、暫停演化。
- `plugins/player/index.js`（版本 `variants/game`）：玩家宇宙（誕生、鍵盤與滑鼠右鍵操控、技能、曲速、再循環、遊戲結束畫面、鏡頭跟隨、HUD、停用回看）。

## 注意

- 外掛的錯誤會被攔下並印在主控台，不會中斷模擬。
