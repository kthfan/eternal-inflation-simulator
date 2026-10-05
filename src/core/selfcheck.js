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
        n++; if(!inn || !out) bad++;
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
        const ups = U.VAC.filter(v => v.eps > pe), downs = U.VAC.filter(v => v.eps < pe);
        const list = r() < .6 && ups.length ? ups : downs, V = list[(r()*list.length)|0];
        if(V) U.act({ type: 'nucleate', x, y, vac: V.i, r: 40 + r()*120 });
      }
      U.advance(STEP);
    }
    return U;
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
