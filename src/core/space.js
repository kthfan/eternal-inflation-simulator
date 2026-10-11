/* 核心｜空間：泡泡所在的空間如何流動，以及由此決定的幾何（U.circleAt —— 所有圓的唯一來源）。

   「空間」是一個參考系：一個縮放中心、一個膨脹率 h，泡泡的中心隨它流動、泡壁相對它以光速推進。
   · 根空間：假真空，以原點為縮放中心、膨脹率 H（平直切片的德西特時空）。原本的模型只有這一個空間。
   · 區域空間（方案 B，p.localH）：每個母宇宙 R 的內部各是一個空間，以 R 的錨點為縮放中心、膨脹率 h = H·√(ε/ε_假真空)
     （Λ ≤ 0 視為 0；激發態假真空 H·√1.6）。子泡泡跟著母宇宙內部的空間流動：
       中心 c(t) = A_R(t) + (誕生點 − A_R(tn))·e^{h(t−tn)}，半徑 r(t) = (r₀ ± c/h)·e^{h(t−tn)} ∓ c/h（h → 0 時 r₀ ± c·(t−tn)）。
     以一點為中心縮放，圓仍是圓（Territory 不用改）；子孫的真空能較低 → h 較小 → 子泡泡永遠留在母泡泡的光錐內。
     這是「各區域各自膨脹、在泡壁處接起來」的近似：真實的泡泡內部是泡壁光錐內的另一個開放宇宙（見 docs/ROADMAP.md D11、D14）。

   每個空間提供：膨脹率 h、哈伯半徑 hubble、一般泡泡的圓 circle(b, t)、玩家軌跡段的圓 seg(C, i, t)、
   物理座標 ↔ 空間內座標 toLocal(x, y, t)、隨空間流動一步的格點位置 advector(t0, t, e, Vx, Vy)。
   其他模組只透過 W.spaceOf(b)／W.regionSpace(R) 取得空間，不再自行判斷「是不是方案 B」。 */
import { STEP, EMAX, FALSE_EPS } from './constants.js';

