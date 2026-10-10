/* 核心｜模擬：真空地景、泡泡的誕生與演化、疇壁位移、退場、歷史保留。
   createUniverse(p, tune) 建立一個獨立、可用種子重現的宇宙實例。純計算，不依賴瀏覽器。
   所有泡泡幾何都必須經過 U.circleAt —— 這是日後加入「移動泡泡」的唯一修改點（見 docs/ROADMAP.md）。 */
import { TAU, mulberry32, poisson, hash } from './math.js';
import { Territory } from './territory.js';

/* ---------- 3. 模擬核心 ---------- */
export const STEP = 1/30;   // 固定模擬步長：與影格率無關，才能用種子重現

export const EMAX = 1e13;   // 單一泡泡的膨脹倍數上限（只是最後的保險，避免數值溢位）。

                          // 各泡泡到達上限的時間不同，若上限太低，彼此的相對幾何會被扭曲，造成歸屬來回跳動；
                          // 實際上永遠存在的泡泡在那之前就會「退場」（見 retire），只剩一個，不會再與誰比較。
export const LONG = 90;   // 壽命超過此值（含永遠不會流出者）的泡泡另外保存，回放時一律納入

export const BUCKET = 0.5, MAXB = 160000, FALSE_EPS = 1;
export const UP_EPS = 1.6;
/* 玩家宇宙（docs/ROADMAP.md D3、D4、D9 M3）：
   E0 初始能量（單位：Δε·RH²）、eta 能量轉換效率、k 半徑控制的回復率（1/秒）、minE 力竭後恢復控制所需的能量、
   recenter 玩家離原點超過幾個哈伯半徑就重新置中（焦點跟隨，D9 M4）、cell 能量帳取樣格點的間距（像素）、latticeMax 格點半徑格數上限（巨大的玩家宇宙改用較粗的格點）、downCost 向下穿隧技能的固定成本（向上穿隧的成本 = Δε × 區域面積） */
export const PLAYER = { E0: 5, eta: .8, k: 1.5, minE: .5, cell: 3.5, latticeMax: 16, downCost: .15, range: 1, recenter: .75,
  /* 曲速（D12）：k 預設倍率（×c）、kMax 上限（保證 A2 的丟棄仍精確：(1 + kMax)·RH 要小於 RGEN）；
     借貸速率 kappa·k²·(r/RH)²（Alcubierre：負能量 ∝ v²R²）；量子不等式：借貸速率 × 持續時間² ≤ Q；
     量子利息：結束後在 repayT 秒內償還 借貸 × (1 + 持續時間/TI) */
  warp: { k: 5, kMax: 15, kappa: .25, Q: 4, TI: 4, repayT: 1.5 },
  /* 再循環（D13）：在 Λ > 0 的口袋宇宙中，以自己為中心向上穿隧出半徑 margin × 當地哈伯半徑的假真空區域（大於哈伯半徑 → 永遠縮不掉、重新永恆暴脹）；
     所在處 Λ ≤ 0（無法再循環）持續 trapT 秒就遊戲結束 */
  recycle: { margin: 1.05, trapT: 8 } };
// 激發態假真空：比假真空更高，只能由向上穿隧（使用者動作）產生，見 docs/ROADMAP.md D5、D6

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
  /* 激發態假真空：放在地景最後，以獨立的亂數產生（不消耗 r），既有種子的地景與演化完全不變。
     權重 w = 0、穿隧率 grel = 0：自然成核永遠不會產生它，它內部也不會再成核（它很快就會被周圍吃掉） */
  const r2 = mulberry32((p.seed ^ 0x5bd1e995) >>> 0);
  { const val = UP_EPS*1e-10, lexp = Math.ceil(-Math.log10(val));
    VAC.push({ i: n, name: '激發態假真空', kind: 'up', eps: UP_EPS, lexp, lman: val*Math.pow(10, lexp), lsign: 1, dims: 3,
      ainv: 60 + r2()*190, mratio: 300 + r2()*3600, grel: 0, hue: 40 + r2()*20, w: 0, crunchT: Infinity, hdT: Infinity }); }
  /* 再循環假真空（D13）：在 Λ > 0 的口袋宇宙中向上穿隧回到假真空的能量（Garriga–Vilenkin 的再循環宇宙）。只能由玩家的再循環技能產生（w = 0）；
     內部與假真空完全相同：以假真空的穿隧率（成核時特別處理，grel 保持 0 讓既有種子的成核序列不變）穿隧出任何較低的真空 */
  { const val = FALSE_EPS*1e-10, lexp = Math.ceil(-Math.log10(val));
    VAC.push({ i: n + 1, name: '再循環假真空', kind: 'rf', eps: FALSE_EPS, lexp, lman: val*Math.pow(10, lexp), lsign: 1, dims: 3,
      ainv: 60 + r2()*190, mratio: 300 + r2()*3600, grel: 0, hue: 268 + r2()*14, w: 0, crunchT: Infinity, hdT: Infinity }); }
  return VAC;
}

/* p：建立後不可變的宇宙參數 { seed, H, RH, R0, RGEN, typical, vacN, crunchP, oddDimP, localH }
   localH（方案 B，見 docs/ROADMAP.md D11）：各區域以自己的膨脹率流動。false 時全部共用假真空的 H（原本的模型，逐位元不變）
   tune：執行中可調整、會影響之後演化的參數 { gamma, innerMul, wallK }
   opts.actions：要重播的動作紀錄（U.actions 的內容），相同種子 + 相同動作紀錄 → 相同歷史 */
