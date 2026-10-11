/* 核心｜自我檢查：方案 B 專屬（各區域各自的膨脹率） */
import { STEP, createUniverse } from '../universe.js';

export default h => {
  const { baseP, baseT, spawnPlayer } = h;
  return [
    { name: '方案 B：子泡泡留在母泡泡內', desc: '子泡泡以母宇宙內部的膨脹率流動（比母宇宙所在區域慢），它的光錐必須一直留在母泡泡的光錐內', run(){
      let bad = 0, n = 0;
      for(const [seed, typical] of [[4242, false], [99, false], [23, true]]){
        const U = createUniverse({ ...baseP, seed, typical }, baseT());
        for(let k=0;k<6;k++){
          U.presim(15); const t = U.tSim;
          for(const b of U.live){
            if(!b.parent || !(b.texit > t) || U.VAC[b.parent.vac].kind === 'up') continue;
            const c = U.circleAt(b, t), pc = U.circleAt(b.parent, t); n++;
            if(Math.hypot(c.cx - pc.cx, c.cy - pc.cy) + c.r > pc.r*(1 + 1e-9) + 1e-3) bad++;
          }
        }
      }
      return { pass: n > 100 && !bad, detail: `${n} 次觀測中子泡泡超出母泡泡 ${bad} 次` };
    }},
    { name: '方案 B：口袋內以自己的膨脹率遠離', desc: '同一個口袋宇宙裡的兩個子泡泡，中心距離以該宇宙的膨脹率 H·√ε 增加（而不是外面假真空的 H）', run(){
      const U = createUniverse(baseP, baseT()); U.presim(50);
      let worst = 0, n = 0; const t1 = U.tSim, t2 = t1 + 2;
      const kids = U.live.filter(b => b.parent && b.texit > t2 + 1 && U.VAC[b.parent.vac].kind === 'ds');
      const c1 = new Map(kids.map(b => [b, U.circleAt(b, t1)]));
      U.presim(2);
      for(let i=0;i<kids.length;i++) for(let j=0;j<i;j++){
        const a = kids[i], b = kids[j]; if(a.parent !== b.parent || !(a.texit > t2) || !(b.texit > t2)) continue;
        const d1 = Math.hypot(c1.get(a).cx - c1.get(b).cx, c1.get(a).cy - c1.get(b).cy);
        const A = U.circleAt(a, t2), B = U.circleAt(b, t2), d2 = Math.hypot(A.cx - B.cx, A.cy - B.cy);
        const want = Math.exp(U.hIn(a.parent)*(t2 - t1)); n++;
        worst = Math.max(worst, Math.abs(d2/d1 - want)/want);
      }
      return { pass: n > 5 && worst < 1e-6, detail: `${n} 對兄弟泡泡：距離增長率與 e^{h·Δt} 的最大相對誤差 ${worst.toExponential(1)}` };
    }},
    { name: '方案 B：玩家在口袋內的維持費', desc: '玩家在 Λ > 0 的口袋宇宙內維持大小：花費符合當地的膨脹率 2π·h·Δε·r²（h = H·√ε 比外面小，所以比在假真空中便宜）', run(){
      const U = createUniverse(baseP, { ...baseT(), gamma: 0 }); U.presim(1);
      const V = U.VAC.filter(v => v.eps < 1).sort((a, b) => a.eps - b.eps), lo = V[0], hi = V[V.length - 1];
      spawnPlayer(U, lo.i, 30, 1); const P = U.player; let c = U.circleAt(P, U.tSim);
      const a = U.act({ type: 'nucleate', x: c.cx + 45, y: c.cy, vac: hi.i }); U.advance(STEP);
      U.act({ type: 'steer', dx: 1, dy: 0, rT: 30 }); U.presim(3); U.act({ type: 'steer', dx: 0, dy: 0, rT: 30 }); U.presim(2);
      const Q = U.hist.find(b => b.id === a.result.id), n = P.ctl.t.length - 1, inPocket = P.ctl.reg[n] === Q;
      const E0 = P.ctl.E; U.presim(6);
      const h = U.hIn(Q), r = U.circleAt(P, U.tSim).r, theory = 2*Math.PI*h*(hi.eps - lo.eps)*(r/U.p.RH)**2*6, loss = E0 - P.ctl.E;
      const fv = 2*Math.PI*U.p.H*(1 - lo.eps)*(r/U.p.RH)**2*6;
      return { pass: inPocket && Math.abs(loss - theory) < .08*theory + .005, detail: `玩家${inPocket ? '在' : '不在'}口袋內；6 秒維持費 ${loss.toFixed(3)}（理論 ${theory.toFixed(3)}，在假真空中會是 ${fv.toFixed(3)}）` };
    }},
    { name: '方案 B：口袋內的推進前緣', desc: '玩家在 Λ > 0 的口袋宇宙內被較低真空的子泡泡 X 吞食：吞食的推進前緣與 X 的圓同心、在同一個空間（口袋內部）流動，每一步 ρ + v/h 都以 e^{h·Δt} 增長（h 是口袋的膨脹率 H·√ε，而不是外面假真空的 H），且永遠不超出 X 的光錐（曾誤用 H，前緣比光錐跑得還快）', run(){
      const U = createUniverse(baseP, { ...baseT(), gamma: 0 }); U.presim(1);
      const ds = U.VAC.filter(v => v.eps > 0 && v.eps < 1 && v.kind === 'ds').sort((a, b) => a.eps - b.eps);
      const pv = ds[0], qv = ds[1], xv = U.VAC.find(v => v.eps < 0);
      spawnPlayer(U, pv.i, 30, 1); const P = U.player; let c = U.circleAt(P, U.tSim);
      const qa = U.act({ type: 'nucleate', x: c.cx + 45, y: c.cy, vac: qv.i }); U.advance(STEP);
      U.act({ type: 'steer', dx: 1, dy: 0, rT: 30 }); U.presim(3); U.act({ type: 'steer', dx: 0, dy: 0, rT: 30 }); U.presim(2);
      const Q = U.hist.find(b => b.id === qa.result.id), inPocket = P.ctl.reg[P.ctl.reg.length - 1] === Q;
      c = U.circleAt(P, U.tSim);
      const xa = U.act({ type: 'nucleate', x: c.cx + c.r + 25, y: c.cy, vac: xv.i, r: 6 }); U.advance(STEP);
      const X = xa.result.ok ? U.hist.find(b => b.id === xa.result.id) : null;
      if(!X || X.parent !== Q || !inPocket) return { pass: false, detail: `情境沒有成立（玩家${inPocket ? '在' : '不在'}口袋內，X ${X ? (X.parent === Q ? '在口袋內' : '不在口袋內') : '沒有誕生'}）` };
      const h = U.hIn(Q), D = pv.eps - xv.eps, v = .85*D/(Math.abs(D) + .25)*U.tune.wallK*U.p.H*U.p.RH;
      let n = 0, worst = 0, outside = 0, prev = null;
      for(let i=0;i<6*30 && U.player;i++){
        U.advance(STEP); const t = U.tSim, arr = P.ctl.contacts.get(X.id);
        if(!arr || arr[arr.length - 1][1] !== Infinity || t - arr[arr.length - 1][0] < STEP*1.5){ prev = null; continue; }
        const rho = U.ringR(X, P, t);
        if(rho > U.circleAt(X, t).r*(1 + 1e-9)) outside++;
        if(prev){ const want = (prev.rho + v/h)*Math.exp(h*(t - prev.t)) - v/h; worst = Math.max(worst, Math.abs(rho - want)/want); n++; }
        prev = { t, rho };
      }
      return { pass: n >= 20 && worst < 1e-6 && !outside, detail: `${n} 步（口袋的 h = ${(h/U.p.H).toFixed(3)}·H）：前緣與 e^{h·Δt} 增長的最大相對誤差 ${worst.toExponential(1)}；超出 X 光錐 ${outside} 次` };
    }},
  ];
};
