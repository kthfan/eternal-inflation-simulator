/* 核心｜自我檢查：玩家宇宙（泡壁不超光速、能量帳、力竭、吞食、領域中的洞、曲速、再循環與遊戲結束） */
import { TAU, mulberry32 } from '../math.js';
import { Territory } from '../territory.js';
import { STEP, createUniverse, PLAYER } from '../universe.js';

export default h => {
  const { baseP, baseT, buildRules, ownerMismatch, rayMismatch, spawnPlayer, playerUniverse } = h;
  return [
    { name: '玩家宇宙：泡壁不超光速', desc: '隨機操控玩家宇宙 40 秒：每一步泡壁各點相對當地空間的速度 |u| + |w| 不超過光速，軌跡在各段交界處連續', run(){
      let over = 0, jump = 0, n = 0, worst = 0;
      for(const seed of [4242, 99]){
        const U = playerUniverse(seed), P = U.hist.find(b => b.ctl) || U.longs.find(b => b.ctl), C = P.ctl, c = U.p.H*U.p.RH;
        for(let i=0;i<C.t.length;i++){
          n++; const v = Math.hypot(C.ux[i], C.uy[i]) + Math.abs(C.w[i]); worst = Math.max(worst, v/c);
          if(v > c*(1 + 1e-9)) over++;
          if(i > 0){
            // 段與段的交界：前一段外推到交界時刻，與後一段的起點相同（用 circleAt 比較，與座標表示方式無關）
            const a = U.circleAt(P, C.t[i] - 1e-7), b = U.circleAt(P, C.t[i]), tol = 1e-4 + 1e-6*(Math.abs(b.cx) + Math.abs(b.cy) + b.r);
            if(Math.abs(a.cx - b.cx) > tol || Math.abs(a.cy - b.cy) > tol || Math.abs(a.r - b.r) > tol) jump++;
          }
        }
      }
      return { pass: n > 500 && !over && !jump, detail: `${n} 段軌跡：超光速 ${over} 段（最大 ${(worst*100).toFixed(1)}% c）、不連續 ${jump} 處` };
    }},
    { name: '玩家宇宙：移動的能量收支', desc: '均勻假真空中（不成核）：維持大小的花費符合 2π·H·Δε·r²；效率 η = 1 時移動本身淨收支為零（與靜止相同），η < 1 時移動較耗能', run(){
      const run = (eta, move) => {
        const U = createUniverse({ ...baseP, seed: 5 }, { ...baseT(), gamma: 0 });
        U.presim(1);
        const vac = U.VAC.findIndex(v => v.kind === 'ds'), act = spawnPlayer(U, vac, 40, eta), P = U.player, E0 = P.ctl.E;
        for(let i=0;i<24;i++){ const a = i*.7; U.act({ type: 'steer', dx: move ? Math.cos(a) : 0, dy: move ? Math.sin(a) : 0, rT: 40 }); U.presim(.5); }
        return { loss: E0 - P.ctl.E, gross: P.ctl.gain + P.ctl.loss, d: 1 - U.VAC[vac].eps, T: U.tSim - act.t, r: U.circleAt(P, U.tSim).r };
      };
      const s1 = run(1, false), m1 = run(1, true), m8 = run(.8, true), s8 = run(.8, false);
      const theory = 2*Math.PI*baseP.H*s1.d*(40/baseP.RH)**2*s1.T;
      const okHold = Math.abs(s1.loss - theory) < .05*theory, okMove = Math.abs(m1.loss - s1.loss) < .05*s1.loss, okEta = m8.loss > s8.loss*1.05;
      // 移動額外造成的地盤進出（前方吞入、後方退回）要夠多，「淨收支為零」才有意義：淨差須小於這個量的 5%
      const flux = m1.gross - s1.gross, okMove2 = flux > .3 && Math.abs(m1.loss - s1.loss) < .05*flux;
      return { pass: okHold && okMove && okMove2 && okEta,
        detail: `維持大小 12 秒：花費 ${s1.loss.toFixed(3)}（理論 ${theory.toFixed(3)}）；η=1 移動 ${m1.loss.toFixed(3)}（移動造成的進出 ${(m1.gross - s1.gross).toFixed(2)}）；η=0.8 移動 ${m8.loss.toFixed(3)}、靜止 ${s8.loss.toFixed(3)}` };
    }},
    { name: '玩家宇宙：力竭與失控', desc: '生存模式在均勻假真空中持續維持大小：能量耗盡就力竭（泡壁以光速自由膨脹、不能移動），恢復控制時不會每一步來回切換；大於哈伯半徑必定失控。輕鬆模式能量可以透支、不會力竭', run(){
      const run = mode => {
        const U = createUniverse({ ...baseP, seed: 5 }, { ...baseT(), gamma: 0 });
        U.presim(1);
        const vac = U.VAC.filter(v => v.eps < 1).sort((a, b) => a.eps - b.eps)[0].i;
        spawnPlayer(U, vac, 40, .8, 0, 0, mode); const P = U.player, C = P.ctl;
        U.act({ type: 'steer', dx: 1, dy: 0, rT: 40 });
        let flips = 0, prev = false, exh = 0, badFree = 0, badLost = 0, minE = Infinity, lastFlip = -Infinity, minGap = Infinity;
        for(let i=0;i<30*40 && U.player;i++){
          U.advance(STEP);
          const n = C.t.length - 1, c = U.circleAt(P, U.tSim), free = C.w[n] === U.p.H*U.p.RH && !C.ux[n] && !C.uy[n];
          if(C.exhausted !== prev){ flips++; prev = C.exhausted; minGap = Math.min(minGap, U.tSim - lastFlip); lastFlip = U.tSim; }
          if(C.exhausted){ exh++; if(!free) badFree++; }
          if(C.r[n] >= U.p.RH && !free) badLost++;
          minE = Math.min(minE, C.E);
        }
        return { flips, exh, badFree, badLost, minE, minGap };
      };
      const sv = run('survival'), rx = run('relaxed');
      const ok = sv.exh > 0 && sv.minGap >= .1 && !sv.badFree && !sv.badLost && !rx.exh && rx.minE < 0 && !rx.badLost;
      return { pass: ok, detail: `生存：力竭 ${(sv.exh*STEP).toFixed(1)} 秒、狀態切換 ${sv.flips} 次（最短間隔 ${sv.minGap.toFixed(2)} 秒）、力竭時仍受控制 ${sv.badFree} 步、失控時仍受控制 ${sv.badLost} 步；輕鬆：力竭 ${rx.exh} 步、最低能量 ${rx.minE.toFixed(2)}` };
    }},
    { name: '玩家宇宙：吞食與被奪走', desc: '在玩家旁邊放一個泡泡：真空能比玩家高的被吞食，玩家得到能量；比玩家低的會逐步奪走玩家的地盤與能量（與沒有放泡泡時比較），持續靠近終將被吞沒', run(){
      const run = (pVac, qVac, secs) => {
        const U = createUniverse({ ...baseP, seed: 5 }, { ...baseT(), gamma: 0 });
        U.presim(1); spawnPlayer(U, pVac, 30, .8, 0, 0);
        const P = U.player, c = U.circleAt(P, U.tSim);
        if(qVac !== null) U.act({ type: 'nucleate', x: c.cx + c.r + 20, y: c.cy, vac: qVac });
        U.act({ type: 'steer', dx: .6, dy: 0, rT: 30 });
        U.presim(secs);
        return P;
      };
      const V = createUniverse(baseP, baseT()).VAC.filter(v => v.eps < 1).sort((a, b) => a.eps - b.eps);
      const lo = V[0].i, hi = V[V.length - 1].i;
      const eatBase = run(lo, null, 3).ctl.E, eat = run(lo, hi, 3).ctl.E, hurtBase = run(hi, null, 2).ctl.E, hurt = run(hi, lo, 2).ctl.E;
      const end = run(hi, lo, 12), eaten = end.ctl.fate === 'eaten';
      return { pass: eat > eatBase + .02 && hurt < hurtBase - .02 && eaten,
        detail: `低能量玩家吞食高能量泡泡：能量 ${eat.toFixed(2)}（沒有泡泡時 ${eatBase.toFixed(2)}）；高能量玩家碰上低能量泡泡：${hurt.toFixed(2)}（沒有泡泡時 ${hurtBase.toFixed(2)}），持續靠近${eaten ? '最終被吞沒' : '沒有被吞沒'}` };
    }},
    { name: '玩家宇宙：被吞食是連續的', desc: '玩家的泡壁比光速慢，較低真空的泡泡光錐很快就會整個包住玩家；玩家仍只能被疇壁逐步吃掉（每一步失去的地盤不超過 8%），不能瞬間消失', run(){
      const U = createUniverse({ ...baseP, seed: 5 }, { ...baseT(), gamma: 0 }); U.presim(1);
      const V = U.VAC.filter(v => v.eps < 1).sort((a, b) => a.eps - b.eps);
      spawnPlayer(U, V[V.length - 1].i, 40, .8);
      const P = U.player, c = U.circleAt(P, U.tSim);
      U.act({ type: 'nucleate', x: c.cx + c.r + 15, y: c.cy, vac: V[0].i });
      const frac = () => {
        const t = U.tSim, c = U.circleAt(P, t); let n = 0, k = 0;
        for(let i=-12;i<=12;i++) for(let j=-12;j<=12;j++){
          const x = c.cx + i*c.r/12, y = c.cy + j*c.r/12; if((x - c.cx)**2 + (y - c.cy)**2 > c.r*c.r) continue;
          k++; const o = U.ownerAt(x, y, t); if(o && o.b === P) n++;
        }
        return n/k;
      };
      let prev = frac(), maxDrop = 0, contained = false;
      for(let i=0;i<30*10 && U.player;i++){
        U.advance(STEP); const f = frac(); maxDrop = Math.max(maxDrop, prev - f); prev = f;
        const q = U.hist.find(b => b.act && !b.ctl), cq = q && U.circleAt(q, U.tSim), cp = U.circleAt(P, U.tSim);
        if(cq && Math.hypot(cq.cx - cp.cx, cq.cy - cp.cy) + cp.r <= cq.r) contained = true;
      }
      return { pass: contained && maxDrop < .08 && P.ctl.fate === 'eaten', detail: `光錐${contained ? '已' : '未'}包住玩家；每步最多失去 ${(maxDrop*100).toFixed(1)}% 的地盤；${P.ctl.fate === 'eaten' ? '最終被吞沒' : '沒有被吞沒'}` };
    }},
    { name: '玩家宇宙：在同種真空的泡泡內', desc: '玩家走進自己用技能放下的同種真空泡泡：無縫融合、玩家保有自己的地盤，泡泡的其餘地盤要完整畫出（不能在玩家背後漏畫一片）', run(){
      const U = createUniverse(baseP, baseT()); U.presim(20);
      const V = U.VAC.filter(v => v.eps < 1).sort((a, b) => a.eps - b.eps), mid = V[Math.floor(V.length/2)];
      spawnPlayer(U, mid.i, 28, .8); const P = U.player; let c = U.circleAt(P, U.tSim);
      const a = U.act({ type: 'nucleate', by: 'player', x: c.cx + 70, y: c.cy, vac: mid.i }); U.advance(STEP);
      U.act({ type: 'steer', dx: 1, dy: 0, rT: 28 }); U.presim(3); U.act({ type: 'steer', dx: 0, dy: 0, rT: 28 }); U.presim(1);
      const t = U.tSim, { cs } = buildRules(U, t), Q = cs.find(x => x.b.id === a.result.id), pc = cs.find(x => x.b === P), r = mulberry32(17);
      const inside = !!Q && !!pc && Math.hypot(Q.cx - pc.cx, Q.cy - pc.cy) + pc.r < Q.r;
      let own = 0, miss = 0, mine = 0, n = 0;
      if(Q) for(let i=0;i<3000;i++){
        const th = r()*TAU, rr = Q.r*Math.sqrt(r()), x = Q.cx + Math.cos(th)*rr, y = Q.cy + Math.sin(th)*rr;
        if(!Territory.drawContains(Q, x, y)) continue; own++;
        if(rr > Territory.cellRay(Q, Math.cos(th), Math.sin(th), Q.r) + .5) miss++;     // 屬於泡泡卻不在畫出的多邊形內
      }
      for(let i=0;i<500;i++){ const th = r()*TAU, rr = pc.r*.95*Math.sqrt(r()), o = U.ownerAt(pc.cx + Math.cos(th)*rr, pc.cy + Math.sin(th)*rr, t); n++; if(o && o.b === P) mine++; }
      return { pass: inside && own > 500 && miss/own < .005 && mine === n, detail: `玩家${inside ? '在' : '不在'}泡泡內；泡泡的地盤中漏畫 ${(miss/Math.max(1, own)*100).toFixed(1)}%；玩家圓內 ${n} 點中屬於玩家 ${mine} 點` };
    }},
    { name: '玩家宇宙：可重現與不在內部成核', desc: '含玩家誕生、操控與技能的動作紀錄重播後完全相同（泡泡、能量、軌跡）；其他泡泡不會在玩家宇宙內誕生（即使它內部的穿隧率很高）', run(){
      const A = playerUniverse(4242, 30, { innerMul: 3 }), T = A.tSim;
      const B = createUniverse(baseP, { ...baseT(), innerMul: 3 }, { actions: A.actionLog() });
      while(B.tSim < T - 1e-9) B.advance(Math.min(.3711, T - B.tSim + 1e-9));
      const st = U => { const P = U.hist.find(b => b.ctl); const c = U.circleAt(P, T); return `${P.ctl.E.toFixed(9)}:${c.cx.toFixed(6)}:${c.cy.toFixed(6)}:${c.r.toFixed(6)}:${P.ctl.t.length}`; };
      const same = A.fingerprint(T) === B.fingerprint(T) && st(A) === st(B);
      let inside = 0, expect = 0;
      for(const U of [A, playerUniverse(99, 30, { innerMul: 3, gamma: 6e-6 })]){
        const P = U.hist.find(b => b.ctl);
        for(const b of U.hist) if(b.parent && b.parent.ctl && !(b.tn >= b.parent.ctl.releasedAt)) inside++;   // 放手之後就是一般的泡泡
        // 若沒有禁止，玩家宇宙內部預期會有多少次成核（以它的穿隧率與存活期間的面積估計）
        for(let t = P.tn; t < U.tSim; t += .5){ const c = U.circleAt(P, t); expect += U.tune.gamma*U.VAC[P.vac].grel*U.tune.innerMul*Math.PI*c.r*c.r*.5; }
      }
      const acts = A.actions.filter(a => a.result && a.result.ok).length;
      return { pass: same && !inside && acts > 15, detail: `${A.actions.length} 個動作（成功 ${acts}）重播${same ? '完全一致' : '不一致'}；玩家宇宙內的成核 ${inside} 次（若不禁止，預期約 ${expect.toFixed(0)} 次）` };
    }},
    { name: '玩家宇宙：歸屬一致', desc: '有玩家宇宙在泡泡間移動時：物理與畫面歸屬一致、射線邊界與逐點判斷吻合', run(){
      let mis = 0, n = 0, bad = 0, rays = 0;
      for(const seed of [4242, 99]){
        const U = playerUniverse(seed), r = mulberry32(seed + 9), P = U.hist.find(b => b.ctl);
        for(let t = P.tn + 1; t <= U.tSim; t += 2){
          mis += ownerMismatch(U, t, r, 500); n += 500;
          const { cs } = buildRules(U, t), pc = cs.find(c => c.b === P);
          const m = rayMismatch(cs, r, c => c === pc || (pc && c.rules.some(R => Territory.otherOf(R, c) === pc)), 24); bad += m.bad; rays += m.n;
        }
      }
      return { pass: rays > 100 && mis/n < .002 && bad/rays < .01, detail: `${n} 個取樣點中 ${mis} 個不一致；玩家與鄰居 ${rays} 條射線中 ${bad} 條不吻合（${(bad/Math.max(1,rays)*100).toFixed(2)}%）` };
    }},
    { name: '玩家宇宙：曲速與量子利息', desc: '曲速（D12）：中心以 k·c 被搬動（空間本身移動，可超過光速），泡壁相對被搬動的空間仍不超光速、軌跡連續；方向跟著輸入改變、放開則維持；借貸速率 × 持續時間² 到上限 Q 自動結束；結束後在 repayT 秒內償還 借貸 × (1 + 持續時間/TI)，償還期間不能再啟動；搬動本身不轉手地盤（曲速期間的花費與只維持大小相同）；碰到其他泡泡不脫離、可以穿過較高真空的泡泡；能從以光速擴張、包住自己的泡泡裡逃出去（光速以內做不到）；重播完全相同', run(){
      const W = PLAYER.warp, fails = [];
      const mk = (gamma = 0) => { const U = createUniverse({ ...baseP, seed: 5 }, { ...baseT(), gamma }); U.presim(1);
        spawnPlayer(U, U.VAC.findIndex(v => v.kind === 'ds'), 28, .8); return U; };
      // 1. 速度、方向鎖定、上限、利息、償還
      const U = mk(), P = U.player, C = P.ctl, c = U.p.H*U.p.RH;
      const E0 = C.E, a = U.act({ type: 'warp', on: true, dx: 1, dy: 0, k: 5 }); U.advance(STEP);
      // 曲速中轉向：先往右 1 秒，按住「下」1 秒，放開後應維持往下
      let speedErr = 0, dirR = 1, dirD = 1, dirKeep = 1, restart = null;
      for(let i=0;i<400 && C.warp;i++){
        if(i === 30) U.act({ type: 'steer', dx: 0, dy: 1, rT: 28 });
        if(i === 60) U.act({ type: 'steer', dx: 0, dy: 0, rT: 28 });
        const t = U.tSim, A = U.circleAt(P, t + STEP/2), B = U.circleAt(P, t), H = U.p.H, e = Math.exp(H*STEP/2);
        const vx = (A.cx - B.cx*e)*H/(e - 1), vy = (A.cy - B.cy*e)*H/(e - 1), v = Math.hypot(vx, vy);   // 相對當地空間的中心速度
        speedErr = Math.max(speedErr, Math.abs(v - 5*c)/(5*c));
        if(i > 2 && i < 30) dirR = Math.min(dirR, vx/v); else if(i > 32 && i < 60) dirD = Math.min(dirD, vy/v); else if(i > 62) dirKeep = Math.min(dirKeep, vy/v);
        U.advance(STEP);
      }
      const lw = C.lastWarp, rate = W.kappa*25*(28/U.p.RH)**2, tauMax = Math.sqrt(W.Q/rate);
      if(!lw) return { pass: false, detail: `曲速 ${(400*STEP).toFixed(0)} 秒內沒有結束（量子不等式的上限沒有作用）` };
      if(!a.result.ok) fails.push('啟動失敗');
      if(speedErr > 1e-3) fails.push(`速度誤差 ${speedErr.toExponential(1)}`);
      if(dirR < .9999 || dirD < .9999 || dirKeep < .9999) fails.push(`轉向不正確（往右 ${dirR.toFixed(4)}、轉下 ${dirD.toFixed(4)}、放開後 ${dirKeep.toFixed(4)}）`);
      if(!lw || lw.why !== '量子不等式的上限' || Math.abs(lw.tau - tauMax) > 2*STEP) fails.push(`上限不符（${lw && lw.tau.toFixed(2)} 秒，理論 ${tauMax.toFixed(2)}）`);
      if(lw && Math.abs(lw.due - lw.borrowed*(1 + lw.tau/W.TI)) > 1e-9) fails.push('利息不符');
      if(lw && Math.abs(lw.borrowed - rate*lw.tau)/(rate*lw.tau) > .03) fails.push(`借貸不符（${lw.borrowed.toFixed(3)}，理論 ${(rate*lw.tau).toFixed(3)}）`);
      restart = U.act({ type: 'warp', on: true, dx: 1, dy: 0 }); U.advance(STEP);
      if(restart.result.ok) fails.push('償還期間可以再啟動');
      const Ea = C.E + 0; U.presim(W.repayT + 2*STEP);
      if(C.repay) fails.push('沒有如期還完');
      // 2. 搬動本身不轉手地盤：曲速期間（不含償還）的花費 = 同樣時間只維持大小的花費
      const V2 = mk(), P2 = V2.player; const e2 = P2.ctl.E; V2.advance(STEP); V2.presim(lw.tau); const hold = e2 - P2.ctl.E;
      const V3 = mk(), P3 = V3.player; const e3 = P3.ctl.E; V3.act({ type: 'warp', on: true, dx: 1, dy: 0, k: 5 }); V3.advance(STEP);
      while(P3.ctl.warp) V3.advance(STEP);
      const paid = P3.ctl.lastWarp.due - (P3.ctl.repay ? P3.ctl.repay.left : 0), during = e3 - P3.ctl.E - paid;   // 結束的那一步已開始償還，扣掉
      if(Math.abs(during - hold) > .08*hold) fails.push(`曲速期間的花費 ${during.toFixed(3)}，只維持大小 ${hold.toFixed(3)}`);
      // 3. 泡壁相對空間不超光速、軌跡連續（含曲速段）
      let over = 0, jump = 0;
      for(let i=0;i<C.t.length;i++){
        if(Math.hypot(C.ux[i], C.uy[i]) + Math.abs(C.w[i]) > c*(1 + 1e-9)) over++;
        if(i > 0){ const p0 = U.circleAt(P, C.t[i] - 1e-7), p1 = U.circleAt(P, C.t[i]), tol = 1e-3 + 1e-6*(Math.abs(p1.cx) + Math.abs(p1.cy) + p1.r);
          if(Math.abs(p0.cx - p1.cx) > tol || Math.abs(p0.cy - p1.cy) > tol || Math.abs(p0.r - p1.r) > tol) jump++; }
      }
      if(over || jump) fails.push(`超光速 ${over} 段、不連續 ${jump} 處`);
      // 4. 碰到其他泡泡不脫離：穿過真空能比自己高的泡泡（搬動空間本身，不轉手地盤），繼續前進到它的另一側
      const V4 = mk(), P4 = V4.player, c4 = V4.circleAt(P4, V4.tSim), V = V4.VAC.filter(v => v.eps < 1 && v.kind !== 'up');
      const xa = V4.act({ type: 'nucleate', x: c4.cx + 2.5*V4.p.RH, y: c4.cy, vac: V[V.length - 1].i }); V4.advance(STEP);
      V4.act({ type: 'warp', on: true, dx: 1, dy: 0, k: 10 }); V4.advance(STEP);
      while(P4.ctl.warp) V4.advance(STEP);
      const X = V4.hist.find(b => b.id === xa.result.id), px = V4.circleAt(P4, V4.tSim), qx = V4.circleAt(X, V4.tSim);
      if(!V4.player || P4.ctl.lastWarp.why !== '量子不等式的上限' || !(px.cx > qx.cx + qx.r*.2) || !isFinite(P4.ctl.E)) fails.push(`穿過泡泡：${P4.ctl.lastWarp ? P4.ctl.lastWarp.why : '沒有結束'}，玩家${px.cx > qx.cx ? '已' : '未'}越過泡泡中心`);
      // 5. 逃出以光速擴張、包住自己的泡泡（同種真空，玩家保有自己的圓）：光速以內永遠追不上它的泡壁
      const esc = warpOn => {
        const U5 = mk(), P5 = U5.player, c5 = U5.circleAt(P5, U5.tSim);
        const qa = U5.act({ type: 'nucleate', x: c5.cx + 40, y: c5.cy, vac: P5.vac }); U5.advance(STEP);
        const Q = U5.hist.find(b => b.id === qa.result.id); U5.presim(3);
        let out = false;
        for(let i=0;i<12 && !out;i++){
          if(warpOn && !P5.ctl.warp && !P5.ctl.repay) U5.act({ type: 'warp', on: true, dx: -1, dy: 0, k: W.kMax });
          else U5.act({ type: 'steer', dx: -1, dy: 0, rT: 28 });
          U5.presim(1);
          const pc = U5.circleAt(P5, U5.tSim), qc = U5.circleAt(Q, U5.tSim);
          if(Math.hypot(pc.cx - qc.cx, pc.cy - qc.cy) - pc.r > qc.r) out = true;
        }
        return out;
      };
      const escW = esc(true), escS = esc(false);
      if(!escW || escS) fails.push(`逃出包住自己的泡泡：曲速${escW ? '可以' : '不行'}、光速以內${escS ? '可以' : '不行'}`);
      // 6. 重播
      const log = U.actionLog(), R = createUniverse({ ...baseP, seed: 5 }, { ...baseT(), gamma: 0 }, { actions: log });
      R.presim(U.tSim); const same = R.fingerprint(U.tSim) === U.fingerprint(U.tSim) && R.player && Math.abs(R.player.ctl.E - C.E) < 1e-12;
      if(!same) fails.push('重播不一致');
      return { pass: !fails.length, detail: fails.length ? fails.join('；') :
        `5c：速度誤差 ${speedErr.toExponential(1)}、可轉向、持續 ${lw.tau.toFixed(2)} 秒（上限 ${tauMax.toFixed(2)}）、借貸 ${lw.borrowed.toFixed(2)}、償還 ${lw.due.toFixed(2)}；曲速期間花費 ${during.toFixed(3)}（只維持大小 ${hold.toFixed(3)}）；穿過較高真空的泡泡；曲速能逃出包住自己的泡泡、光速以內不能；重播一致` };
    }},
    { name: '玩家宇宙：再循環與遊戲結束', desc: '再循環（D13）：在 Λ > 0 的口袋宇宙中以自己為中心向上穿隧出再循環假真空，半徑 = margin × 當地哈伯半徑、成本 = Δε × 面積；區域永遠縮不掉、內部以假真空的穿隧率重新成核（子泡泡的真空都比假真空低）。假真空中、Λ ≤ 0 的宇宙中不能使用；困在 Λ ≤ 0 處 trapT 秒就遊戲結束，及時用曲速逃出則不會；重播完全相同', run(){
      const RC = PLAYER.recycle, fails = [];
      const setup = (gamma, pick) => {
        const U = createUniverse({ ...baseP, seed: 4242 }, { ...baseT(), gamma }); U.presim(1);
        const V = U.VAC.filter(v => v.eps < 1 && v.kind !== 'rf' && v.kind !== 'up').sort((a, b) => a.eps - b.eps);
        const pv = V[0], qv = pick(V, pv);
        spawnPlayer(U, pv.i, 20, .8, 0, 0, 'relaxed'); const P = U.player, c = U.circleAt(P, U.tSim);
        return { U, P, c, qv };
      };
      // 1. 在 Λ > 0 的口袋宇宙中再循環
      const A = setup(3e-5, V => V.filter(v => v.kind === 'ds').pop()), U = A.U, P = A.P;   // 穿隧率調高：後選會排除玩家泡壁一個哈伯半徑內的誕生，區域要長大一些才有空間成核
      const r1 = U.act({ type: 'recycle' }); U.advance(STEP);
      if(r1.result.ok) fails.push('假真空中也能再循環');
      const qa = U.act({ type: 'nucleate', x: A.c.cx + 30, y: A.c.cy, vac: A.qv.i }); U.advance(STEP);
      U.presim(5);
      const Q = U.hist.find(b => b.id === qa.result.id), E0 = P.ctl.E, ra = U.act({ type: 'recycle' }); U.advance(STEP);
      let detail1 = '';
      if(!ra.result.ok) fails.push(`口袋中無法再循環：${ra.result.reason}`);
      else {
        const R = U.hist.find(b => b.id === ra.result.id), hq = U.hIn(Q), rWant = RC.margin*(U.p.localH ? U.p.H*U.p.RH/hq : U.p.RH);
        const cost = (1 - U.VAC[Q.vac].eps)*Math.PI*rWant*rWant/(U.p.RH*U.p.RH);
        if(Math.abs(ra.result.r0 - rWant) > 1e-9 || Math.abs(ra.result.cost - cost) > 1e-9) fails.push('半徑或成本不符');
        if(R.parent !== Q || U.VAC[R.vac].kind !== 'rf') fails.push('母宇宙或真空不符');
        let shrink = 0, prev = U.circleAt(R, U.tSim).r;
        for(let i=0;i<24;i++){ U.presim(.5); const r = U.circleAt(R, U.tSim).r; if(r < prev - 1e-9) shrink++; prev = r; }
        const kids = U.hist.filter(b => b.parent === R), badKid = kids.filter(b => !(U.VAC[b.vac].eps < 1)).length;
        if(shrink || !(prev > 1.5*rWant)) fails.push(`區域沒有持續長大（縮小 ${shrink} 次，12 秒後 ${(prev/rWant).toFixed(2)} 倍）`);
        if(kids.length < 3 || badKid) fails.push(`區域內重新成核 ${kids.length} 個（真空不低於假真空的 ${badKid} 個）`);
        detail1 = `口袋中再循環：半徑 ${(rWant/U.p.RH).toFixed(2)} RH、成本 ${cost.toFixed(2)}、12 秒後長到 ${(prev/rWant).toFixed(2)} 倍、區域內成核 ${kids.length} 個`;
      }
      // 2. 困在 Λ ≤ 0：不逃 → 遊戲結束；用曲速逃 → 存活
      const trap = escape => {
        const B = setup(0, (V, pv) => V.filter(v => v.eps <= 0 && v.eps > pv.eps).pop()), W = B.U, P2 = B.P;
        W.act({ type: 'nucleate', x: B.c.cx + 30, y: B.c.cy, vac: B.qv.i }); W.advance(STEP);
        let refused = null;
        for(let i=0;i<(RC.trapT + 6)*30 && W.player;i++){
          if(P2.ctl.trap > .5 && refused === null){ const a = W.act({ type: 'recycle' }); W.advance(STEP); refused = !a.result.ok; continue; }
          if(escape && P2.ctl.trap > 1 && !P2.ctl.warp && !P2.ctl.repay && P2.ctl.E > 0) W.act({ type: 'warp', on: true, dx: -1, dy: 0, k: 15 });
          W.advance(STEP);
        }
        return { W, P2, refused, fate: W.player ? 'alive' : P2.ctl.fate };
      };
      const T0 = trap(false), T1 = trap(true);
      if(T0.fate !== 'trapped' || !T0.refused) fails.push(`困住：${T0.fate}、再循環${T0.refused ? '被拒絕' : '沒有被拒絕'}`);
      if(T1.fate !== 'alive') fails.push(`用曲速逃出仍${T1.fate === 'trapped' ? '遊戲結束' : '死亡'}`);
      // 3. 重播
      const R2 = createUniverse({ ...baseP, seed: 4242 }, { ...baseT(), gamma: 0 }, { actions: T0.W.actionLog() }); R2.presim(T0.W.tSim);
      if(R2.fingerprint(T0.W.tSim) !== T0.W.fingerprint(T0.W.tSim) || R2.player) fails.push('重播不一致');
      return { pass: !fails.length, detail: fails.length ? fails.join('；') : `${detail1}；困在 Λ ≤ 0 ${RC.trapT} 秒後遊戲結束、曲速逃出則存活；重播一致` };
    }},
    { name: '玩家宇宙：在較低真空的泡泡內（領域中的洞）', desc: '較低真空的泡泡 X 的光錐包住玩家、推進前緣還沒到時，X 的領域中間有一個洞（玩家）。畫面把它拆成「射線多邊形（不理會洞）」扣掉「洞（從玩家中心沿射線求出）」：在 X 的圓內取點，拆解的結果必須與 drawContains 相同（射線法若被洞擋住，玩家背後整片會漏畫）', run(){
      const U = createUniverse(baseP, { ...baseT(), gamma: 0 }); U.presim(1);
      const V = U.VAC.filter(v => v.eps < 1 && v.kind !== 'up').sort((a, b) => a.eps - b.eps);
      const pv = V[Math.floor(V.length*.6)], xv = V.filter(v => v.eps < pv.eps).pop();
      spawnPlayer(U, pv.i, 25, 1, 0, 0, 'relaxed'); const P = U.player; if(!P) return { pass: false, detail: '玩家誕生失敗' };
      const c = U.circleAt(P, U.tSim), xa = U.act({ type: 'nucleate', x: c.cx + 70, y: c.cy, vac: xv.i }); U.advance(STEP);
      const r = mulberry32(17); let frames = 0, n = 0, bad = 0;
      for(let i=0;i<60 && U.player;i++){
        U.advance(.1);
        const { cs } = buildRules(U, U.tSim), X = cs.find(q => q.b.id === xa.result.id); if(!X) continue;
        const holes = X.rules.filter(R => Territory.isHole(R, X)); if(!holes.length) continue;
        frames++;
        const L = holes[0].L;
        for(let k=0;k<300;k++){
          // 一半的點取在玩家附近（洞與洞的「影子」），一半取在整個 X 內
          const near = k < 150, rr = near ? L.r*4*Math.sqrt(r()) : X.r*Math.sqrt(r()), a = r()*TAU;
          const ox = near ? L.cx : X.cx, oy = near ? L.cy : X.cy, x = ox + Math.cos(a)*rr, y = oy + Math.sin(a)*rr;
          const dx = x - X.cx, dy = y - X.cy, d = Math.hypot(dx, dy); if(d < 1e-6 || d >= X.r) continue;
          const rho = Territory.cellRay(X, dx/d, dy/d, X.r);
          if(Math.abs(d - rho) < 1e-6*X.r) continue;
          let inHole = false;
          for(const R of holes){ const hx = x - R.L.cx, hy = y - R.L.cy, s = Math.hypot(hx, hy); if(s >= R.L.r) continue;
            const [h0, h1] = s > 0 ? Territory.holeSpan(R, hx/s, hy/s) : Territory.holeSpan(R, 1, 0);
            if(Math.abs(s - h0) < 1e-6*R.L.r || Math.abs(s - h1) < 1e-6*R.L.r) { inHole = null; break; }
            if(s >= h0 && s < h1) inHole = true; }
          if(inHole === null) continue;
          n++; if((d < rho && !inHole) !== Territory.drawContains(X, x, y)) bad++;
        }
      }
      return { pass: frames >= 5 && n > 1000 && !bad, detail: `有洞的時刻 ${frames} 個；${n} 個點中 ${bad} 個與 drawContains 不一致` };
    }},
  ];
};
