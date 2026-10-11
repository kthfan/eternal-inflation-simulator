/* 核心｜自我檢查的共用工具：建立測試用的宇宙、規則、玩家、隨機動作，以及比對「物理歸屬」與「畫面繪製」的方法。
   extraP：附加的宇宙參數（例如 { localH: true } 以方案 B 跑同一組不變式） */
import { TAU, mulberry32 } from '../math.js';
import { Territory } from '../territory.js';
import { STEP, createUniverse } from '../universe.js';

export function makeHelpers(extraP = {}){
  const baseP = { seed: 4242, H: .25, RH: 140, R0: 3, RGEN: 3000, typical: false, vacN: 12, crunchP: .25, oddDimP: .15, ...extraP };
  const baseT = () => ({ gamma: 2.5e-6, innerMul: 1, wallK: 1 });
  // 以物理座標為所有存活泡泡建立規則（與畫面呼叫同一個 Territory.buildRules，只是縮放倍率為 1）
  function buildRules(U, t){
    const byB = new Map(), cs = U.aliveAt(t).map(b => { const c = U.circleAt(b, t); byB.set(b, c); return c; });
    cs.sort((a, b) => a.b.tn - b.b.tn || a.b.id - b.b.id);
    const F = U.frame(t, 1, b => byB.get(b) || U.circleAt(b, t));
    Territory.buildRules(cs, F);
    return { cs, F, byB };
  }
  /* 在 t 時隨機取 N 點：物理判定的擁有者是否等於畫面上最後畫到的宇宙 */
  function ownerMismatch(U, t, r, N, R = 2400){
    const { cs, F } = buildRules(U, t);
    const order = cs.slice().sort((a, b) => Territory.drawOrder(F, a, b));
    let mis = 0;
    for(let i=0;i<N;i++){
      const rr = R*Math.sqrt(r()), a = r()*TAU, x = Math.cos(a)*rr, y = Math.sin(a)*rr;
      const sim = Territory.ownerAt(F, cs, x, y);
      let disp = null; for(const c of order) if(Territory.drawContains(c, x, y)) disp = c;
      if((sim ? sim.b : null) !== (disp ? disp.b : null)) mis++;
    }
    return mis;
  }
  /* 射線算出的領域邊界與逐點判斷是否吻合；only 可限定要檢查的圓 */
  function rayMismatch(cs, r, only = () => true, K = 24){
    let bad = 0, n = 0;
    for(const c of cs){
      if(!c.rules.length || c.r < 5 || !only(c)) continue;
      for(let k=0;k<K;k++){
        const a = r()*TAU, ex = Math.cos(a), ey = Math.sin(a), rho = Territory.cellRay(c, ex, ey, c.r);
        const eps = Math.max(.05, c.r*1e-4);
        const inn = rho > 2*eps ? Territory.drawContains(c, c.cx + ex*(rho - eps), c.cy + ey*(rho - eps)) : true;
        const out = rho < c.r - 2*eps ? !Territory.drawContains(c, c.cx + ex*(rho + eps), c.cy + ey*(rho + eps)) : true;
        // 邊界之後不應再有自己的地盤（領域有洞、不呈星形時，射線法會漏畫邊界之後的部分）
        let beyond = true;
        for(let j=1;j<=6 && beyond;j++){ const q = rho + (c.r - rho)*j/7; if(q > rho + 2*eps && q < c.r - 2*eps && Territory.drawContains(c, c.cx + ex*q, c.cy + ey*q)) beyond = false; }
        n++; if(!inn || !out || !beyond) bad++;
      }
    }
    return { bad, n };
  }
  /* 由使用者動作驅動的宇宙：預先演化 20 秒，之後每 0.2 秒在隨機位置放一個泡泡（六成向上穿隧、四成向下），共 40 秒。
     動作由測試即時決定（依當下的擁有者挑選目標真空），之後的重播只依賴記錄下來的動作紀錄 */
  function actionUniverse(seed, secs = 40){
    const U = createUniverse({ ...baseP, seed }, baseT()), r = mulberry32(seed*7 + 1);
    U.presim(20);
    for(let i=0;i<secs*30;i++){
      if(i % 6 === 0){
        const rr = 2200*Math.sqrt(r()), a = r()*TAU, x = Math.cos(a)*rr, y = Math.sin(a)*rr;
        const own = U.ownerAt(x, y, U.tSim), pe = own ? U.VAC[own.b.vac].eps : 1;
        const ups = U.VAC.filter(v => v.eps > pe && v.kind !== 'rf'), downs = U.VAC.filter(v => v.eps < pe);
        const list = r() < .6 && ups.length ? ups : downs, V = list[(r()*list.length)|0];
        if(V) U.act({ type: 'nucleate', x, y, vac: V.i, r: 40 + r()*120 });
      }
      U.advance(STEP);
    }
    return U;
  }
  /* 在 (x0, y0) 附近找一個假真空的位置誕生玩家宇宙 */
  function spawnPlayer(U, vac, r, eta, x0 = 0, y0 = 0, mode){
    for(let k=0;k<400;k++){
      const a = k*2.399, rr = 20 + k*6, x = x0 + Math.cos(a)*rr, y = y0 + Math.sin(a)*rr;
      if(U.ownerAt(x, y, U.tSim)) continue;
      const act = U.act({ type: 'spawn', x, y, vac, r, eta, mode }); U.advance(STEP);
      if(act.result.ok) return act;
    }
    return null;
  }
  /* 有玩家宇宙的宇宙：預先演化 20 秒，在觀測者附近誕生玩家，之後每 0.5 秒隨機改變輸入（方向、目標半徑），偶爾施放技能 */
  const puCache = new Map();   // 只讀取的檢查共用同一個（確定性的）宇宙，節省時間
  function playerUniverse(seed, secs = 40, extra = {}){
    const key = JSON.stringify([seed, secs, extra]);
    if(!puCache.has(key)) puCache.set(key, makePlayerUniverse(seed, secs, extra));
    return puCache.get(key);
  }
  function makePlayerUniverse(seed, secs, extra){
    const U = createUniverse({ ...baseP, seed }, { ...baseT(), ...extra }), r = mulberry32(seed*13 + 5);
    U.presim(20);
    const vacs = U.VAC.filter(v => v.eps < 1);
    spawnPlayer(U, vacs[(r()*vacs.length)|0].i, 30 + r()*40);
    for(let i=0;i<secs*2;i++){
      const a = r()*TAU, m = r() < .2 ? 0 : r();
      U.act({ type: 'steer', dx: Math.cos(a)*m, dy: Math.sin(a)*m, rT: 15 + r()*90 });
      if(U.player && r() < .15){
        const c = U.circleAt(U.player, U.tSim), th = r()*TAU, d = c.r + 20 + r()*100, x = c.cx + Math.cos(th)*d, y = c.cy + Math.sin(th)*d;
        const own = U.ownerAt(x, y, U.tSim), pe = own ? U.VAC[own.b.vac].eps : 1, up = r() < .5;
        const list = U.VAC.filter(v => up ? v.eps > pe && v.kind !== 'rf' : v.eps < pe), V = list[(r()*list.length)|0];
        if(V) U.act({ type: 'nucleate', by: 'player', x, y, vac: V.i, r: 30 + r()*40 });
      }
      U.presim(.5);
    }
    return U;
  }
  /* 自動駕駛：每秒找一個前方（1～2 個哈伯半徑外）仍是假真空的方向前進，盡量沿著原方向 */
  function autopilot(U, secs, rT = 25){
    let dir = 0;
    for(let s=0;s<secs && U.player;s++){
      const P = U.player, c = U.circleAt(P, U.tSim); let best = null;
      for(let k=0;k<16;k++){
        const a = dir + (k % 2 ? 1 : -1)*Math.ceil(k/2)*Math.PI/8; let free = 0;
        for(const d of [1, 1.5, 2]) if(!U.ownerAt(c.cx + Math.cos(a)*(c.r + d*U.p.RH), c.cy + Math.sin(a)*(c.r + d*U.p.RH), U.tSim)) free++;
        if(free === 3){ best = a; break; } if(best === null && free) best = a;
      }
      if(best !== null) dir = best;
      U.act({ type: 'steer', dx: Math.cos(dir), dy: Math.sin(dir), rT });
      U.presim(1);
    }
  }
  return { baseP, baseT, buildRules, ownerMismatch, rayMismatch, actionUniverse, spawnPlayer, playerUniverse, autopilot };
}
