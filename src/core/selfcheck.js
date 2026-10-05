/* 核心｜自我檢查：用全新的宇宙實例驗證不變式。瀏覽器內的「自我檢查」按鈕與 npm test 執行的是同一組。 */
import { TAU, mulberry32 } from './math.js';
import { Territory } from './territory.js';
import { STEP, createUniverse } from './universe.js';

/* ---------- 自我檢查：用全新的宇宙實例驗證不變式（不影響正在執行的模擬） ---------- */
export const SelfCheck = (() => {
  const baseP = { seed: 4242, H: .25, RH: 140, R0: 3, RGEN: 3000, typical: false, vacN: 12, crunchP: .25, oddDimP: .15 };
  const baseT = () => ({ gamma: 2.5e-6, innerMul: 1, wallK: 1 });
  // 以物理座標為所有存活泡泡建立規則（與畫面呼叫同一個 Territory.buildRules，只是縮放倍率為 1）
  function buildRules(U, t){
    const byB = new Map(), cs = U.aliveAt(t).map(b => { const c = U.circleAt(b, t); byB.set(b, c); return c; });
    cs.sort((a, b) => a.b.tn - b.b.tn || a.b.id - b.b.id);
    const F = U.frame(t, 1, b => byB.get(b) || U.circleAt(b, t));
    Territory.buildRules(cs, F);
    return { cs, F, byB };
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
          if(b.parent && U.VAC[b.parent.vac].kind !== 'ds') ads++;
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
        for(const t of [40, 55, 70]){
          const { cs, F } = buildRules(U, t);
          const order = cs.slice().sort((a, b) => Territory.drawOrder(F, a, b));
          const r = mulberry32(seed + t);
          for(let i=0;i<1500;i++){
            const rr = 2400*Math.sqrt(r()), a = r()*TAU, x = Math.cos(a)*rr, y = Math.sin(a)*rr;
            const sim = Territory.ownerAt(F, cs, x, y);
            let disp = null; for(const c of order) if(Territory.drawContains(c, x, y)) disp = c;
            n++; if((sim ? sim.b : null) !== (disp ? disp.b : null)) mis++;
          }
        }
      }
      return { pass: mis/n < .002, detail: `${n} 個取樣點中 ${mis} 個不一致（${(mis/n*100).toFixed(2)}%）` };
    }},
    { name: '繪製邊界正確', desc: '畫面用射線算出的領域邊界，必須與逐點判斷的結果吻合', run(){
      const U = createUniverse(baseP, baseT()); U.presim(60);
      const { cs } = buildRules(U, 60), r = mulberry32(7);
      let bad = 0, n = 0;
      for(const c of cs){
        if(!c.rules.length || c.r < 5) continue;
        for(let k=0;k<24;k++){
          const a = r()*TAU, ex = Math.cos(a), ey = Math.sin(a), rho = Territory.cellRay(c, ex, ey, c.r);
          const eps = Math.max(.05, c.r*1e-4);
          const inn = rho > 2*eps ? Territory.drawContains(c, c.cx + ex*(rho - eps), c.cy + ey*(rho - eps)) : true;
          const out = rho < c.r - 2*eps ? !Territory.drawContains(c, c.cx + ex*(rho + eps), c.cy + ey*(rho + eps)) : true;
          n++; if(!inn || !out) bad++;
        }
      }
      return { pass: bad/n < .01, detail: `${n} 條射線中 ${bad} 條不吻合（${(bad/Math.max(1,n)*100).toFixed(2)}%）` };
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
        maxEternal = Math.max(maxEternal, U.live.filter(b => !isFinite(b.texit)).length);
      }
      return { pass: !returns && maxEternal <= 3, detail: `5 個宇宙、${n} 個時間點：跳回 ${returns} 次；最後同時存在的永久泡泡最多 ${maxEternal} 個` };
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
  return { tests, buildRules };
})();
