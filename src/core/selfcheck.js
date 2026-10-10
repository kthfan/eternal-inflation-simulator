/* 核心｜自我檢查：用全新的宇宙實例驗證不變式。瀏覽器內的「自我檢查」按鈕與 npm test 執行的是同一組。 */
import { TAU, mulberry32 } from './math.js';
import { Territory } from './territory.js';
import { STEP, createUniverse, PLAYER } from './universe.js';
const PLAYER_RECENTER = PLAYER.recenter;

/* ---------- 自我檢查：用全新的宇宙實例驗證不變式（不影響正在執行的模擬） ---------- */
/* extraP：附加的宇宙參數（例如 { localH: true } 以方案 B 跑同一組不變式） */
export function buildSelfCheck(extraP = {}){
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
  const tests = [
    { name: '可重現性', desc: '同一個種子、以不同的時間切分推進，前 25 秒的每個泡泡必須完全相同', run(){
      const A = createUniverse(baseP, baseT()), B = createUniverse(baseP, baseT());
      for(let i=0;i<30*30;i++) A.advance(STEP);
      for(let i=0;i<81;i++) B.advance(.3711);
      const fa = A.fingerprint(25), fb = B.fingerprint(25);
      return { pass: fa === fb && fa.length > 0, detail: `${A.bornBy(25)} 個泡泡${fa === fb ? '完全一致' : '不一致'}` };
    }},
    { name: '成核合法性', desc: '每個泡泡誕生處的擁有者必須正是它的母宇宙；只有仍在暴脹的宇宙能成核，大擠壓區更不行', run(){
      let bad = 0, ads = 0, crunched = 0, n = 0;
      for(const typical of [false, true]){
        const U = createUniverse({ ...baseP, seed: typical ? 23 : 4242, typical }, baseT());
        U.presim(60);
        for(const b of U.hist){
          const t = b.tn, F = U.frame(t), cs = U.aliveAt(t).filter(o => o.id < b.id).map(o => U.circleAt(o, t));
          const own = Territory.ownerAt(F, cs, b.x, b.y); n++;
          if((own ? own.b : null) !== b.parent) bad++;
          if(b.parent && U.VAC[b.parent.vac].kind !== 'ds' && U.VAC[b.parent.vac].kind !== 'rf') ads++;
          if(b.parent && U.crunchedAt(b.parent, b.x, b.y, t)) crunched++;
        }
      }
      return { pass: !bad && !ads && !crunched, detail: `檢查 ${n} 個泡泡：歸屬不符 ${bad}、誕生在不再暴脹的宇宙 ${ads}、誕生在大擠壓區 ${crunched}` };
    }},
    { name: '物理與畫面歸屬一致', desc: '隨機取點，模擬判定的擁有者必須等於畫面上實際顯示的宇宙', run(){
      let mis = 0, n = 0;
      for(const [seed, typical] of [[4242, false], [99, false], [23, true]]){
        const U = createUniverse({ ...baseP, seed, typical }, baseT());
        U.presim(70);
        for(const t of [40, 55, 70]){ mis += ownerMismatch(U, t, mulberry32(seed + t), 1500); n += 1500; }
      }
      return { pass: mis/n < .002, detail: `${n} 個取樣點中 ${mis} 個不一致（${(mis/n*100).toFixed(2)}%）` };
    }},
    { name: '繪製邊界正確', desc: '畫面用射線算出的領域邊界，必須與逐點判斷的結果吻合', run(){
      const U = createUniverse(baseP, baseT()); U.presim(60);
      const { bad, n } = rayMismatch(buildRules(U, 60).cs, mulberry32(7));
      return { pass: bad/n < .01, detail: `${n} 條射線中 ${bad} 條不吻合（${(bad/Math.max(1,n)*100).toFixed(2)}%）` };
    }},
    { name: '動作紀錄可重現', desc: '同一個種子加上同一份動作紀錄（以不同的時間切分重播）必須得到完全相同的歷史與動作結果；動作之前的歷史與沒有動作時完全相同（動作不消耗主亂數）', run(){
      const A = actionUniverse(4242), T = A.tSim;
      const B = createUniverse(baseP, baseT(), { actions: A.actionLog() });
      while(B.tSim < T - 1e-9) B.advance(Math.min(.3711, T - B.tSim + 1e-9));
      const res = U => U.actions.map(a => a.result ? (a.result.ok ? 'ok' + a.result.id : a.result.reason) : '-').join(',');
      const same = A.fingerprint(T) === B.fingerprint(T) && res(A) === res(B);
      const P0 = createUniverse(baseP, baseT()); P0.presim(25);
      const t1 = A.actions[0].t - STEP/2, pre = A.fingerprint(t1) === P0.fingerprint(t1) && A.fingerprint(t1).length > 0;
      const ok = A.actions.filter(a => a.result && a.result.ok).length;
      return { pass: same && pre && ok > 20, detail: `${A.actions.length} 個動作（成功 ${ok}）重播${same ? '完全一致' : '不一致'}；第一個動作之前的歷史${pre ? '與無動作時相同' : '不同'}` };
    }},
    { name: '手動成核合法性', desc: '使用者放的泡泡：母宇宙必須是放置處的擁有者；比母宇宙高的真空必定是收縮泡泡，並在預期時刻縮成一點後消失；自然成核不會發生在向上穿隧的區域內', run(){
      let bad = 0, upBad = 0, gone = 0, natUp = 0, crunchBad = 0, n = 0, nUp = 0, hidden = 0;
      for(const seed of [4242, 99]){
        const U = actionUniverse(seed);
        for(const b of U.hist){
          if(b.parent && U.VAC[b.parent.vac].kind === 'up' && !b.act) natUp++;
          if(!b.act) continue;
          const t = b.tn, F = U.frame(t), cs = U.aliveAt(t).filter(o => o.id < b.id).map(o => U.circleAt(o, t));
          const own = Territory.ownerAt(F, cs, b.x, b.y); n++;
          if((own ? own.b : null) !== b.parent) bad++;
          // 剛誕生時，新泡泡必須真的顯示在最上層（向上穿隧的子泡泡比母宇宙高，不能被畫在母宇宙底下）
          const c1 = U.circleAt(b, b.tn + STEP), o1 = U.ownerAt(c1.cx, c1.cy, b.tn + STEP);   // 中心會隨哈伯流移動
          if(b.texit > b.tn + STEP && !(o1 && (o1.b === b || Territory.isAncestor(b, o1.b)))) hidden++;
          const pe = b.parent ? U.VAC[b.parent.vac].eps : 1, up = U.VAC[b.vac].eps > pe;
          if(up !== (b.s < 0)) upBad++;
          if(b.s < 0 && b.r0 < U.p.RH){
            nUp++;
            // 預期在 tc 縮成一點；若先流出模擬範圍，texit 會更早
            const tc = b.tn + Math.log(U.p.RH/(U.p.RH - b.r0))/U.p.H;
            if(b.texit > tc + 1e-9 || U.circleAt(b, tc).r > 1e-6*U.p.RH || U.aliveAt(b.texit + STEP).includes(b)) gone++;
          }
        }
        for(const a of U.actions){
          if(!a.result || a.result.ok || !/大擠壓/.test(a.result.reason)) continue;
          const o = U.ownerAt(a.x, a.y, a.t);
          if(!o || !U.crunchedAt(o.b, a.x, a.y, a.t)) crunchBad++;
        }
      }
      return { pass: n > 50 && nUp > 20 && !bad && !upBad && !gone && !natUp && !crunchBad && !hidden,
        detail: `檢查 ${n} 個使用者泡泡（收縮 ${nUp}）：歸屬不符 ${bad}、誕生後被蓋住 ${hidden}、收縮方向錯誤 ${upBad}、未如期消失 ${gone}、向上穿隧區內自然成核 ${natUp}、大擠壓判斷錯誤 ${crunchBad}` };
    }},
    { name: '向上穿隧的歸屬一致', desc: '有向上穿隧（子泡泡比母宇宙高、輸家畫在贏家之後）時：物理與畫面歸屬一致、射線邊界與逐點判斷吻合，且這種情況確實有被測到', run(){
      let mis = 0, n = 0, bad = 0, rays = 0, lyN = 0, sides = 0, sideBad = 0;
      for(const seed of [4242, 99]){
        const U = actionUniverse(seed), r = mulberry32(seed + 3);
        for(let t = 30; t <= U.tSim; t += 2){
          const { cs } = buildRules(U, t);
          const ly = new Set(), lyR = new Set(); for(const c of cs) for(const R of c.rules) if(R.lYield){ ly.add(R.L); lyR.add(R); }
          lyN += ly.size;
          // 輸家後畫時，疇壁兩側仍須各歸其主：只有這兩個宇宙（與祖先）涵蓋的點，贏家側不能顯示輸家，輸家側必須顯示輸家
          for(const R of lyR){
            const { W, L } = R, kin = c => c === W || c === L || Territory.isAncestor(c.b, W.b) || Territory.isAncestor(c.b, L.b);
            for(let k=0;k<60;k++){
              const a = r()*TAU, rr = L.r*Math.sqrt(r()), x = L.cx + Math.cos(a)*rr, y = L.cy + Math.sin(a)*rr;
              if(Territory.arrival(W, x, y) >= 0 || cs.some(c => !kin(c) && Territory.arrival(c, x, y) < 0)) continue;
              const o = U.ownerAt(x, y, t), wantL = !R.cE && R.g.lSide(x, y);
              sides++; if(((o && o.b) === L.b) !== wantL) sideBad++;
            }
          }
          mis += ownerMismatch(U, t, r, 600); n += 600;
          // 射線檢查只針對向上穿隧的家族（含其輸家）
          const upLine = c => ly.has(c) || c.b.s < 0 || (c.b.parent && U.VAC[c.b.vac].eps > U.VAC[c.b.parent.vac].eps);
          const m = rayMismatch(cs, r, upLine, 16); bad += m.bad; rays += m.n;
        }
      }
      return { pass: lyN > 0 && rays > 100 && sides > 50 && mis/n < .002 && bad/rays < .01 && !sideBad,
        detail: `輸家後畫的情況 ${lyN} 次（疇壁兩側取樣 ${sides} 點，歸屬錯誤 ${sideBad}）；${n} 個取樣點中 ${mis} 個不一致；${rays} 條射線中 ${bad} 條不吻合（${(bad/Math.max(1,rays)*100).toFixed(2)}%）` };
    }},
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
    { name: '穿隧率正確', desc: '實際成核次數必須符合各區域真空的穿隧率（以隨機取樣估計預期值）', run(){
      const U = createUniverse(baseP, baseT()); U.presim(90);
      const r = mulberry32(11), G = U.tune.gamma, RG = U.p.RGEN, T0 = 20, T1 = U.tSim;
      let accFV = 0, accIn = 0, S = 5000;
      for(let i=0;i<S;i++){
        const t = T0 + r()*(T1 - T0), rr = RG*Math.sqrt(r()), a = r()*TAU, x = Math.cos(a)*rr, y = Math.sin(a)*rr;
        if(rr < U.p.RH + U.p.R0 + 3) continue;
        const own = U.ownerAt(x, y, t);
        if(!own) accFV++; else if(Territory.arrival(own, x, y) <= -U.p.R0*2) accIn += U.VAC[own.b.vac].grel*U.tune.innerMul;
      }
      const vol = Math.PI*RG*RG*(T1 - T0), eTop = G*vol*accFV/S, eIn = G*vol*accIn/S;
      let top = 0, inn = 0; for(const b of U.hist){ if(b.tn < T0) continue; if(b.parent) inn++; else top++; }
      const ok = Math.abs(top - eTop) < .12*eTop + 30 && Math.abs(inn - eIn) < .15*eIn + 30;
      return { pass: ok, detail: `假真空：預期約 ${Math.round(eTop)}、實際 ${top}；口袋宇宙內部：預期約 ${Math.round(eIn)}、實際 ${inn}` };
    }},
    { name: '觀測者歸屬不跳回', desc: '典型觀測者模式下連續演化 400 秒：觀測者所在的宇宙一旦換掉就不會再換回來，永遠存在的巨大泡泡也不會累積', run(){
      let returns = 0, maxEternal = 0, n = 0;
      for(const seed of [1, 4, 7, 23, 4242]){
        const U = createUniverse({ ...baseP, seed, typical: true }, baseT());
        const seen = new Set(); let prev = null;
        for(let t=0;t<400;t+=.5){
          U.advance(.5); n++;
          const o = U.observer(U.tSim), id = o.b ? o.b.id : 0;
          if(id !== prev){ if(seen.has(id)) returns++; seen.add(id); prev = id; }
        }
        maxEternal = Math.max(maxEternal, U.live.filter(b => !isFinite(b.texit) && !b.dyn).length);   // 方案 B 的子泡泡流出改由掃描判斷，不算永久
      }
      return { pass: !returns && maxEternal <= 3, detail: `5 個宇宙、${n} 個時間點：跳回 ${returns} 次；最後同時存在的永久泡泡最多 ${maxEternal} 個` };
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
    { name: '交界線連續', desc: '沿多條掃描線找出畫面上所有「兩種不同真空（或真空與假真空）相鄰」的地方，每一處都必須有泡壁或疇壁線經過，特別是三個泡泡的交會處', run(){
      let total = 0, miss = 0;
      for(const seed of [99, 7]){
        const U = createUniverse({ ...baseP, seed }, baseT()); U.presim(60);
        const t = U.tSim, { cs, F, byB } = buildRules(U, t);
        cs.slice().sort((a, b) => Territory.drawOrder(F, a, b)).forEach((c, n) => c.ord = n);
        const candsOf = v => { const set = new Set([v]); for(const R of v.rules) set.add(Territory.otherOf(R, v)); for(const k of v.kids || []) set.add(k); for(let q = v.b.parent; q; q = q.parent){ const c = byB.get(q); if(c) set.add(c); } return [...set]; };
        const B = { x0: -1300, y0: -1300, x1: 1300, y1: 1300 };
        // 收集所有畫出的線上的點（以 4 單位的格子索引）
        const grid = new Map(), put = (x, y) => { const k = Math.floor(x/4) + ',' + Math.floor(y/4); grid.set(k, (grid.get(k) || []).concat([[x, y]])); };
        const seen = new Set();
        for(const c of cs) for(const R of c.rules){
          if(R.kind === 'inherit' || seen.has(R)) continue; seen.add(R);
          const dw = R.kind === 'wall' ? Territory.domainWall(R, candsOf(R.W).concat(candsOf(R.L)), B) : Territory.mergeCurve(R, candsOf(R.A).concat(candsOf(R.B)), B);
          if(!dw) continue;
          for(const [a, b2] of dw.segs){ const [x0, y0] = dw.P(a), [x1, y1] = dw.P(b2); const n = Math.min(4000, Math.ceil(Math.hypot(x1 - x0, y1 - y0)*1.5) + 8); for(let i=0;i<=n;i++){ const [x, y] = dw.P(a + (b2 - a)*i/n); put(x, y); } }
        }
        for(const c of cs){
          if(c.cx + c.r < B.x0 || c.cx - c.r > B.x1 || c.cy + c.r < B.y0 || c.cy - c.r > B.y1) continue;
          const cd = candsOf(c), n = Math.min(40000, Math.ceil(c.r*TAU));
          for(let i=0;i<n;i++){ const a = TAU*i/n, x = c.cx + Math.cos(a)*c.r, y = c.cy + Math.sin(a)*c.r; if(x < B.x0 || x > B.x1 || y < B.y0 || y > B.y1) continue; if(Territory.shellVisible(c, cd, x, y, Math.cos(a), Math.sin(a), 1.5)) put(x, y); }
        }
        const near = (x, y) => { const gx = Math.floor(x/4), gy = Math.floor(y/4); for(let i=-1;i<=1;i++) for(let j=-1;j<=1;j++) for(const [px, py] of grid.get((gx+i) + ',' + (gy+j)) || []) if(Math.hypot(px - x, py - y) < 3) return true; return false; };
        // 掃描線：找出顯示的宇宙改變之處
        for(let y=B.y0 + 17; y<B.y1; y+=40){
          let prev = Territory.displayOwner(cs, B.x0, y);
          for(let x=B.x0 + 1; x<=B.x1; x+=1){
            const cur = Territory.displayOwner(cs, x, y);
            if(cur !== prev && (!cur || !prev || cur.b.vac !== prev.b.vac)){ total++; if(!near(x - .5, y)) miss++; }
            prev = cur;
          }
        }
      }
      return { pass: total > 0 && miss/total < .005, detail: `${total} 處交界中，沒有線經過的有 ${miss} 處（${(miss/Math.max(1,total)*100).toFixed(2)}%）` };
    }},
    { name: '長時間數值穩定', desc: '典型觀測者模式、高膨脹率下連續演化 40 分鐘，所有幾何量都必須是有限數值', run(){
      const U = createUniverse({ ...baseP, seed: 23, typical: true, H: .6, RH: 140 }, baseT());
      const t0 = performance.now(); U.presim(40*60); const ms = performance.now() - t0;
      const t = U.tSim, cs = U.aliveAt(t).map(b => U.circleAt(b, t));
      const finite = cs.every(c => isFinite(c.cx) && isFinite(c.cy) && isFinite(c.r));
      const obs = U.observer(t);
      return { pass: finite && !!obs, detail: `${cs.length} 個存活泡泡，數值${finite ? '全部有限' : '出現無限大'}；40 分鐘的演化耗時 ${(ms/1000).toFixed(1)} 秒` };
    }},
    { name: '疇壁穩定', desc: '以每秒 60 格的間隔連續計算 2 秒，疇壁不應忽隱忽現（出現又在 10 格內消失，或反之）', run(){
      const U = createUniverse(baseP, baseT()); U.presim(60);
      const hist = new Map(); let obs = 0;
      for(let i=0;i<120;i++){
        const t = 58 + i/60, { cs, F, byB } = buildRules(U, t), seen = new Set();
        cs.slice().sort((a, b) => Territory.drawOrder(F, a, b)).forEach((c, n) => c.ord = n);
        const candsOf = v => { const set = new Set([v]); for(const R of v.rules) set.add(Territory.otherOf(R, v)); for(const k of v.kids || []) set.add(k); for(let q = v.b.parent; q; q = q.parent){ const c = byB.get(q); if(c) set.add(c); } return [...set]; };
        for(const c of cs) for(const R of c.rules){
          if(R.kind !== 'wall' || seen.has(R)) continue; seen.add(R);
          const k = R.W.b.id + ':' + R.L.b.id, dw = Territory.domainWall(R, candsOf(R.W).concat(candsOf(R.L)));
          let len = 0;   // 只計長度超過 2 單位的疇壁（次像素的極短殘段不算）
          if(dw) for(const [a2, b2] of dw.segs){ let p0 = dw.P(a2); for(let j=1;j<=12;j++){ const q = dw.P(a2 + (b2 - a2)*j/12); len += Math.hypot(q[0] - p0[0], q[1] - p0[1]); p0 = q; } }
          if(!hist.has(k)) hist.set(k, []);
          hist.get(k)[i] = len > 2; obs++;
        }
      }
      let flick = 0;
      for(const arr of hist.values()){
        for(let i=1;i<arr.length;i++){
          if(arr[i] === undefined || arr[i-1] === undefined || arr[i] === arr[i-1]) continue;
          for(let j=i+1;j<Math.min(arr.length, i+10);j++) if(arr[j] === arr[i-1]){ flick++; break; }
        }
      }
      return { pass: flick === 0, detail: `${obs} 次觀測中忽隱忽現 ${flick} 次` };
    }},
  ];
  if(baseP.localH) tests.push(
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
  );
  return { tests, buildRules };
}
export const SelfCheck = buildSelfCheck();
/* 方案 B（各區域膨脹率）：同一組不變式在 localH 下也必須成立 */
export const SelfCheckB = buildSelfCheck({ localH: true });
