/* 核心｜泡泡之間：第一次相撞的時刻、疇壁位移、玩家的接觸區間與推進前緣，以及交給 Territory 的規則情境（U.frame）。 */
import { EMAX } from './constants.js';

export function installWalls(W){
  const { U, p, tune } = W, cLight = W.cLight;

  U.eps = b => W.VAC[b.vac].eps;

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
  /* 疇壁位移（物理長度，W 佔上風為正）：v = 0.85c·Δε/(|Δε|+0.25)，再隨所在空間的膨脹拉長。
     兩者在同一個區域空間（方案 B 的兄弟泡泡）時以該區域的膨脹率；否則以根空間 */
  U.shift = (Wb, L, t) => {
    if(Wb.vac === L.vac) return 0;
    const D = U.eps(L) - U.eps(Wb), tc = U.contactStart(Wb, L, t);
    if(t <= tc) return 0;
    const sp = W.spaceOf(Wb);
    if(sp.region && sp === W.spaceOf(L)){
      const v = .85*D/(Math.abs(D) + .25)*tune.wallK*cLight, h = sp.h, d = t - tc;
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
     ρ(t) = (ρ₀ + v/h)·e^{hΔt} − v/h（h → 0 時 ρ₀ + v·Δt）。前緣與贏家的圓同心、在同一個空間裡流動，所以 h 是贏家所在空間的膨脹率
     （原本的模型一律是 H；方案 B 曾誤用 H，口袋內的前緣跑得比贏家的光錐還快）。
     還沒有接觸紀錄（兩步之間剛碰到）時，前緣就在輸家圓上，輸家尚未失去地盤 */
  U.ringR = (Wb, L, t) => {
    const P = Wb.ctl ? Wb : L, arr = P.ctl.contacts.get((P === Wb ? L : Wb).id);
    let iv = null;
    if(arr) for(let i = arr.length - 1; i >= 0; i--) if(arr[i][0] <= t + 1e-9){ if(t <= arr[i][1] + 1e-9) iv = arr[i]; break; }
    if(!iv){ const a = U.circleAt(Wb, t), b = U.circleAt(L, t); return Math.hypot(a.cx - b.cx, a.cy - b.cy) - b.r; }
    if(iv[2] === undefined){ const a = U.circleAt(Wb, iv[0]), b = U.circleAt(L, iv[0]); iv[2] = Math.hypot(a.cx - b.cx, a.cy - b.cy) - b.r; }
    const D = U.eps(L) - U.eps(Wb), vc = .85*D/(Math.abs(D) + .25)*tune.wallK;   // v/c，v = 0.85c·Δε/(|Δε|+0.25)（與 U.shift 相同）
    const sp = W.spaceOf(Wb);
    if(sp.region){
      const h = sp.h, v = vc*cLight, d = t - iv[0];
      return h > 1e-9 ? (iv[2] + v/h)*Math.min(EMAX, Math.exp(h*d)) - v/h : iv[2] + v*d;
    }
    const vH = vc*p.RH;
    return (iv[2] + vH)*Math.min(EMAX, Math.exp(p.H*(t - iv[0]))) - vH;
  };
  /* 交給 Territory 的規則情境：時刻、真空能、疇壁位移、推進前緣、圓（scale 為畫面縮放倍率） */
  U.frame = (t, scale = 1, circ) => ({ t, eps: U.eps, shift: (Wb, L) => U.shift(Wb, L, t)*scale, ring: (Wb, L) => U.ringR(Wb, L, t)*scale, circ: circ || (b => U.circleAt(b, t)) });
}
