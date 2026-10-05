/* 核心｜模擬：真空地景、泡泡的誕生與演化、疇壁位移、退場、歷史保留。
   createUniverse(p, tune) 建立一個獨立、可用種子重現的宇宙實例。純計算，不依賴瀏覽器。
   所有泡泡幾何都必須經過 U.circleAt —— 這是日後加入「移動泡泡」的唯一修改點（見 docs/ROADMAP.md）。 */
import { TAU, mulberry32, poisson } from './math.js';
import { Territory } from './territory.js';

/* ---------- 3. 模擬核心 ---------- */
export const STEP = 1/30;   // 固定模擬步長：與影格率無關，才能用種子重現

export const EMAX = 1e13;   // 單一泡泡的膨脹倍數上限（只是最後的保險，避免數值溢位）。

                          // 各泡泡到達上限的時間不同，若上限太低，彼此的相對幾何會被扭曲，造成歸屬來回跳動；
                          // 實際上永遠存在的泡泡在那之前就會「退場」（見 retire），只剩一個，不會再與誰比較。
export const LONG = 90;   // 壽命超過此值（含永遠不會流出者）的泡泡另外保存，回放時一律納入

export const BUCKET = 0.5, MAXB = 160000, FALSE_EPS = 1;

export const VNAMES = '子丑寅卯辰巳午未申酉戌亥甲乙丙丁';

