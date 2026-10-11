/* 核心｜焦點跟隨（D9 M4）：模擬區域以「焦點」為中心 —— 有玩家時是玩家，方案 B 中沒有玩家時是隨所在宇宙流動的觀測者。
   平直切片的德西特時空對共動座標的平移是對稱的：把原點換到「此刻位於 (ax, ay) 的共動點」，
   所有泡泡的中心一起平移、半徑不變，物理完全相同（circleAt 的結果只差一個平移）。
   · 泡泡的誕生位置 (x, y) 是誕生時的物理座標，該共動點在 tn 時位於 (ax, ay)·e^{H(tn−t)}，所以減去它；根空間中的玩家軌跡段同理
   · 區域空間（方案 B）中的位置相對該區域的錨點，錨點本身會跟著平移，不用改
   · 流出時刻改以新原點重算；已流出（被丟棄）的泡泡不會回來 —— 它們離原點超過 RGEN（遠大於 2·RH），永遠碰不到（D2）
   · 已退場的泡泡維持退場（退場判斷用的範圍多留了 200，足以涵蓋每次最多 recenter·RH 的平移）
   · 在步進中成核之前執行；動作一律在步進開頭套用，所以動作的座標永遠屬於套用當下的座標系，重播時完全一致 */
import { STEP, LONG } from './constants.js';
import { PLAYER } from './player.js';

export function installFocus(W){
  const { U, p } = W;
  U.recenters = 0;
  U.comoving = { x: 0, y: 0 };    // 目前原點的共動座標（以 t = 0 時的物理長度為單位），累計平移量
  function rebase(ax, ay, t, smooth = false){
    const H = p.H, seen = new Set();
    W.invalidate();
    const move = b => {
      if(seen.has(b)) return; seen.add(b);
      // 中心 = 誕生位置 × E(b, t)：除以「此刻實際的」膨脹倍數，中心才會準確平移 (ax, ay)。
      // 膨脹倍數已達上限 EMAX（幾何凍結）的泡泡若照 e^{H(tn−t)} 換算，中心幾乎不會移動，相對其他東西就漂走了
      const e = b.ctl ? Math.exp(H*(b.tn - t)) : 1/W.E(b, t); b.x -= ax*e; b.y -= ay*e; b.d = Math.hypot(b.x, b.y);
      if(b.ctl){ const C = b.ctl; for(let i=0;i<C.t.length;i++){ if(C.reg[i]) continue; const f = Math.exp(H*(C.t[i] - t)); C.x[i] -= ax*f; C.y[i] -= ay*f; } }
    };
    for(const b of U.hist) move(b); for(const b of U.longs) move(b); for(const b of U.live) move(b);
    for(const b of U.live){
      if(!(b.texit > t) || b.retired || b.player || b.dyn) continue;
      if(b.ctl){ const c = U.circleAt(b, t); b.texit = W.exitTime(1, Math.hypot(c.cx, c.cy), c.r, t); }
      else b.texit = W.exitTime(b.s, b.d, b.r0, b.tn);
      if(b.texit <= t) b.texit = t + STEP/2;
      if(!b.long && !(b.texit - b.tn <= LONG)){ b.long = true; U.longs.push(b); }
    }
    const e0 = Math.exp(-H*t); U.comoving.x += ax*e0; U.comoving.y += ay*e0; U.recenters++;
    W.notify('rebase', { x: ax, y: ay, t, smooth });
  }
  U.rebase = (ax, ay) => rebase(ax, ay, U.tSim);     // 測試用：在目前的步進邊界手動平移
  /* 玩家離原點超過 recenter·RH 就把原點換到玩家 */
  W.follow = t => {
    const P = U.player; if(!P) return;
    const c = U.circleAt(P, t);
    if(Math.hypot(c.cx, c.cy) > PLAYER.recenter*p.RH) rebase(c.cx, c.cy, t);
  };
  /* 方案 B：沒有玩家、觀測者在某個口袋宇宙內時，觀測者跟著那個宇宙的空間流動（每一步平移原點到它在該宇宙中的共動點）。
     否則觀測者仍以假真空的方式流動，相對口袋宇宙內部的空間會以超光速漂移 —— 這是把不同區域接在同一張平面上的副作用。
     觀測者所在的區域要「記住」：巨大而古老的口袋宇宙內部相對假真空座標的漂移可達每步上萬像素，
     若每一步才用「原點此刻的擁有者」重新判斷，原點在一步之內就已漂出那個宇宙。所以先依上一步的區域平移，平移後再重新判斷 */
  U.obsRegion = null;
  W.comove = t => {
    const R = U.obsRegion;
    if(R){
      const c0 = W.anchorAt(R, t - STEP), c1 = W.anchorAt(R, t), e = Math.exp(W.hIn(R)*STEP);
      const qx = c1.cx - c0.cx*e, qy = c1.cy - c0.cy*e;
      if(qx*qx + qy*qy > 1e-12) rebase(qx, qy, t, true);
    }
    const o = U.ownerAt(0, 0, t); U.obsRegion = o ? o.b : null;
  };
}
