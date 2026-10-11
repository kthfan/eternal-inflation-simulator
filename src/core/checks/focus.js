/* 核心｜自我檢查：焦點跟隨（平移原點、長途移動、曲速長途、進入大泡泡） */
import { TAU, mulberry32 } from '../math.js';
import { STEP, createUniverse, PLAYER } from '../universe.js';
const PLAYER_RECENTER = PLAYER.recenter;

export default h => {
  const { baseP, baseT, spawnPlayer, autopilot } = h;
  return [
    { name: '焦點跟隨：平移不變', desc: '把原點換到另一個共動點：所有圓只差一個平移、半徑不變，每一點的歸屬與換之前相同；仍在模擬範圍內的泡泡不會被丟棄', run(){
      const U = createUniverse(baseP, baseT()); U.presim(40);
      spawnPlayer(U, U.VAC.findIndex(v => v.kind === 'ds'), 30, .8);
      U.act({ type: 'steer', dx: .8, dy: -.4, rT: 40 }); U.presim(3);     // 含玩家的逐段軌跡
      const t = U.tSim, r = mulberry32(3);
      const before = new Map(U.aliveAt(t).map(b => [b, U.circleAt(b, t)]));
      const pts = []; for(let i=0;i<1500;i++){ const rr = 2000*Math.sqrt(r()), a = r()*TAU; pts.push([Math.cos(a)*rr, Math.sin(a)*rr]); }
      const own0 = pts.map(([x, y]) => { const o = U.ownerAt(x, y, t); return o ? o.b : null; });
      const dx = 260, dy = -170; U.rebase(dx, dy);
      let geo = 0, mis = 0, dropped = 0;
      for(const [b, c0] of before){
        const c1 = U.circleAt(b, t), tol = 1e-6*(1 + Math.abs(c0.cx) + Math.abs(c0.cy) + c0.r);
        if(Math.abs(c1.cx - (c0.cx - dx)) > tol || Math.abs(c1.cy - (c0.cy - dy)) > tol || Math.abs(c1.r - c0.r) > tol) geo++;
        // 被丟棄的（下一步就流出）必須離新原點夠遠：近側邊緣超過模擬範圍
        if(b.texit <= t + STEP && !b.retired && Math.hypot(c1.cx, c1.cy) - c1.r < U.p.RGEN - 200 && c1.r > 1) dropped++;
      }
      pts.forEach(([x, y], i) => { const o = U.ownerAt(x - dx, y - dy, t); if((o ? o.b : null) !== own0[i]) mis++; });
      return { pass: before.size > 100 && [...before.keys()].some(b => b.ctl) && !geo && mis <= 1 && !dropped, detail: `${before.size} 個泡泡：幾何不符 ${geo}；${pts.length} 個點中歸屬改變 ${mis}；誤丟仍在範圍內的泡泡 ${dropped}` };
    }},
    { name: '焦點跟隨：長途移動', desc: '玩家自動駕駛往假真空前進 150 秒：模擬區域跟著玩家（玩家附近持續有泡泡誕生、玩家離原點不超過置中門檻）、座標保持有限、被丟棄的泡泡離玩家泡壁超過 2·RH（永遠碰不到），且重播完全相同', run(){
      const U = createUniverse({ ...baseP, seed: 4242 }, { ...baseT(), gamma: 4e-7 }); U.presim(20);
      const vac = U.VAC.filter(v => v.eps < 1).sort((a, b) => a.eps - b.eps)[0].i;
      spawnPlayer(U, vac, 25, .8);
      const P = U.player, t0 = U.tSim; let far = 0;
      U.on('rebase', () => {});
      for(let k=0;k<5;k++){ autopilot(U, 30); if(U.player){ const c = U.circleAt(P, U.tSim); if(Math.hypot(c.cx, c.cy) > (PLAYER_RECENTER + .3)*U.p.RH) far++; } }
      const T = U.tSim;
      // 每 30 秒區間裡，在玩家 3 個哈伯半徑內誕生的泡泡數（以誕生當下玩家的位置計算）
      const near = [0, 0, 0, 0, 0];
      for(const b of U.hist){ if(b === P || b.tn < t0) continue; const q = U.circleAt(P, b.tn); if(Math.hypot(b.x - q.cx, b.y - q.cy) < 3*U.p.RH) near[Math.min(4, Math.floor((b.tn - t0)/30))]++; }
      let bad = 0, n = 0, finite = true;
      for(const b of U.hist){
        if(b === P || b.retired || b.ctl || !(b.texit < T) || b.tn < t0) continue;
        const c = U.circleAt(b, b.texit); if(b.s < 0 && c.r < 1) continue;     // 縮成一點的不算
        const pc = U.circleAt(P, b.texit); n++;
        if(Math.hypot(c.cx - pc.cx, c.cy - pc.cy) - c.r - pc.r < 2*U.p.RH) bad++;
      }
      for(const b of U.live){ const c = U.circleAt(b, T); if(!isFinite(c.cx) || !isFinite(c.cy) || !isFinite(c.r)) finite = false; }
      const B = createUniverse({ ...baseP, seed: 4242 }, { ...baseT(), gamma: 4e-7 }, { actions: U.actionLog() });
      while(B.tSim < T - 1e-9) B.advance(Math.min(.3711, T - B.tSim + 1e-9));
      const same = B.fingerprint(T) === U.fingerprint(T) && B.recenters === U.recenters;
      const ok = !!U.player && U.recenters > 50 && near.slice(0, 4).every(v => v >= 2) && !far && n > 50 && !bad && finite && same;
      return { pass: ok, detail: `置中 ${U.recenters} 次；每 30 秒在玩家附近誕生 ${near.join('、')}；離原點過遠 ${far} 次；丟棄 ${n} 個泡泡中可能再碰到的 ${bad} 個；重播${same ? '完全一致' : '不一致'}` };
    }},
    { name: '焦點跟隨：曲速長途', desc: '玩家反覆以最高曲速（kMax·c）往假真空跳躍（每次 0.6 秒），共 90 秒：被丟棄的泡泡離玩家泡壁超過 (1 + kMax)·RH（玩家以 kMax·c、泡壁以光速相向也永遠碰不到，A2 仍然精確），座標保持有限，且重播完全相同', run(){
      const W = PLAYER.warp, U = createUniverse({ ...baseP, seed: 4242 }, { ...baseT(), gamma: 4e-7 }); U.presim(20);
      const vac = U.VAC.filter(v => v.eps < 1).sort((a, b) => a.eps - b.eps)[0].i;
      spawnPlayer(U, vac, 10, .8);     // 小泡泡：曲速的借貸 ∝ r²，付得起多次跳躍
      const P = U.player, t0 = U.tSim; let warps = 0;
      while(U.tSim < t0 + 90 && U.player){
        autopilot(U, 3, 10);
        if(!U.player) break;
        const C = P.ctl; if(C.warp || C.repay) continue;
        const a = U.act({ type: 'warp', on: true, dx: C.in.dx || 1, dy: C.in.dy, k: W.kMax }); U.advance(STEP);
        if(a.result.ok) warps++;
        U.presim(.6); if(C.warp) U.act({ type: 'warp', on: false });     // 每次 0.6 秒（約 2 RH），量子利息才付得起
        while(C.warp && U.player) U.advance(STEP);
      }
      const T = U.tSim, lim = (1 + W.kMax)*U.p.RH;
      let bad = 0, n = 0, finite = true, minGap = Infinity;
      for(const b of U.hist){
        if(b === P || b.retired || b.ctl || !(b.texit < T) || b.tn < t0) continue;
        const c = U.circleAt(b, b.texit); if(b.s < 0 && c.r < 1) continue;
        const pc = U.circleAt(P, b.texit), gap = Math.hypot(c.cx - pc.cx, c.cy - pc.cy) - c.r - pc.r; n++;
        minGap = Math.min(minGap, gap); if(gap < lim) bad++;
      }
      for(const b of U.live){ const c = U.circleAt(b, T); if(!isFinite(c.cx) || !isFinite(c.cy) || !isFinite(c.r)) finite = false; }
      const B = createUniverse({ ...baseP, seed: 4242 }, { ...baseT(), gamma: 4e-7 }, { actions: U.actionLog() });
      while(B.tSim < T - 1e-9) B.advance(Math.min(.3711, T - B.tSim + 1e-9));
      const same = B.fingerprint(T) === U.fingerprint(T) && B.recenters === U.recenters;
      const ok = !!U.player && warps >= 5 && n > 50 && !bad && finite && same;
      return { pass: ok, detail: `曲速 ${warps} 次、置中 ${U.recenters} 次；丟棄 ${n} 個泡泡，離玩家最近 ${(minGap/U.p.RH).toFixed(1)} RH（下限 ${(1 + W.kMax)} RH），可能再碰到的 ${bad} 個；重播${same ? '完全一致' : '不一致'}${U.player ? '' : '；玩家被吞沒'}` };
    }},
    { name: '焦點跟隨：進入大泡泡', desc: '在玩家 1.3 個哈伯半徑外放一個泡泡（原本會在約 17 秒後流出模擬範圍），玩家飛進去並在裡面持續前進：只要它還包住玩家，就不能因為原點移動而被丟棄', run(){
      const U = createUniverse({ ...baseP, seed: 4242 }, { ...baseT(), gamma: 0 }); U.presim(1);
      const V = U.VAC.filter(v => v.eps < 1).sort((a, b) => a.eps - b.eps);
      spawnPlayer(U, V[0].i, 25, .8);
      const P = U.player, c = U.circleAt(P, U.tSim);
      const a = U.act({ type: 'nucleate', x: c.cx + 1.3*U.p.RH, y: c.cy, vac: V[V.length - 1].i }); U.advance(STEP);
      const Q = U.hist.find(b => b.id === a.result.id), texit0 = Q.texit;
      U.act({ type: 'steer', dx: 1, dy: 0, rT: 25 });
      let lost = 0, inside = 0;
      for(let i=0;i<60;i++){
        U.presim(.5);
        const pc = U.circleAt(P, U.tSim), qc = U.circleAt(Q, U.tSim), contains = Math.hypot(qc.cx - pc.cx, qc.cy - pc.cy) + pc.r < qc.r;
        if(contains){ inside++; if(!U.live.includes(Q)) lost++; }
      }
      return { pass: isFinite(texit0) && U.tSim > texit0 + 5 && inside > 20 && !lost && U.recenters > 3,
        detail: `泡泡原本的流出時刻 ${texit0.toFixed(1)} 秒（現在 ${U.tSim.toFixed(1)} 秒）；包住玩家的 ${inside} 次觀測中被丟棄 ${lost} 次；置中 ${U.recenters} 次` };
    }},
  ];
};