export function installSpace(W){
  const { U, p, VAC } = W, LH = W.LH, cLight = W.cLight;

  /* 根空間的膨脹倍數（上限 EMAX） */
  const E = (b, t) => Math.min(EMAX, Math.exp(p.H*(t - b.tn)));
  U.E = W.E = E;

  /* 各區域內部的膨脹率：Λ > 0 為 H·√(ε/ε_假真空)，Λ ≤ 0 為 0；null（假真空）為 H */
  const hIn = b => { if(!b) return p.H; const e = VAC[b.vac].eps; return e > 0 ? p.H*Math.sqrt(e/FALSE_EPS) : 0; };
  U.hIn = W.hIn = hIn;

  /* 區域空間的倍數上限：偏移存相對焦點附近的錨點，偏移小、倍數大、乘積仍在正常範圍，所以不需要 EMAX 這個保險（只防溢位）。
     若照 EMAX 截斷，年齡夠大的子泡泡會凍結，而換錨點時的換算又不知道它凍結了，兩者一不一致就會漂走 */
  const BMAX = 1e250, ex = (h, d) => Math.min(BMAX, Math.exp(h*d));
  /* 相對膨脹率 h 的空間，泡壁以光速推進（s = +1 擴張、−1 收縮）的半徑 */
  const grow = (r0, s, h, d) => {
    if(h > 1e-9){ const e = ex(h, d), k = cLight/h; return s < 0 ? Math.max(0, (r0 - k)*e + k) : (r0 + k)*e - k; }
    return s < 0 ? Math.max(0, r0 - cLight*d) : r0 + cLight*d;
  };

  /* 玩家軌跡段：二分搜尋 t 所在的段 */
  const segIndex = (C, t) => { const T = C.t; let lo = 0, hi = T.length - 1; while(lo < hi){ const m = (lo + hi + 1) >> 1; if(T[m] <= t) lo = m; else hi = m - 1; } return lo; };
  W.segIndex = segIndex;

  /* ---------- 根空間 ----------
     泡壁以光速擴張：r = R0·E + RH·(E−1)；收縮泡泡（s = −1，內部真空能比周圍高）：r = r0·E − RH·(E−1)，縮到 0 為止。
     玩家軌跡段（每一步的控制 (u, w) 與曲速速度 V 固定）：c(t) = (c₀ + (u+V)/H)·e^{HΔt} − (u+V)/H，r(t) = (r₀ + w/H)·e^{HΔt} − w/H */
  const root = {
    region: false, R: null, h: p.H, hubble: p.RH,
    circle(b, t){ const e = E(b, t); return { b, cx: b.x*e, cy: b.y*e, r: b.s < 0 ? Math.max(0, b.r0*e - p.RH*(e - 1)) : p.R0*e + p.RH*(e - 1) }; },
    seg(C, i, t, b){
      const H = p.H, e = Math.min(EMAX, Math.exp(H*(t - C.t[i]))), ux = (C.ux[i] + C.vx[i])/H, uy = (C.uy[i] + C.vy[i])/H, w = C.w[i]/H;
      return { b, cx: (C.x[i] + ux)*e - ux, cy: (C.y[i] + uy)*e - uy, r: Math.max(0, (C.r[i] + w)*e - w) };
    },
    toLocal: (x, y) => [x, y],
    advector: (t0, t, e, Vx, Vy) => (x, y) => [x*e + Vx, y*e + Vy],
  };
  W.root = root;

  /* ---------- 區域空間（方案 B）---------- */
  /* 母宇宙中心的快取（同一時刻、同一座標系內重複使用；每一步與每次平移原點後失效） */
  let cacheEpoch = 0;
  W.invalidate = () => { cacheEpoch++; };
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
  W.anchorAt = anchorAt;
  function makeRegion(R){
    const h = hIn(R);
    return {
      region: true, R, h, hubble: h > 1e-9 ? cLight/h : Infinity,
      anchor: t => anchorAt(R, t),
      circle(b, t){
        const pc = anchorAt(R, t), d = t - b.tn, e = b.h > 0 ? ex(b.h, d) : 1;
        return { b, cx: pc.cx + b.ox*e, cy: pc.cy + b.oy*e, r: grow(b.r0, b.s, b.h, d) };
      },
      seg(C, i, t, b){
        const hh = C.h[i], d = t - C.t[i], base = anchorAt(R, t);
        let x, y, r;
        const vx = C.ux[i] + C.vx[i], vy = C.uy[i] + C.vy[i];
        if(hh > 1e-9){ const e = ex(hh, d), ux = vx/hh, uy = vy/hh, w = C.w[i]/hh; x = (C.x[i] + ux)*e - ux; y = (C.y[i] + uy)*e - uy; r = (C.r[i] + w)*e - w; }
        else { x = C.x[i] + vx*d; y = C.y[i] + vy*d; r = C.r[i] + C.w[i]*d; }
        return { b, cx: base.cx + x, cy: base.cy + y, r: Math.max(0, r) };
      },
      toLocal(x, y, t){ const rc = anchorAt(R, t); return [x - rc.cx, y - rc.cy]; },
      advector(t0, t, e, Vx, Vy){ const r0c = anchorAt(R, t0), r1c = anchorAt(R, t); return (x, y) => [r1c.cx + (x - r0c.cx)*e + Vx, r1c.cy + (y - r0c.cy)*e + Vy]; },
      /* 在這個空間誕生的子泡泡：偏移相對錨點；流出時刻沒有簡單的解析式，改由掃描判斷（sweep）；收縮泡泡則是縮成一點的時刻 */
      place(b, x, y, t){
        const pc = anchorAt(R, t), k = h > 1e-9 ? cLight/h : Infinity;
        b.dyn = true; b.ox = x - pc.cx; b.oy = y - pc.cy; b.h = h;
        return b.s > 0 ? Infinity : h > 1e-9 ? (b.r0 < k ? t + Math.log(k/(k - b.r0))/h : Infinity) : t + b.r0/cLight;
      },
    };
  }
  /* R 內部的空間（原本的模型：一律是根空間）。區域空間依母宇宙快取（真空不變 → 膨脹率不變） */
  const regionSpace = R => LH && R ? (R._space || (R._space = makeRegion(R))) : root;
  W.regionSpace = regionSpace;
  /* 一般泡泡所在的空間：母宇宙的內部 */
  W.spaceOf = b => regionSpace(b.parent);

  /* 所有圓的唯一來源：一般泡泡依所在的空間；玩家（可控制的泡泡）依每一段軌跡記下的空間（C.reg[i]，null 為根空間） */
  U.circleAt = (b, t) => {
    if(b.ctl){ const C = b.ctl, i = segIndex(C, t); return regionSpace(C.reg[i]).seg(C, i, t, b); }
    return (LH && b.parent ? regionSpace(b.parent) : root).circle(b, t);
  };

  if(!LH) return;

  /* 把 R 的錨點換到此刻位於 (ax, ay) 的 R 共動點：所有以 R 為區域的偏移扣掉新舊錨點之差（隨 R 的膨脹率換算到各自的時刻） */
  function reanchor(R, ax, ay, t){
    const A = anchorAt(R, t), dx = ax - A.cx, dy = ay - A.cy, h = hIn(R), seen = new Set();
    const fix = b => {
      if(seen.has(b)) return; seen.add(b);
      // 與 circleAt 用同一個倍數換算（1/ex），兩邊才會一致
      if(b.dyn && b.parent === R && !b.ctl){ const f = 1/ex(h, t - b.tn); b.ox -= dx*f; b.oy -= dy*f; }
      if(b.ctl){ const C = b.ctl; for(let i=0;i<C.t.length;i++) if(C.reg[i] === R){ const f = 1/ex(h, t - C.t[i]); C.x[i] -= dx*f; C.y[i] -= dy*f; } }
    };
    for(const b of U.hist) fix(b); for(const b of U.longs) fix(b); for(const b of U.live) fix(b);
    const c = centerAt(R, t); R.anc = { tk: t, dx: ax - c.cx, dy: ay - c.cy };
    cacheEpoch++;
  }
  /* 焦點（原點）所在的區域鏈，錨點每 5 秒或離焦點太遠時換到焦點 */
  W.keepAnchors = t => {
    const o = U.ownerAt(0, 0, t);
    for(let R = o ? o.b : null; R; R = R.parent){
      if(R.ctl && R.player) continue;
      const A = anchorAt(R, t);
      if(!R.anc || t - R.anc.tk > 5 || Math.hypot(A.cx, A.cy) > p.RH) reanchor(R, 0, 0, t);
    }
  };
  /* 子泡泡的流出改由掃描判斷：近側邊緣離原點超過 RGEN + 60 就丟棄；縮成一點的也丟棄 */
  W.sweep = t => {
    for(const b of U.live){
      if(!b.dyn || !(b.texit > t) || b.retired || b.player) continue;
      const c = U.circleAt(b, t);
      if(Math.hypot(c.cx, c.cy) - c.r > p.RGEN + 60 || (b.s < 0 && c.r <= 0)) b.texit = t + STEP/2;
    }
  };
}