/* 由種子生成真空地景：負真空能 → 大擠壓（τ ≈ 1.5 /(H√|ε|)）；近乎為零 → 極穩定；一般正真空能 → 內部繼續穿隧 */
export function makeLandscape(r, p){
  const n = p.vacN, VAC = [];
  const hues = []; for(let i=0;i<n;i++) hues.push((i*360/n + r()*12) % 360);
  for(let i=n-1;i>0;i--){ const j = (r()*(i+1))|0; [hues[i], hues[j]] = [hues[j], hues[i]]; }
  const nA = Math.min(n-1, Math.round(n*p.crunchP)), nT = Math.max(1, Math.round(n*.18));
  const kinds = []; for(let i=0;i<n;i++) kinds.push(i < nA ? 'ads' : i < nA + nT ? 'tiny' : 'ds');
  for(let i=n-1;i>0;i--){ const j = (r()*(i+1))|0; [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  for(let i=0;i<n;i++){
    const kind = kinds[i];
    let eps, lexp, lman;
    if(kind === 'tiny'){ eps = 0; lexp = 100 + Math.floor(r()*23); lman = 1 + r()*8.9; }
    else {
      const mag = .05 + r()*.85;
      eps = kind === 'ads' ? -mag : mag;
      const val = mag*1e-10; lexp = Math.ceil(-Math.log10(val)); lman = val*Math.pow(10, lexp);
    }
    const dims = r() < 1 - p.oddDimP ? 3 : [1,2,4,5,6,7,10][(r()*7)|0];
    const ainv = kind === 'tiny' ? 137 + (r()-.5)*80 : 60 + r()*190;
    const mratio = kind === 'tiny' ? 600 + r()*2800 : 300 + r()*3600;
    // 只有仍在暴脹的正真空能宇宙會繼續穿隧；真空能近乎為零的宇宙（像我們的）衰變率極低，在模擬時間內視為穩定
    const grel = kind === 'ds' ? .25 + r()*1.25 : 0;
    r();   // 保留一次亂數消耗，讓其他屬性的抽樣順序不變
    VAC.push({ i, name: VNAMES[i] + '型真空', kind, eps, lexp, lman, lsign: eps < 0 ? -1 : 1, dims, ainv, mratio, grel, hue: hues[i],
      w: .4 + r(), crunchT: kind === 'ads' ? Math.max(3, 1.5/(p.H*Math.sqrt(-eps))) : Infinity,
      // 熱寂：真空能近乎為零的宇宙會一直膨脹、冷卻，恆星燃盡、星系彼此遠離到視界之外。Λ 越小越慢（時間尺度 ∝ 1/√Λ，這裡以指數 lexp 示意）
      hdT: kind === 'tiny' ? (30 + (lexp - 100)*2)*(.25/p.H) : Infinity });
  }
  return VAC;
}

/* p：建立後不可變的宇宙參數 { seed, H, RH, R0, RGEN, typical, vacN, crunchP, oddDimP }
   tune：執行中可調整、會影響之後演化的參數 { gamma, innerMul, wallK } */
export function createUniverse(p, tune){
  const rng = mulberry32(p.seed);
  const VAC = makeLandscape(rng, p);
  const maxInner = Math.max(0, ...VAC.map(v => v.grel));
  const U = { p, tune, VAC, tSim: 0, acc: 0, tStart: 0, trimmed: 0, hist: [], longs: [], live: [],
    buckets: [], bucketBase: 0, vacCount: VAC.map(() => 0), window: 1200, nextId: 1, stepN: 0 };
  Object.defineProperty(U, 'tLive', { get: () => U.tSim + U.acc });
  /* 事件：'born'（新泡泡誕生）、'retire'（永久泡泡退場）。只通知、不影響演化，所以不破壞可重現性 */
  const listeners = { born: [], retire: [] };
  U.on = (name, fn) => { listeners[name].push(fn); return () => { const a = listeners[name], i = a.indexOf(fn); if(i >= 0) a.splice(i, 1); }; };
  const notify = (name, b) => { for(const fn of listeners[name]) fn(b); };

  const E = (b, t) => Math.min(EMAX, Math.exp(p.H*(t - b.tn)));
  U.E = E;
  U.circleAt = (b, t) => { const e = E(b, t); return { b, cx: b.x*e, cy: b.y*e, r: p.R0*e + p.RH*(e - 1) }; };
  U.eps = b => VAC[b.vac].eps;

  /* 兩泡泡第一次相撞的時刻（二分法，快取；只取決於兩個泡泡本身） */
  const tcCache = new Map();
  U.collideTime = (a, b) => {
    const key = a.id < b.id ? a.id*1e7 + b.id : b.id*1e7 + a.id;
    let tc = tcCache.get(key); if(tc !== undefined) return tc;
    const f = t => { const A = U.circleAt(a, t), B = U.circleAt(b, t); return Math.hypot(A.cx - B.cx, A.cy - B.cy) - A.r - B.r; };
    let lo = Math.max(a.tn, b.tn), hi = lo + .5;
    if(f(lo) <= 0) tc = lo;
    else { while(f(hi) > 0 && hi - lo < 600) hi = lo + (hi - lo)*2; for(let i=0;i<40;i++){ const m = (lo + hi)/2; if(f(m) > 0) lo = m; else hi = m; } tc = hi; }
    if(tcCache.size > 40000) tcCache.clear();
    tcCache.set(key, tc); return tc;
  };
  /* 疇壁位移（物理長度，W 佔上風為正）：v = 0.85c·Δε/(|Δε|+0.25)，再隨背景膨脹拉長 */
  U.shift = (W, L, t) => {
    if(W.vac === L.vac) return 0;
    const D = U.eps(L) - U.eps(W), tc = U.collideTime(W, L);
    if(t <= tc) return 0;
    return .85*D/(Math.abs(D) + .25)*tune.wallK*p.RH*(Math.min(EMAX, Math.exp(p.H*(t - tc))) - 1);
  };
  U.frame = (t, scale = 1, circ) => ({ t, eps: U.eps, shift: (W, L) => U.shift(W, L, t)*scale, circ: circ || (b => U.circleAt(b, t)) });

  U.bornBy = t => { const h = U.hist; let lo = 0, hi = h.length; while(lo < hi){ const m = (lo + hi) >> 1; if(h[m].tn <= t) lo = m + 1; else hi = m; } return lo; };
  U.born = t => U.trimmed + U.bornBy(t);
  /* 時刻 t 仍存活的泡泡（直播或回放共用同一個入口） */
  U.aliveAt = t => {
    if(t >= U.tSim - 1e-9) return U.live.filter(b => b.tn <= t && b.texit > t);
    const out = U.longs.filter(b => b.tn <= t && b.texit > t);
    for(let i = U.bornBy(t) - 1; i >= 0; i--){ const b = U.hist[i]; if(b.tn < t - LONG) break; if(!b.long && b.texit > t) out.push(b); }
    return out;
  };
  U.ownerAt = (x, y, t) => Territory.ownerAt(U.frame(t), U.aliveAt(t).map(b => U.circleAt(b, t)), x, y);
  U.crunchedAt = (b, x, y, t) => {
    if(!b.crunch) return false;
    const c = U.circleAt(b, t), xx = Math.min(1, Math.hypot(x - c.cx, y - c.cy)/c.r);
    return (t - b.tn)*Math.sqrt(1 - xx*xx) >= b.crunchT;
  };
  /* 內部時間 τ = 年齡·√(1−x²)（與大擠壓相同的同時性），超過 heatT 即進入熱寂 */
  U.heatAt = (b, x, y, t) => {
    if(!isFinite(b.heatT)) return false;
    const c = U.circleAt(b, t), xx = Math.min(1, Math.hypot(x - c.cx, y - c.cy)/c.r);
    return (t - b.tn)*Math.sqrt(1 - xx*xx) >= b.heatT;
  };
  U.observer = t => {
    const o = U.ownerAt(0, 0, t);
    if(!o) return { kind:'false' };
    if(U.crunchedAt(o.b, 0, 0, t)) return { kind:'crunch', b:o.b };
    if(U.heatAt(o.b, 0, 0, t)) return { kind:'heat', b:o.b };
    return { kind:'pocket', b:o.b, V:VAC[o.b.vac] };
  };

  function addBubble(x, y, d, t, parent){
    const pe = parent ? VAC[parent.vac].eps : FALSE_EPS;
    let tot = 0; for(const v of VAC) if(v.eps < pe) tot += v.w;
    if(tot <= 0) return null;
    let pick = rng()*tot, vac = 0;
    for(const v of VAC){ if(v.eps < pe){ pick -= v.w; if(pick <= 0){ vac = v.i; break; } } }
    const V = VAC[vac], den = d - p.R0 - p.RH;
    const b = { id: U.nextId++, tn: t, x, y, d, vac, seed: rng(), parent: parent || null, depth: parent ? parent.depth + 1 : 0,
      crunch: V.kind === 'ads', crunchT: V.crunchT, heatT: V.hdT,
      texit: den > 0 ? t + Math.log((p.RGEN + 60 - p.RH)/den)/p.H : Infinity };   // 會吞沒觀測者的泡泡永遠不會流出
    b.long = !(b.texit - t <= LONG);
    U.hist.push(b); U.live.push(b); if(b.long) U.longs.push(b);
    U.vacCount[vac]++;
    notify('born', b);
    const k = Math.floor(t/BUCKET) - U.bucketBase; while(U.buckets.length <= k) U.buckets.push(0); U.buckets[k]++;
    return b;
  }
  /* 成核：以最大可能穿隧率撒點，再依該點所屬真空的穿隧率接受。歸屬判斷與畫面使用同一個 Territory.ownerAt */
  function nucleate(){
    const t = U.tSim, gmax = Math.max(1, maxInner*tune.innerMul);
    const n = poisson(rng, tune.gamma*gmax*Math.PI*p.RGEN*p.RGEN*STEP);
    if(!n) return;
    const F = U.frame(t), circles = [];
    for(const b of U.live) if(b.texit > t) circles.push(U.circleAt(b, t));
    for(let i=0;i<n;i++){
      const rr = p.RGEN*Math.sqrt(rng()), ang = rng()*TAU, u = rng();
      if(!p.typical && rr < p.RH + p.R0 + 3) continue;      // 後選模式：會吞沒觀測者的泡泡不在這條世界線的過去
      const x = Math.cos(ang)*rr, y = Math.sin(ang)*rr;
      const own = Territory.ownerAt(F, circles, x, y);
      let rel = 1;
      if(own){
        if(Territory.arrival(own, x, y) > -p.R0*2) continue;   // 太貼近泡壁的地方不成核
        rel = VAC[own.b.vac].grel*tune.innerMul;
      }
      if(u*gmax >= rel) continue;
      const b = addBubble(x, y, rr, t, own ? own.b : null);
      if(b) circles.push(U.circleAt(b, t));
    }
  }
  /* 退場：永遠不會流出模擬範圍的巨大泡泡（吞沒了觀測者的那些），一旦在整個模擬範圍內已經不可能再擁有任何地盤，就讓它退場。
     否則它們會一層層累積、半徑無限增長，彼此之間的幾何計算終究會失去精度，造成歸屬來回跳動與繪製變慢。
     判斷條件（三者任一）：被自己的子孫完整覆蓋；被一個勝過它的宇宙以疇壁完整佔據；或與同種真空的另一個泡泡都已覆蓋整個範圍（保留較早誕生者）。 */
  function retire(){
    const t = U.tSim, Rg = p.RGEN + 200;
    const live = U.live.filter(b => b.texit > t && b.tn < t);
    if(live.length < 2) return;
    const C = new Map(live.map(b => [b, U.circleAt(b, t)]));
    const covers = c => Math.hypot(c.cx, c.cy) + Rg < c.r;
    const ring = []; for(let k=0;k<48;k++) ring.push([Math.cos(TAU*k/48)*Rg, Math.sin(TAU*k/48)*Rg]); ring.push([0, 0]);
    const F = U.frame(t);
    for(const b of live){
      if(isFinite(b.texit)) continue;
      const cb = C.get(b);
      for(const o of live){
        if(o === b) continue;
        const co = C.get(o);
        if(!covers(co)) continue;
        let gone = false;
        if(Territory.isAncestor(b, o)) gone = true;
        else if(!Territory.related(b, o)){
          // 用與畫面、成核完全相同的規則判斷（包含「光錐被包住時沿用祖先疇壁」的情況）
          const R = Territory.rule(F, co, cb);
          if(!R) gone = false;
          else if(R.kind === 'merge') gone = covers(cb) && (o.tn < b.tn || (o.tn === b.tn && o.id < b.id));
          else if(R.kind === 'wall') gone = R.W === co && ring.every(([x, y]) => Territory.arrival(cb, x, y) >= 0 || !R.g.lSide(x, y));
          else if(R.kind === 'inherit'){
            if(R.X === cb) gone = !R.free && (!R.g || ring.every(([x, y]) => !R.g.lSide(x, y)));
            else gone = !!R.free;      // o 在 b 的光錐內且不受 b 限制，又已覆蓋整個範圍：b 再也拿不到地盤
          }
        }
        if(gone){ b.texit = t + STEP/2; notify('retire', b); break; }   // 從下一步起退場（這一步誕生的泡泡仍看得到它）
      }
    }
  }
  U.advance = dt => {
    U.acc += dt;
    let n = 0;
    while(U.acc >= STEP && n < 20000){ U.acc -= STEP; U.tSim += STEP; nucleate(); if(++U.stepN % 30 === 0) retire(); n++; }
    if(U.live.some(b => b.texit <= U.tSim)) U.live = U.live.filter(b => b.texit > U.tSim);
    const k = Math.floor(U.tLive/BUCKET) - U.bucketBase; while(U.buckets.length <= k) U.buckets.push(0);
    U.trim();
  };
  /* 只保留回放視窗內的歷史：一般泡泡壽命不超過 LONG，視窗前 LONG 秒以前的可以丟；長壽泡泡另存在 longs */
  U.trim = () => {
    const tl = U.tLive;
    let cut = tl - U.window;
    if(U.hist.length > MAXB) cut = Math.max(cut, U.hist[U.hist.length - Math.floor(MAXB*.9)].tn + LONG + 1);
    cut = Math.min(cut, tl - 5);
    if(cut <= U.tStart + .5) return;
    U.tStart = cut;
    const idx = U.bornBy(cut - LONG - 1);
    if(idx > 0){ U.hist.splice(0, idx); U.trimmed += idx; }
    if(U.longs.some(b => b.texit <= cut)) U.longs = U.longs.filter(b => b.texit > cut);
    const kb = Math.floor(cut/BUCKET) - U.bucketBase;
    if(kb > 0){ U.buckets.splice(0, kb); U.bucketBase += kb; }
  };
  U.presim = sec => { for(let i=0;i<Math.round(sec/STEP);i++) U.advance(STEP); };
  U.fingerprint = tMax => U.hist.filter(b => b.tn <= tMax).map(b => `${b.id}:${b.tn.toFixed(6)}:${b.x.toFixed(4)}:${b.y.toFixed(4)}:${b.vac}:${b.parent ? b.parent.id : 0}`).join('|');
  return U;
}
