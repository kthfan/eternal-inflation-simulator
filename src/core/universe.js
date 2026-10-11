/* 核心｜宇宙：createUniverse(p, tune, { actions }) 建立一個獨立、可用種子重現的宇宙實例。純計算，不依賴瀏覽器。
   這裡只負責組裝與步進的順序；各部分在自己的模組：
   · landscape.js  真空地景            · space.js   空間的流動與幾何（U.circleAt，所有圓的唯一來源）
   · walls.js      泡泡之間（相撞、疇壁、推進前緣、規則情境）
   · world.js      誕生、成核、存活、歸屬查詢、流出、退場、歷史
   · actions.js    動作紀錄與一般的成核動作   · player.js  玩家宇宙（操控、能量帳、曲速、再循環）
   · focus.js      焦點跟隨（平移原點）
   模組之間透過共用的內部情境 W 互相呼叫（W.U 是對外的宇宙物件 U）；對外只公開 U 上的方法與下面重新匯出的常數。 */
import { mulberry32 } from './math.js';
import { STEP, BUCKET } from './constants.js';
import { makeLandscape } from './landscape.js';
import { installSpace } from './space.js';
import { installWalls } from './walls.js';
import { installWorld } from './world.js';
import { installActions } from './actions.js';
import { installPlayer, PLAYER } from './player.js';
import { installFocus } from './focus.js';

export { STEP, EMAX, LONG, BUCKET, MAXB, FALSE_EPS, UP_EPS } from './constants.js';
export { VNAMES, makeLandscape } from './landscape.js';
export { PLAYER };

/* p：建立後不可變的宇宙參數 { seed, H, RH, R0, RGEN, typical, vacN, crunchP, oddDimP, localH }
   localH（方案 B，見 docs/ROADMAP.md D11）：各區域以自己的膨脹率流動。false 時全部共用假真空的 H（原本的模型）
   tune：執行中可調整、會影響之後演化的參數 { gamma, innerMul, wallK }
   opts.actions：要重播的動作紀錄（U.actions 的內容），相同種子 + 相同動作紀錄 → 相同歷史 */
export function createUniverse(p, tune, opts = {}){
  const rng = mulberry32(p.seed);
  const VAC = makeLandscape(rng, p);
  const U = { p, tune, VAC, tSim: 0, acc: 0, tStart: 0, trimmed: 0, hist: [], longs: [], live: [],
    buckets: [], bucketBase: 0, vacCount: VAC.map(() => 0), window: 1200, nextId: 1, stepN: 0 };
  Object.defineProperty(U, 'tLive', { get: () => U.tSim + U.acc });
  /* 事件：'born'（新泡泡誕生）、'retire'（永久泡泡退場）、'act'（動作已套用）、'rebase'（原點換到新的共動點，{ x, y, t, smooth }）。
     只通知、不影響演化，所以不破壞可重現性 */
  const listeners = { born: [], retire: [], act: [], rebase: [] };
  U.on = (name, fn) => { listeners[name].push(fn); return () => { const a = listeners[name], i = a.indexOf(fn); if(i >= 0) a.splice(i, 1); }; };
  const notify = (name, x) => { for(const fn of listeners[name]) fn(x); };

  /* 內部情境：各模組安裝自己的函式到 W（內部）與 U（對外） */
  const W = { U, p, tune, VAC, rng, notify, LH: !!p.localH, cLight: p.H*p.RH };
  installSpace(W);
  installWalls(W);
  installWorld(W);
  installActions(W, opts.actions);
  installPlayer(W);
  installFocus(W);
  const LH = W.LH;

  /* 一步（固定步長 STEP）的順序：
     動作 → 焦點跟隨（或方案 B 的觀測者隨所在宇宙流動）→ 方案 B 的錨點 → 成核 → 玩家 → 方案 B 的流出掃描 → 每秒一次退場。
     焦點跟隨在成核之前：成核範圍以玩家（或觀測者）此刻的位置為中心；動作已在這之前套用，座標屬於送出當下的座標系 */
  U.advance = dt => {
    U.acc += dt;
    let n = 0;
    while(U.acc >= STEP && n < 20000){
      U.acc -= STEP; U.tSim += STEP;
      if(W.hasPending()) W.applyActions(U.stepN + 1);
      if(U.player) W.follow(U.tSim); else if(LH) W.comove(U.tSim);
      if(LH) W.keepAnchors(U.tSim);
      W.nucleate();
      if(U.player || U.anyCtl) W.playerStep(U.tSim);
      if(LH){ if(U.stepN % 15 === 0) W.sweep(U.tSim); W.invalidate(); }
      if(++U.stepN % 30 === 0) W.retire();
      n++;
    }
    if(U.live.some(b => b.texit <= U.tSim)) U.live = U.live.filter(b => b.texit > U.tSim);
    const k = Math.floor(U.tLive/BUCKET) - U.bucketBase; while(U.buckets.length <= k) U.buckets.push(0);
    U.trim();
  };
  U.presim = sec => { for(let i=0;i<Math.round(sec/STEP);i++) U.advance(STEP); };
  /* 可重現性比對用：tMax 以前誕生的每個泡泡 */
  U.fingerprint = tMax => U.hist.filter(b => b.tn <= tMax).map(b => `${b.id}:${b.tn.toFixed(6)}:${b.x.toFixed(4)}:${b.y.toFixed(4)}:${b.vac}:${b.parent ? b.parent.id : 0}${b.act ? ':a' + b.s + ':' + b.r0 : ''}`).join('|');
  return U;
}