export function createUniverse(p, tune, opts = {}){
  const rng = mulberry32(p.seed);
  const VAC = makeLandscape(rng, p);
  const maxInner = Math.max(0, ...VAC.map(v => v.grel));
  const U = { p, tune, VAC, tSim: 0, acc: 0, tStart: 0, trimmed: 0, hist: [], longs: [], live: [],
    buckets: [], bucketBase: 0, vacCount: VAC.map(() => 0), window: 1200, nextId: 1, stepN: 0 };
  Object.defineProperty(U, 'tLive', { get: () => U.tSim + U.acc });
  /* 事件：'born'（新泡泡誕生）、'retire'（永久泡泡退場）、'act'（動作已套用）、'rebase'（原點換到新的共動點，{ x, y, t }）。只通知、不影響演化，所以不破壞可重現性 */
  const listeners = { born: [], retire: [], act: [], rebase: [] };
  U.on = (name, fn) => { listeners[name].push(fn); return () => { const a = listeners[name], i = a.indexOf(fn); if(i >= 0) a.splice(i, 1); }; };
  const notify = (name, b) => { for(const fn of listeners[name]) fn(b); };

  const E = (b, t) => Math.min(EMAX, Math.exp(p.H*(t - b.tn)));
  U.E = E;

  /* ---------- 方案 B：各區域的膨脹率（p.localH）----------
     口袋宇宙內部以自己的膨脹率流動：H_in = H·√(ε/ε_假真空)（Λ > 0）；Λ ≤ 0 視為 0（Λ≈0 幾乎不膨脹；Λ<0 先膨脹後收縮，這裡不細分）；
     激發態假真空 H·√1.6。子泡泡跟著母宇宙內部的空間流動：以母宇宙中心為縮放中心、速率 H_in(母)，泡壁相對當地空間以光速推進：
       中心 c(t) = c_母(t) + (誕生點 − c_母(tn))·e^{h(t−tn)}，半徑 r(t) = (r₀ ± c/h)·e^{h(t−tn)} ∓ c/h（h → 0 時 r₀ ± c·(t−tn)）。
     以縮放中心做縮放，圓仍是圓（Territory 不用改）；子孫的真空能較低 → h 較小 → 子泡泡永遠留在母泡泡的光錐內。
     這是「各區域各自膨脹、在泡壁處接起來」的近似：真實的泡泡內部是泡壁光錐內的另一個開放宇宙。 */
  const LH = !!p.localH, cLight = p.H*p.RH;
  /* 方案 B 的倍數上限：偏移改存相對焦點附近的錨點，偏移小、倍數大、乘積仍在正常範圍，所以不需要 EMAX 這個保險（只防溢位）。
     若照 EMAX 截斷，年齡夠大的子泡泡會凍結，而換錨點時的換算又不知道它凍結了，兩者一不一致就會漂走 */
  const BMAX = 1e250, ex = (h, d) => Math.min(BMAX, Math.exp(h*d));
  const hIn = b => { if(!b) return p.H; const e = VAC[b.vac].eps; return e > 0 ? p.H*Math.sqrt(e/FALSE_EPS) : 0; };
  U.hIn = hIn;
  const grow = (r0, s, h, d) => {
    if(h > 1e-9){ const e = ex(h, d), k = cLight/h; return s < 0 ? Math.max(0, (r0 - k)*e + k) : (r0 + k)*e - k; }
    return s < 0 ? Math.max(0, r0 - cLight*d) : r0 + cLight*d;
  };
  /* 母宇宙中心的快取（同一時刻、同一座標系內重複使用；每一步與每次平移原點後失效） */
  let cacheEpoch = 0;
  const centerAt = (b, t) => {
    if(b._ct === t && b._ce === cacheEpoch) return b._cc;
    const c = U.circleAt(b, t); b._ct = t; b._ce = cacheEpoch; b._cc = c; return c;
  };
  /* 區域的錨點：均勻膨脹以任何一個「隨該區域流動的點」為縮放中心都是同一個流動。錨點起初就是泡泡中心；
     焦點在這個區域內時，錨點定期換到焦點附近（reanchor），子泡泡與玩家軌跡段改存相對錨點的偏移。
     否則古老的巨大口袋宇宙中心遠在 10¹⁵ 像素外，「中心 + 偏移·e^{h·年齡}」是兩個巨大的數相減，誤差無限放大。
     R.anc = { tk, dx, dy }：錨點在 tk 時相對 R 中心的位置（相對量，平移原點時不用改）；A(t) = c_R(t) + (dx, dy)·e^{h_R(t−tk)} */
  const anchorAt = (R, t) => {
    if(!R.anc) return centerAt(R, t);
    if(R._at === t && R._ae === cacheEpoch) return R._ac;
    const c = centerAt(R, t), e = ex(hIn(R), t - R.anc.tk);
    const a = { cx: c.cx + R.anc.dx*e, cy: c.cy + R.anc.dy*e };
    R._at = t; R._ae = cacheEpoch; R._ac = a; return a;
  };
  /* 把 R 的錨點換到此刻位於 (ax, ay) 的 R 共動點：所有以 R 為區域的偏移扣掉新舊錨點之差（隨 R 的膨脹率換算到各自的時刻） */
  function reanchor(R, ax, ay, t){
    const A = anchorAt(R, t), dx = ax - A.cx, dy = ay - A.cy, h = hIn(R), seen = new Set();
    const fix = b => {
      if(seen.has(b)) return; seen.add(b);
      // 與 circleAt／ctlCircle 用同一個倍數換算（1/ex），兩邊才會一致
      if(b.dyn && b.parent === R && !b.ctl){ const f = 1/ex(h, t - b.tn); b.ox -= dx*f; b.oy -= dy*f; }
      if(b.ctl){ const C = b.ctl; for(let i=0;i<C.t.length;i++) if(C.reg[i] === R){ const f = 1/ex(h, t - C.t[i]); C.x[i] -= dx*f; C.y[i] -= dy*f; } }
    };
    for(const b of U.hist) fix(b); for(const b of U.longs) fix(b); for(const b of U.live) fix(b);
    const c = centerAt(R, t); R.anc = { tk: t, dx: ax - c.cx, dy: ay - c.cy };
    cacheEpoch++;
  }
  /* 泡壁以光速擴張：r = R0·E + RH·(E−1)；收縮泡泡（s = −1，內部真空能比周圍高）：r = r0·E − RH·(E−1)，縮到 0 為止 */
  U.circleAt = (b, t) => {
    if(b.ctl) return ctlCircle(b, t);
    if(LH && b.parent){
      const pc = anchorAt(b.parent, t), d = t - b.tn, e = b.h > 0 ? ex(b.h, d) : 1;
      return { b, cx: pc.cx + b.ox*e, cy: pc.cy + b.oy*e, r: grow(b.r0, b.s, b.h, d) };
    }
    const e = E(b, t); return { b, cx: b.x*e, cy: b.y*e, r: b.s < 0 ? Math.max(0, b.r0*e - p.RH*(e - 1)) : p.R0*e + p.RH*(e - 1) };
  };
  /* 可控制的泡泡（玩家）：每一步的控制 (ux, uy, w) 固定，中心與半徑有解析解（逐段解析）。
     c(t) = (c₀ + u/H)·e^{HΔt} − u/H，r(t) = (r₀ + w/H)·e^{HΔt} − w/H；最後一段之後沿用最後的控制外推。
     曲速（D12）時中心另有曲速速度 V（空間本身被搬動，可超過光速），式中的 u 換成 u + V；泡壁相對被搬動的空間仍是 |u| + |w| ≤ c */
  const segIndex = (C, t) => { const T = C.t; let lo = 0, hi = T.length - 1; while(lo < hi){ const m = (lo + hi + 1) >> 1; if(T[m] <= t) lo = m; else hi = m - 1; } return lo; };
  function ctlCircle(b, t){
    const C = b.ctl;
    if(LH){
      // 方案 B：每一段記錄當時所在的區域 reg（null = 假真空，以原點為縮放中心），位置是相對區域中心的偏移
      const i = segIndex(C, t), h = C.h[i], d = t - C.t[i], reg = C.reg[i], base = reg ? anchorAt(reg, t) : null;
      let x, y, r;
      const vx = C.ux[i] + C.vx[i], vy = C.uy[i] + C.vy[i];
      if(h > 1e-9){ const e = ex(h, d), ux = vx/h, uy = vy/h, w = C.w[i]/h; x = (C.x[i] + ux)*e - ux; y = (C.y[i] + uy)*e - uy; r = (C.r[i] + w)*e - w; }
      else { x = C.x[i] + vx*d; y = C.y[i] + vy*d; r = C.r[i] + C.w[i]*d; }
      return { b, cx: (base ? base.cx : 0) + x, cy: (base ? base.cy : 0) + y, r: Math.max(0, r) };
    }
    const i = segIndex(C, t), H = p.H, e = Math.min(EMAX, Math.exp(H*(t - C.t[i]))), ux = (C.ux[i] + C.vx[i])/H, uy = (C.uy[i] + C.vy[i])/H, w = C.w[i]/H;
    return { b, cx: (C.x[i] + ux)*e - ux, cy: (C.y[i] + uy)*e - uy, r: Math.max(0, (C.r[i] + w)*e - w) };
  }
  U.eps = b => VAC[b.vac].eps;

  /* 兩泡泡第一次相撞的時刻（二分法，快取；只取決於兩個泡泡本身） */
  const tcCache = new Map();
  U.collideTime = (a, b) => {
    const key = a.id < b.id ? a.id*1e7 + b.id : b.id*1e7 + a.id;
    let tc = tcCache.get(key); if(tc !== undefined) return tc;
    const f = t => { const A = U.circleAt(a, t), B = U.circleAt(b, t); return Math.hypot(A.cx - B.cx, A.cy - B.cy) - A.r - B.r; };
    let lo = Math.max(a.tn, b.tn), hi = lo + .5;
    if(f(lo) <= 0) tc = lo;
    else if(a.s < 0 || b.s < 0){
      // 收縮泡泡：間距不是單調的（可能先靠近、再縮走），相撞必須發生在塌縮之前。逐步掃描找第一次接觸，找不到就是永不相撞
      const end = Math.min(a.texit, b.texit, lo + 600), h = .05;
      tc = Infinity;
      for(let t = lo + h; t < end + h; t += h){
        const tt = Math.min(t, end);
        if(f(tt) <= 0){ let l = tt - h, r = tt; for(let i=0;i<30;i++){ const m = (l + r)/2; if(f(m) > 0) l = m; else r = m; } tc = r; break; }
        if(tt >= end) break;
      }
    }
    else { while(f(hi) > 0 && hi - lo < 600) hi = lo + (hi - lo)*2; for(let i=0;i<40;i++){ const m = (lo + hi)/2; if(f(m) > 0) lo = m; else hi = m; } tc = hi; }
    if(tcCache.size > 40000) tcCache.clear();
    tcCache.set(key, tc); return tc;
  };
  /* 疇壁位移（物理長度，W 佔上風為正）：v = 0.85c·Δε/(|Δε|+0.25)，再隨背景膨脹拉長 */
  U.shift = (W, L, t) => {
    if(W.vac === L.vac) return 0;
    const D = U.eps(L) - U.eps(W), tc = U.contactStart(W, L, t);
    if(t <= tc) return 0;
    if(LH && W.parent && W.parent === L.parent){     // 方案 B：同一個母宇宙裡的疇壁隨母宇宙內部的空間拉長
      const v = .85*D/(Math.abs(D) + .25)*tune.wallK*cLight, h = W.h, d = t - tc;
      return h > 1e-9 ? v*(Math.min(EMAX, Math.exp(h*d)) - 1)/h : v*d;
    }
    return .85*D/(Math.abs(D) + .25)*tune.wallK*p.RH*(Math.min(EMAX, Math.exp(p.H*(t - tc))) - 1);
  };
  /* 疇壁從何時開始推進：一般泡泡是第一次相撞的時刻；可控制的泡泡（玩家）可能分開又再接觸，取 t 所在那一段接觸的開始時刻 */
  U.contactStart = (a, b, t) => {
    const P = a.ctl ? a : b.ctl ? b : null;
    if(!P) return U.collideTime(a, b);
    const arr = P.ctl.contacts.get((P === a ? b : a).id);
    if(!arr) return Infinity;
    for(let i = arr.length - 1; i >= 0; i--) if(arr[i][0] <= t + 1e-9) return t <= arr[i][1] + 1e-9 ? arr[i][0] : Infinity;
    return Infinity;
  };
  /* 推進前緣的半徑（玩家輸的時候）：從接觸那一刻贏家中心到輸家圓的距離起算，以疇壁速度 v 相對當地空間向外推進：
     ρ(t) = (ρ₀ + v/H)·e^{HΔt} − v/H。還沒有接觸紀錄（兩步之間剛碰到）時，前緣就在輸家圓上，輸家尚未失去地盤 */
  U.ringR = (W, L, t) => {
    const P = W.ctl ? W : L, arr = P.ctl.contacts.get((P === W ? L : W).id);
    let iv = null;
    if(arr) for(let i = arr.length - 1; i >= 0; i--) if(arr[i][0] <= t + 1e-9){ if(t <= arr[i][1] + 1e-9) iv = arr[i]; break; }
    if(!iv){ const a = U.circleAt(W, t), b = U.circleAt(L, t); return Math.hypot(a.cx - b.cx, a.cy - b.cy) - b.r; }
    if(iv[2] === undefined){ const a = U.circleAt(W, iv[0]), b = U.circleAt(L, iv[0]); iv[2] = Math.hypot(a.cx - b.cx, a.cy - b.cy) - b.r; }
    const D = U.eps(L) - U.eps(W), vH = .85*D/(Math.abs(D) + .25)*tune.wallK*p.RH;   // v/H，v = 0.85c·Δε/(|Δε|+0.25)（與 U.shift 相同）
    return (iv[2] + vH)*Math.min(EMAX, Math.exp(p.H*(t - iv[0]))) - vH;
  };
  U.frame = (t, scale = 1, circ) => ({ t, eps: U.eps, shift: (W, L) => U.shift(W, L, t)*scale, ring: (W, L) => U.ringR(W, L, t)*scale, circ: circ || (b => U.circleAt(b, t)) });

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

  /* 何時流出模擬範圍（或縮成一點）：泡泡在 t0 時中心離原點 d、半徑 r0、泡壁方向 s，之後中心隨哈伯流、泡壁以光速。
     · 擴張：近側邊緣 = E·(d − r0 − RH) + RH，超過 RGEN + 60 就流出；d < r0 + RH 的泡泡會吞沒原點，永遠不會流出
     · 收縮：r0 < RH 時在 (1/H)·ln(RH/(RH−r0)) 後縮成一點；近側邊緣 = E·(d − r0 + RH) − RH */
  function exitTime(s, d, r0, t0){
    if(s > 0){ const den = d - r0 - p.RH; return den > 0 ? t0 + Math.log((p.RGEN + 60 - p.RH)/den)/p.H : Infinity; }
    const tc = r0 < p.RH ? t0 + Math.log(p.RH/(p.RH - r0))/p.H : Infinity, den = d - r0 + p.RH;
    return Math.min(tc, den > 0 ? t0 + Math.log((p.RGEN + 60 + p.RH)/den)/p.H : Infinity);
  }
  /* forced（使用者動作）：{ vac, s, r0, seed }，直接指定真空與幾何，不消耗主亂數序列 */
  function addBubble(x, y, d, t, parent, forced){
    let vac = 0, seed;
    if(forced){ vac = forced.vac; seed = forced.seed; }
    else {
      const pe = parent ? VAC[parent.vac].eps : FALSE_EPS;
      let tot = 0; for(const v of VAC) if(v.eps < pe) tot += v.w;
      if(tot <= 0) return null;
      let pick = rng()*tot;
      for(const v of VAC){ if(v.eps < pe){ pick -= v.w; if(pick <= 0){ vac = v.i; break; } } }
      seed = rng();
    }
    const V = VAC[vac], s = forced ? forced.s : 1, r0 = forced ? forced.r0 : p.R0;
    let texit = exitTime(s, d, r0, t);
    let dyn = false, ox, oy, h;
    if(LH && parent){
      // 方案 B：子泡泡相對母宇宙中心的偏移與流動速率；流出時刻沒有簡單的解析式，改由每 0.5 秒的掃描判斷（dyn）
      const pc = anchorAt(parent, t); ox = x - pc.cx; oy = y - pc.cy; h = hIn(parent); dyn = true;
      const k = h > 1e-9 ? cLight/h : Infinity;
      texit = s > 0 ? Infinity : h > 1e-9 ? (r0 < k ? t + Math.log(k/(k - r0))/h : Infinity) : t + r0/cLight;   // 收縮泡泡：縮成一點的時刻
    }
    if(forced && forced.ctl) texit = Infinity;     // 玩家宇宙：一直保留（之後由焦點跟隨處理，見 D9 M4）
    const b = { id: U.nextId++, tn: t, x, y, d, vac, seed, parent: parent || null, depth: parent ? parent.depth + 1 : 0, s, r0,
      crunch: V.kind === 'ads', crunchT: V.crunchT, heatT: V.hdT, texit };
    if(dyn){ b.dyn = true; b.ox = ox; b.oy = oy; b.h = h; }
    if(forced) b.act = true;
    if(forced && forced.ctl){
      // 玩家宇宙的內部時間無法再用光錐的雙曲面公式（D7）；輕鬆模式下先不會大擠壓、熱寂
      b.crunch = false; b.heatT = Infinity;
      b.ctl = { t: [], x: [], y: [], r: [], ux: [], uy: [], vx: [], vy: [], w: [], reg: [], h: [], contacts: new Map(),
        in: { dx: 0, dy: 0, rT: r0 }, eta: forced.eta, mode: forced.mode, E: PLAYER.E0, exhausted: false, gain: 0, loss: 0,
        warp: null, repay: null, lastWarp: null };
      pushSeg(b, t, x, y, r0, 0, 0, 0);
      U.anyCtl = true;
    }
    b.long = b.dyn || !(b.texit - t <= LONG);
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
    const pc = U.player ? U.circleAt(U.player, t) : null;
    for(let i=0;i<n;i++){
      const rr = p.RGEN*Math.sqrt(rng()), ang = rng()*TAU, u = rng();
      // 後選模式：會吞沒觀測者的泡泡不在這條世界線的過去。有玩家宇宙時原點跟著玩家（焦點跟隨），等於後選「玩家附近仍在暴脹」的世界線：
      // 否則典型的世界線幾乎必然落入某個口袋宇宙 —— 泡壁以光速擴張，比光速慢的玩家逃不掉，整個區域很快變成不再暴脹的死寂宇宙
      if(!p.typical && !pc && rr < p.RH + p.R0 + 3) continue;
      const x = Math.cos(ang)*rr, y = Math.sin(ang)*rr;
      // 有玩家時，後選的對象是玩家：誕生點離玩家泡壁不到一個哈伯半徑的泡泡（玩家靜止時會被它吞沒）不在這條世界線的過去
      if(!p.typical && pc && Math.hypot(x - pc.cx, y - pc.cy) < pc.r + p.RH + p.R0 + 3) continue;
      const own = Territory.ownerAt(F, circles, x, y);
      let rel = 1;
      if(own && own.b.player) continue;                      // 不在玩家宇宙內成核
      if(own){
        if(Territory.arrival(own, x, y) > -p.R0*2) continue;   // 太貼近泡壁的地方不成核
        rel = VAC[own.b.vac].kind === 'rf' ? 1 : VAC[own.b.vac].grel*tune.innerMul;   // 再循環假真空：與假真空相同
      }
      if(u*gmax >= rel) continue;
      const b = addBubble(x, y, rr, t, own ? own.b : null);
      if(b) circles.push(U.circleAt(b, t));
    }
  }
  /* ---------- 動作紀錄（使用者介入）----------
     U.act(a) 把動作排進「下一步」的開頭套用（固定步長邊界），並記錄在 U.actions。
     動作本身不消耗主亂數序列（需要亂數時用 hash(種子, 步數, 序號)），所以沒有動作時的歷史與原本逐位元相同；
     相同種子 + 相同動作紀錄（含步數）→ 相同歷史。被拒絕的動作也留在紀錄裡，重播時會得到相同的拒絕結果。
     目前的動作：
     · nucleate { x, y, vac, r }：在物理座標 (x, y) 穿隧成真空 vac。擁有者一律由 Territory.ownerAt 決定。
       目標真空比所在處低 → 一般泡泡（初始半徑 R0）；比所在處高 → 向上穿隧的收縮泡泡（初始半徑 r）。 */
  U.actions = [];
  let pendingAct = 0, actSeq = 0;
  const queueAct = a => {
    a.seq = actSeq++;
    let i = U.actions.length; while(i > pendingAct && U.actions[i-1].step > a.step) i--;
    U.actions.splice(i, 0, a);
    return a;
  };
  U.act = a => queueAct({ ...a, step: U.stepN + 1, t: undefined, result: undefined });
  /* 可序列化的動作紀錄（重播、匯出用） */
  U.actionLog = () => U.actions.map(({ t, result, seq, ...rest }) => rest);
  for(const a of (opts.actions || []).slice().sort((p1, p2) => p1.step - p2.step)) queueAct({ ...a, t: undefined, result: undefined });

  function actNucleate(a, t, k){
    const V = VAC[a.vac];
    if(!V || !isFinite(a.x) || !isFinite(a.y)) return { ok: false, reason: '參數錯誤' };
    const F = U.frame(t), circles = [];
    for(const b of U.live) if(b.texit > t) circles.push(U.circleAt(b, t));
    const own = Territory.ownerAt(F, circles, a.x, a.y), pe = own ? VAC[own.b.vac].eps : FALSE_EPS;
    if(own && own.b.player) return { ok: false, reason: '不能放在玩家宇宙裡' };
    if(own && U.crunchedAt(own.b, a.x, a.y, t)) return { ok: false, reason: '這裡已走到大擠壓，時空已經結束' };
    const P = a.by === 'player' ? U.player : null;
    if(a.by === 'player'){
      if(!P) return { ok: false, reason: '沒有玩家宇宙' };
      if(P.ctl.exhausted) return { ok: false, reason: '力竭中，無法施放' };
      const pc = U.circleAt(P, t);
      if(Math.hypot(a.x - pc.cx, a.y - pc.cy) - pc.r > PLAYER.range*p.RH) return { ok: false, reason: '超出影響範圍（泡壁外一個哈伯半徑）' };
    }
    if(V.eps === pe) return { ok: false, reason: '這裡已經是這種真空' };
    const up = V.eps > pe;
    let r0 = p.R0;
    if(up){
      r0 = a.r === undefined ? .4*p.RH : +a.r;
      if(!(r0 >= 2*p.R0 && r0 <= 3*p.RH)) return { ok: false, reason: '向上穿隧區域的大小不合理' };
    }
    // 整個新泡泡必須落在同一個宇宙的地盤內（向上穿隧區域較大，要檢查一圈）；一般泡泡則與自然成核相同：不能太貼近泡壁
    if(own && Territory.arrival(own, a.x, a.y) > -(up ? r0 + 2 : p.R0*2)) return { ok: false, reason: '太靠近泡壁' };
    if(up){
      for(let j=0;j<24;j++){
        const th = TAU*j/24, o = Territory.ownerAt(F, circles, a.x + Math.cos(th)*(r0 + 2), a.y + Math.sin(th)*(r0 + 2));
        if((o ? o.b : null) !== (own ? own.b : null)) return { ok: false, reason: '範圍跨越了其他宇宙的地盤' };
      }
    }
    // 玩家技能的成本：向上穿隧 = 把該區域推高所需的能量 Δε × 面積；向下穿隧 = 固定的活化成本
    const cost = P ? (up ? (V.eps - pe)*Math.PI*r0*r0/(p.RH*p.RH) : PLAYER.downCost) : 0;
    if(P && P.ctl.E < cost) return { ok: false, reason: `能量不足（需要 ${cost.toFixed(2)}）` };
    const b = addBubble(a.x, a.y, Math.hypot(a.x, a.y), t, own ? own.b : null, { vac: a.vac, s: up ? -1 : 1, r0, seed: hash(p.seed, a.step, k) });
    if(P){ P.ctl.E -= cost; P.ctl.loss += cost; }
    return { ok: true, id: b.id, up, cost };
  }
  /* · spawn { x, y, vac, r, eta, mode }：在假真空中誕生玩家宇宙。mode：'relaxed'（輕鬆，預設：能量可以透支，只限制技能）
       或 'survival'（生存：能量耗盡就力竭，泡壁回到以光速自由膨脹）（同時只有一個；舊的會被放手，之後像一般泡泡一樣以光速擴張）
     · steer { dx, dy, rT }：玩家的輸入 —— 前進方向（長度 ≤ 1）與目標半徑；核心依此決定每一步的 (u, w)，見 playerStep */
  function actSpawn(a, t, k){
    const V = VAC[a.vac];
    if(!V || !(V.eps < FALSE_EPS)) return { ok: false, reason: '玩家宇宙必須是比假真空低的真空' };
    if(!isFinite(a.x) || !isFinite(a.y)) return { ok: false, reason: '參數錯誤' };
    const r0 = a.r === undefined ? .3*p.RH : +a.r;
    if(!(r0 >= 2*p.R0 && r0 <= .8*p.RH)) return { ok: false, reason: '玩家宇宙的大小不合理' };
    const F = U.frame(t), circles = [];
    for(const b of U.live) if(b.texit > t) circles.push(U.circleAt(b, t));
    if(Territory.ownerAt(F, circles, a.x, a.y)) return { ok: false, reason: '玩家宇宙要誕生在假真空中' };
    for(let j=0;j<24;j++){
      const th = TAU*j/24;
      if(Territory.ownerAt(F, circles, a.x + Math.cos(th)*(r0 + 2), a.y + Math.sin(th)*(r0 + 2))) return { ok: false, reason: '範圍內已有其他宇宙' };
    }
    if(U.player) release(U.player, t);
    const eta = a.eta === undefined ? PLAYER.eta : Math.max(.05, Math.min(1, +a.eta));
    const mode = a.mode === 'survival' ? 'survival' : 'relaxed';
    const b = addBubble(a.x, a.y, Math.hypot(a.x, a.y), t, null, { vac: a.vac, s: 1, r0, seed: hash(p.seed, a.step, k), ctl: true, eta, mode });
    b.player = true; U.player = b;
    decide(b, t);
    return { ok: true, id: b.id };
  }
  function actSteer(a){
    const P = U.player; if(!P) return { ok: false, reason: '沒有玩家宇宙' };
    let dx = +a.dx || 0, dy = +a.dy || 0; const m = Math.hypot(dx, dy); if(m > 1){ dx /= m; dy /= m; }
    const rT = a.rT === undefined ? P.ctl.in.rT : Math.max(2*p.R0, Math.min(.95*p.RH, +a.rT));
    P.ctl.in = { dx, dy, rT };
    return { ok: true };
  }
  /* ---------- 曲速（D12）----------
     空間本身的扭曲不受光速限制（前方收縮、後方膨脹，Alcubierre）：整個玩家宇宙連同內部的空間以 V = k·c 被搬動，
     泡壁相對被搬動的空間仍不超光速。代價是負能量（違反零能量條件），以「向真空借貸」表示：
     · 借貸速率 kappa·k²·(r/RH)²（越快、越大越貴）；量子不等式：借貸速率 × 持續時間² ≤ Q，到了上限自動結束
     · 量子利息：結束後必須在 repayT 秒內償還 借貸 × (1 + 持續時間/TI)（越久才還，利息越高），償還期間不能再啟動
     · 方向跟著玩家的輸入（鍵盤或滑鼠）改變，放開則維持原方向；可以隨時停下。碰到其他泡泡不會脫離：
       搬動的是空間本身，不轉手地盤；進入別的宇宙之後照一般規則（比你低的會吃掉你、比你高的被你吃掉）
     · warp { on: true, dx, dy, k }：啟動；warp { on: false }：停下 */
  const warpRate = (k, r) => PLAYER.warp.kappa*k*k*(r/p.RH)**2;
  function accrue(C, t, r){ const W = C.warp; W.B += warpRate(W.k, r)*Math.max(0, t - W.tAcc); W.tAcc = t; }
  function endWarp(b, t, why){
    const C = b.ctl, W = C.warp; if(!W) return;
    accrue(C, t, U.circleAt(b, t).r);
    const tau = t - W.t0, due = W.B*(1 + tau/PLAYER.warp.TI);
    C.warp = null;
    C.repay = due > 0 ? { left: due, rate: due/PLAYER.warp.repayT } : null;
    C.lastWarp = { t0: W.t0, t1: t, tau, k: W.k, borrowed: W.B, due, why };
  }
  function actWarp(a, t){
    const P = U.player; if(!P) return { ok: false, reason: '沒有玩家宇宙' };
    const C = P.ctl;
    if(!a.on){ if(!C.warp) return { ok: false, reason: '不在曲速中' }; endWarp(P, t, '手動'); return { ok: true }; }
    if(C.warp) return { ok: false, reason: '已在曲速中' };
    if(C.repay) return { ok: false, reason: '正在償還量子利息' };
    if(C.exhausted) return { ok: false, reason: '力竭中，無法啟動' };
    if(!(C.E > 0)) return { ok: false, reason: '能量透支中，無法再借貸負能量' };
    const c = U.circleAt(P, t), h = LH ? hIn(regionOf(P, t, c)) : p.H;
    if(h*c.r >= cLight) return { ok: false, reason: '失控中，無法啟動' };
    let dx = +a.dx || 0, dy = +a.dy || 0; const m = Math.hypot(dx, dy);
    if(!(m > 0)) return { ok: false, reason: '需要方向' };
    const k = Math.max(1, Math.min(PLAYER.warp.kMax, a.k === undefined ? PLAYER.warp.k : +a.k || PLAYER.warp.k));
    C.warp = { k, dx: dx/m, dy: dy/m, t0: t, tAcc: t, B: 0 };
    return { ok: true, k };
  }
  /* ---------- 再循環（D13）----------
     在 Λ > 0 的口袋宇宙中，以玩家為中心向上穿隧出「再循環假真空」：半徑 margin × 當地的哈伯半徑（原本的模型 RH；方案 B 為 c/h(口袋)），
     大於哈伯半徑的區域被周圍往內推也縮不掉，反而繼續長大 → 內部以假真空的穿隧率重新開始永恆暴脹。成本 = Δε × 面積（與技能 2 相同）。
     Λ ≤ 0 的宇宙不能再循環：反德西特會塌縮、閔考斯基無法向上穿隧。 */
  const rfVac = VAC.findIndex(v => v.kind === 'rf');
  /* 再循環能否在此處使用：回傳 { Q, r0, cost } 或拒絕原因（字串）。trapped 為 true 表示「物理上不可能」（所在處 Λ ≤ 0） */
  function recycleAt(P, t){
    const c = U.circleAt(P, t), Q = regionOf(P, t, c);
    if(!Q) return { reason: '你在假真空中，這裡仍在暴脹，不需要再循環' };
    const V = VAC[Q.vac];
    if(V.kind === 'rf') return { reason: '這裡已經是再循環的假真空' };
    if(V.kind === 'up') return { reason: '激發態區域比假真空還高，不需要再循環' };
    if(!(V.eps > 0) || U.crunchedAt(Q, c.cx, c.cy, t)) return { reason: '所在的宇宙 Λ ≤ 0：反德西特會塌縮、閔考斯基無法向上穿隧，無法再循環', trapped: true };
    if(V.eps < VAC[P.vac].eps) return { reason: '所在的宇宙真空能比你低（正在吞沒你），無法在這裡再循環' };
    const r0 = PLAYER.recycle.margin*(LH ? cLight/hIn(Q) : p.RH);
    return { Q, c, r0, cost: (FALSE_EPS - V.eps)*Math.PI*r0*r0/(p.RH*p.RH) };
  }
  function actRecycle(a, t, k){
    const P = U.player; if(!P) return { ok: false, reason: '沒有玩家宇宙' };
    const R = recycleAt(P, t); if(R.reason) return { ok: false, reason: R.reason };
    const { Q, c, r0, cost } = R, F = U.frame(t), circles = [];
    for(const b of U.live) if(b.texit > t && b !== P) circles.push(U.circleAt(b, t));
    // 整個區域必須在這個口袋宇宙的地盤內（不跨越其他宇宙）
    const qc = circles.find(o => o.b === Q);
    if(Territory.arrival(qc, c.cx, c.cy) > -(r0 + 2)) return { ok: false, reason: `口袋宇宙不夠大（需要半徑 ${(r0/p.RH).toFixed(2)} RH 的空間）` };
    for(let j=0;j<24;j++){
      const th = TAU*j/24, o = Territory.ownerAt(F, circles, c.cx + Math.cos(th)*(r0 + 2), c.cy + Math.sin(th)*(r0 + 2));
      if(!o || o.b !== Q) return { ok: false, reason: '範圍跨越了其他宇宙的地盤' };
    }
    if(P.ctl.E < cost) return { ok: false, reason: `能量不足（需要 ${cost.toFixed(2)}）` };
    const b = addBubble(c.cx, c.cy, Math.hypot(c.cx, c.cy), t, Q, { vac: rfVac, s: -1, r0, seed: hash(p.seed, a.step, k) });
    P.ctl.E -= cost; P.ctl.loss += cost;
    return { ok: true, id: b.id, cost, r0 };
  }
  U.recycleCheck = () => U.player ? recycleAt(U.player, U.tSim) : null;     // 介面用：此刻能否再循環（不改變狀態）
  /* 放手：玩家宇宙變回一般的泡泡（泡壁以光速擴張、不再移動），之後依一般規則流出模擬範圍 */
  function release(b, t){
    b.player = false; if(U.player === b) U.player = null;
    const c = U.circleAt(b, t), C = b.ctl;
    C.warp = null; C.repay = null;
    pushSeg(b, t, c.cx, c.cy, c.r, 0, 0, cLight, LH ? C.reg[segIndex(C, t)] : null);
    C.free = true; C.releasedAt = t;
    if(LH && C.reg[C.reg.length - 1]){ b.texit = Infinity; b.dyn = true; }   // 在口袋宇宙內：由掃描判斷流出
    else b.texit = exitTime(1, Math.hypot(c.cx, c.cy), c.r, t);
  }
  /* (x, y) 為物理位置；方案 B 時改存相對所在區域 reg 中心的偏移，並記下該區域的膨脹率 */
  function pushSeg(b, t, x, y, r, ux, uy, w, reg = null, vx = 0, vy = 0){
    const C = b.ctl, n = C.t.length, h = LH ? hIn(reg) : p.H;
    if(LH && reg){ const rc = anchorAt(reg, t); x -= rc.cx; y -= rc.cy; }
    if(n && C.t[n-1] === t){ C.x[n-1] = x; C.y[n-1] = y; C.r[n-1] = r; C.ux[n-1] = ux; C.uy[n-1] = uy; C.vx[n-1] = vx; C.vy[n-1] = vy; C.w[n-1] = w; C.reg[n-1] = reg; C.h[n-1] = h; return; }
    C.t.push(t); C.x.push(x); C.y.push(y); C.r.push(r); C.ux.push(ux); C.uy.push(uy); C.vx.push(vx); C.vy.push(vy); C.w.push(w); C.reg.push(reg); C.h.push(h);
  }
  /* 方案 B：玩家所在的區域 = 「除了玩家以外」玩家中心點的擁有者（歸屬一律由 Territory 判斷）；null 為假真空 */
  function regionOf(b, t, c){
    const cs = []; for(const o of U.live) if(o !== b && o.tn <= t && o.texit > t) cs.push(U.circleAt(o, t));
    const own = Territory.ownerAt(U.frame(t), cs, c.cx, c.cy);
    return own ? own.b : null;
  }
  /* 決定下一步 [t, t+STEP] 的控制：以 w 把半徑拉向目標（維持大小需 w = −H·r），剩下的光速額度給前進：|u| ≤ c − |w|。
     力竭時泡壁回到自然狀態：以光速擴張（w = c、u = 0），吞入假真空會補回能量。半徑 ≥ RH 時連維持大小都做不到（D4） */
  function decide(b, t){
    const C = b.ctl, c = cLight, cur = U.circleAt(b, t);
    // 方案 B：用所在區域的膨脹率 h（維持大小需 w = −h·r；當地的哈伯半徑 c/h 越大，越大也還控制得住）
    const reg = LH ? regionOf(b, t, cur) : null, h = LH ? hIn(reg) : p.H;
    let w, ux = 0, uy = 0;
    // 力竭期間目標半徑跟著實際半徑：恢復控制時維持當下的大小，而不是立刻花大量能量縮回去（縮小由玩家自己決定）。
    // 大於（當地的）哈伯半徑時連大小都維持不住（需要 w < −c）：失控，泡壁回到自然狀態
    if(C.warp && (C.exhausted || h*cur.r >= c)) endWarp(b, t, C.exhausted ? '力竭' : '失控');
    let vx = 0, vy = 0;
    if(C.exhausted || h*cur.r >= c){ w = c; C.in.rT = Math.max(2*p.R0, Math.min(.95*p.RH, cur.r)); }
    else {
      w = Math.max(-c, Math.min(c, -h*cur.r + PLAYER.k*(C.in.rT - cur.r)));
      if(C.warp){
        // 曲速：方向跟著輸入（放開則維持），玩家自己的前進速度 u 不用（移動全靠搬動空間）
        const m = Math.hypot(C.in.dx, C.in.dy); if(m > 0){ C.warp.dx = C.in.dx/m; C.warp.dy = C.in.dy/m; }
        vx = C.warp.dx*C.warp.k*c; vy = C.warp.dy*C.warp.k*c;
      }
      else {
        const um = c - Math.abs(w), m = Math.hypot(C.in.dx, C.in.dy);
        if(m > 0){ const f = Math.min(1, m)*um/m; ux = C.in.dx*f; uy = C.in.dy*f; }
      }
    }
    pushSeg(b, t, cur.cx, cur.cy, cur.r, ux, uy, w, reg, vx, vy);
  }
  /* 能量帳（D3）：在 [t−STEP, t] 期間，玩家宇宙與其他宇宙（或假真空）之間轉手的地盤 × 真空能差。
     以隨哈伯流移動的格點取樣（背景膨脹本身不算），歸屬一律由 Territory.ownerAt 判斷。
     · 吞入真空能較高的地盤：得到 Δε × 面積 × η
     · 退回給真空能較高者（收縮、移動時的後方）：付出 Δε × 面積 ÷ η
     · 被真空能較低者奪走：被奪走 Δε × 面積
     · 硬擠進真空能較低者：付出 Δε × 面積 ÷ η */
  function ledger(b, t){
    const t0 = t - STEP; if(b.tn > t0 + 1e-9) return;
    const C = b.ctl, c0 = U.circleAt(b, t0), c1 = U.circleAt(b, t);
    // 格點隨當地的空間流動：假真空以原點為縮放中心（速率 H）；方案 B 在口袋宇宙內時以該區域的中心與膨脹率
    // 曲速時空間連同玩家一起被搬動（V），格點也跟著搬：搬動本身不轉手地盤，只有泡壁相對空間的運動（u、w）才算
    const si = segIndex(C, t0 + STEP/2), reg = LH ? C.reg[si] : null, hr = LH ? C.h[si] : p.H, e = Math.exp(hr*STEP);   // 取這一步中點所在的段（t − STEP 的浮點誤差可能落到前一段）
    const g = hr > 1e-9 ? (e - 1)/hr : STEP, Vx = C.vx[si]*g, Vy = C.vy[si]*g;
    const r0c = reg ? anchorAt(reg, t0) : null, r1c = reg ? anchorAt(reg, t) : null;
    const adv = (x, y) => reg ? [r1c.cx + (x - r0c.cx)*e + Vx, r1c.cy + (y - r0c.cy)*e + Vy] : [x*e + Vx, y*e + Vy];
    const Rs = Math.max(c0.r, c1.r) + 6, n = Math.max(4, Math.min(PLAYER.latticeMax, Math.ceil(Rs/PLAYER.cell))), sp = Rs/n;
    const near = (tt, cx, cy, R) => { const out = []; for(const o of U.live) if(o.tn <= tt && o.texit > tt){ const c = U.circleAt(o, tt); if(Math.hypot(c.cx - cx, c.cy - cy) < c.r + R) out.push(c); } return out; };
    const [a1x, a1y] = adv(c0.cx, c0.cy);
    const own0 = Territory.locator(U.frame(t0), near(t0, c0.cx, c0.cy, Rs + 2)), own1 = Territory.locator(U.frame(t), near(t, a1x, a1y, Rs*e + 2));
    // 格點偏移以黃金比例逐步變化：長時間平均不偏
    const ox = ((U.stepN*.6180339887) % 1)*sp, oy = ((U.stepN*.7548776662) % 1)*sp, wA = sp*sp*e*e/(p.RH*p.RH);
    const eP = VAC[b.vac].eps, eOf = o => o ? VAC[o.b.vac].eps : FALSE_EPS;
    let own = 0;
    for(let i=-n-1;i<=n;i++) for(let j=-n-1;j<=n;j++){
      const dx = i*sp + ox, dy = j*sp + oy; if(dx*dx + dy*dy > Rs*Rs) continue;
      const x = c0.cx + dx, y = c0.cy + dy;
      const [x1, y1] = adv(x, y), o0 = own0(x, y), o1 = own1(x1, y1);
      const a0 = o0 ? o0.b : null, a1 = o1 ? o1.b : null;
      if(a1 === b) own++;
      if(a0 === a1 || (a0 !== b && a1 !== b)) continue;
      let dE;
      if(a1 === b){ const d = (eOf(o0) - eP)*wA; dE = d > 0 ? d*C.eta : d/C.eta; }
      else { const d = (eOf(o1) - eP)*wA; dE = d > 0 ? -d/C.eta : d; }
      C.E += dE; if(dE > 0) C.gain += dE; else C.loss -= dE;
    }
    if(C.mode === 'survival'){
      if(C.E <= 0) C.exhausted = true;
      else if(C.E >= PLAYER.minE) C.exhausted = false;
    }
    // 地盤全部被奪走（連續 0.5 秒取樣不到自己）：玩家宇宙被吞沒，放手
    C.gone = own ? 0 : (C.gone || 0) + STEP;
    if(C.gone >= .5){ C.fate = 'eaten'; release(b, t); b.texit = t + STEP/2; }   // 已經沒有地盤：從下一步起移除（不會再「復活」）
  }
  /* 接觸紀錄：可控制的泡泡與其他泡泡的接觸區間 [開始, 結束]（疇壁位移從每段接觸的開始算起） */
  function contacts(b, t){
    const C = b.ctl, cb = U.circleAt(b, t), t0 = t - STEP;
    for(const o of U.live){
      if(o === b || o.tn > t || o.texit <= t) continue;
      const co = U.circleAt(o, t), ov = Math.hypot(cb.cx - co.cx, cb.cy - co.cy) < cb.r + co.r;
      let arr = C.contacts.get(o.id); const open = arr && arr[arr.length - 1][1] === Infinity;
      if(ov === !!open) continue;
      const f = tt => { const A = U.circleAt(b, tt), B = U.circleAt(o, tt); return Math.hypot(A.cx - B.cx, A.cy - B.cy) - A.r - B.r; };
      let lo = Math.max(t0, b.tn, o.tn), hi = t;
      if(ov){
        if(f(lo) <= 0) hi = lo;
        else for(let i=0;i<30;i++){ const m = (lo + hi)/2; if(f(m) > 0) lo = m; else hi = m; }
        if(!arr) C.contacts.set(o.id, arr = []);
        arr.push([hi, Infinity]);
      } else {
        for(let i=0;i<30;i++){ const m = (lo + hi)/2; if(f(m) <= 0) lo = m; else hi = m; }
        arr[arr.length - 1][1] = lo;
      }
    }
  }
  /* 每一步：更新所有可控制泡泡的接觸；玩家宇宙結算能量帳、曲速的借貸與量子利息、困住的倒數，並決定下一步的控制 */
  function playerStep(t){
    for(const b of U.live) if(b.ctl && b.texit > t) contacts(b, t);
    const P = U.player;
    if(!P) return;
    const C = P.ctl;
    if(C.warp){
      // 累計借貸，到了量子不等式的上限（借貸速率 × 持續時間² ≤ Q）就結束
      const r = U.circleAt(P, t).r; accrue(C, t, r); const tau = t - C.warp.t0;
      if(warpRate(C.warp.k, r)*tau*tau >= PLAYER.warp.Q) endWarp(P, t, '量子不等式的上限');
    }
    // 困住（D13）：所在處 Λ ≤ 0、物理上無法再循環，持續 trapT 秒就遊戲結束（期間可用曲速逃出）
    C.trap = recycleAt(P, t).trapped ? (C.trap || 0) + STEP : 0;
    if(C.trap >= PLAYER.recycle.trapT){ C.fate = 'trapped'; release(P, t); return; }
    ledger(P, t);
    if(C.repay && U.player === P){
      // 償還量子利息（正能量脈衝）：在 repayT 秒內平均扣除
      const pay = Math.min(C.repay.left, C.repay.rate*STEP);
      C.E -= pay; C.loss += pay; C.repay.left -= pay;
      if(C.repay.left <= 1e-12) C.repay = null;
      if(C.mode === 'survival' && C.E <= 0) C.exhausted = true;
    }
    if(U.player === P) decide(P, t);
  }
  U.player = null;

  /* ---------- 焦點跟隨（D9 M4）----------
     平直切片的德西特時空對共動座標的平移是對稱的：把原點換到「此刻位於 (ax, ay) 的共動點」，
     所有泡泡的中心一起平移、半徑不變，物理完全相同（circleAt 的結果只差一個平移）。
     · 泡泡的誕生位置 (x, y) 是誕生時的物理座標，該共動點在 tn 時位於 (ax, ay)·e^{H(tn−t)}，所以減去它；玩家的每一段軌跡同理
     · 流出時刻改以新原點重算；已流出（被丟棄）的泡泡不會回來 —— 它們離原點超過 RGEN（遠大於 2·RH），永遠碰不到（D2）
     · 已退場的泡泡維持退場（退場判斷用的範圍多留了 200，足以涵蓋每次最多 recenter·RH 的平移）
     · 在步進的最後執行；動作一律在步進開頭套用，所以動作的座標永遠屬於套用當下的座標系，重播時完全一致 */
  U.recenters = 0;
  U.comoving = { x: 0, y: 0 };    // 目前原點的共動座標（以 t = 0 時的物理長度為單位），累計平移量
  function rebase(ax, ay, t, smooth = false){
    const H = p.H, seen = new Set();
    cacheEpoch++;
    const move = b => {
      if(seen.has(b)) return; seen.add(b);
      // 中心 = 誕生位置 × E(b, t)：除以「此刻實際的」膨脹倍數，中心才會準確平移 (ax, ay)。
      // 膨脹倍數已達上限 EMAX（幾何凍結）的泡泡若照 e^{H(tn−t)} 換算，中心幾乎不會移動，相對其他東西就漂走了
      const e = b.ctl ? Math.exp(H*(b.tn - t)) : 1/E(b, t); b.x -= ax*e; b.y -= ay*e; b.d = Math.hypot(b.x, b.y);
      // 方案 B：相對所在區域中心的軌跡段不用平移（區域中心本身會跟著平移）
      if(b.ctl){ const C = b.ctl; for(let i=0;i<C.t.length;i++){ if(C.reg[i]) continue; const f = Math.exp(H*(C.t[i] - t)); C.x[i] -= ax*f; C.y[i] -= ay*f; } }
    };
    for(const b of U.hist) move(b); for(const b of U.longs) move(b); for(const b of U.live) move(b);
    for(const b of U.live){
      if(!(b.texit > t) || b.retired || b.player || b.dyn) continue;
      if(b.ctl){ const c = U.circleAt(b, t); b.texit = exitTime(1, Math.hypot(c.cx, c.cy), c.r, t); }
      else b.texit = exitTime(b.s, b.d, b.r0, b.tn);
      if(b.texit <= t) b.texit = t + STEP/2;
      if(!b.long && !(b.texit - b.tn <= LONG)){ b.long = true; U.longs.push(b); }
    }
    const e0 = Math.exp(-H*t); U.comoving.x += ax*e0; U.comoving.y += ay*e0; U.recenters++;
    for(const fn of listeners.rebase) fn({ x: ax, y: ay, t, smooth });
  }
  U.rebase = (ax, ay) => rebase(ax, ay, U.tSim);     // 測試用：在目前的步進邊界手動平移
  function follow(t){
    const P = U.player; if(!P) return;
    const c = U.circleAt(P, t);
    if(Math.hypot(c.cx, c.cy) > PLAYER.recenter*p.RH) rebase(c.cx, c.cy, t);
  }
  /* 方案 B：沒有玩家、觀測者在某個口袋宇宙內時，觀測者跟著那個宇宙的空間流動（每一步平移原點到它在該宇宙中的共動點）。
     否則觀測者仍以假真空的方式流動，相對口袋宇宙內部的空間會以超光速漂移 —— 這是把不同區域接在同一張平面上的副作用 */
  /* 觀測者所在的區域要「記住」：巨大而古老的口袋宇宙內部相對假真空座標的漂移可達每步上萬像素，
     若每一步才用「原點此刻的擁有者」重新判斷，原點在一步之內就已漂出那個宇宙。所以先依上一步的區域平移，平移後再重新判斷 */
  U.obsRegion = null;
  function comove(t){
    const P = U.obsRegion;
    if(P){
      const c0 = anchorAt(P, t - STEP), c1 = anchorAt(P, t), e = Math.exp(hIn(P)*STEP);
      const qx = c1.cx - c0.cx*e, qy = c1.cy - c0.cy*e;
      if(qx*qx + qy*qy > 1e-12) rebase(qx, qy, t, true);
    }
    const o = U.ownerAt(0, 0, t); U.obsRegion = o ? o.b : null;
  }
  /* 方案 B：焦點（原點）所在的區域鏈，錨點每 5 秒或離焦點太遠時換到焦點 */
  function keepAnchors(t){
    const o = U.ownerAt(0, 0, t);
    for(let R = o ? o.b : null; R; R = R.parent){
      if(R.ctl && R.player) continue;
      const A = anchorAt(R, t);
      if(!R.anc || t - R.anc.tk > 5 || Math.hypot(A.cx, A.cy) > p.RH) reanchor(R, 0, 0, t);
    }
  }
  /* 方案 B：子泡泡的流出改由掃描判斷 —— 近側邊緣離原點超過 RGEN + 60 就丟棄；縮成一點的也丟棄 */
  function sweep(t){
    for(const b of U.live){
      if(!b.dyn || !(b.texit > t) || b.retired || b.player) continue;
      const c = U.circleAt(b, t);
      if(Math.hypot(c.cx, c.cy) - c.r > p.RGEN + 60 || (b.s < 0 && c.r <= 0)) b.texit = t + STEP/2;
    }
  }

  function applyActions(step){
    let k = 0;
    while(pendingAct < U.actions.length && U.actions[pendingAct].step <= step){
      const a = U.actions[pendingAct++];
      a.t = U.tSim;
      a.result = a.type === 'nucleate' ? actNucleate(a, U.tSim, k++)
        : a.type === 'spawn' ? actSpawn(a, U.tSim, k++)
        : a.type === 'steer' ? actSteer(a)
        : a.type === 'warp' ? actWarp(a, U.tSim)
        : a.type === 'recycle' ? actRecycle(a, U.tSim, k++)
        : { ok: false, reason: '未知的動作' };
      for(const fn of listeners.act) fn(a);
    }
  }
  U.pendingActions = () => U.actions.slice(pendingAct);

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
      if(isFinite(b.texit) || b.player) continue;          // 玩家宇宙不退場
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
        if(gone){ b.texit = t + STEP/2; b.retired = true; notify('retire', b); break; }   // 從下一步起退場（這一步誕生的泡泡仍看得到它）
      }
    }
  }
  U.advance = dt => {
    U.acc += dt;
    let n = 0;
    while(U.acc >= STEP && n < 20000){ U.acc -= STEP; U.tSim += STEP; if(pendingAct < U.actions.length) applyActions(U.stepN + 1);
      // 焦點跟隨在成核之前：成核範圍以玩家（或方案 B 中隨所在宇宙流動的觀測者）此刻的位置為中心；動作已在這之前套用，座標屬於送出當下的座標系
      if(U.player) follow(U.tSim); else if(LH) comove(U.tSim);
      if(LH) keepAnchors(U.tSim);
      nucleate(); if(U.player || U.anyCtl) playerStep(U.tSim);
      if(LH){ if(U.stepN % 15 === 0) sweep(U.tSim); cacheEpoch++; }
      if(++U.stepN % 30 === 0) retire(); n++; }
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
    for(const b of U.longs) if(b.ctl){
      const C = b.ctl; let k = 0; while(k + 1 < C.t.length && C.t[k + 1] <= cut - 1) k++;
      if(k) for(const key of ['t', 'x', 'y', 'r', 'ux', 'uy', 'w']) C[key].splice(0, k);
      for(const [id, arr] of C.contacts){ const kept = arr.filter(iv => iv[1] >= cut - LONG); if(kept.length) C.contacts.set(id, kept); else C.contacts.delete(id); }
    }
    const kb = Math.floor(cut/BUCKET) - U.bucketBase;
    if(kb > 0){ U.buckets.splice(0, kb); U.bucketBase += kb; }
  };
  U.presim = sec => { for(let i=0;i<Math.round(sec/STEP);i++) U.advance(STEP); };
  U.fingerprint = tMax => U.hist.filter(b => b.tn <= tMax).map(b => `${b.id}:${b.tn.toFixed(6)}:${b.x.toFixed(4)}:${b.y.toFixed(4)}:${b.vac}:${b.parent ? b.parent.id : 0}${b.act ? ':a' + b.s + ':' + b.r0 : ''}`).join('|');
  return U;
}
