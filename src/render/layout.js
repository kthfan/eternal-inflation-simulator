/* 繪製｜畫面上的版面：取出畫面上的泡泡、以 Territory 建立彼此的規則，並把每個宇宙的領域、泡壁、疇壁變成螢幕上的路徑。
   只把核心的歸屬規則畫出來，自己不做任何歸屬判斷（docs/ARCHITECTURE.md）。
   paintedAt 回報畫面上一點實際最後被誰畫到，供自我檢查比對核心的 ownerAt。 */
import { S } from '../app/state.js';
import { QL } from '../app/config.js';
import { TAU } from '../core/math.js';
import { Territory } from '../core/territory.js';
import { P, ctx } from './camera.js';

/* ---------- 取出畫面上的泡泡，並以 Territory 建立彼此的規則 ---------- */
export let visByB = new Map();

/* 交界線可見性判斷用的候選泡泡：自己、規則中的鄰居、子孫、祖先（任何可能涵蓋這一帶的泡泡） */
export function candOf(v){
  if(v.cand) return v.cand;
  const set = new Set([v]);
  for(const R of v.rules || []) set.add(Territory.otherOf(R, v));
  for(const k of v.kids || []) set.add(k);
  for(let q = v.b.parent; q; q = q.parent){ const pv = visByB.get(q); if(pv) set.add(pv); }
  // 依繪製順序由上到下排列：判斷顯示者時，找到第一個涵蓋該點的就能停（其餘都畫在它下面）
  return v.cand = [...set].filter(c => c.ord !== undefined).sort((a, b) => b.ord - a.ord);
}

export const mergeCands = (a, b) => [...new Set(candOf(a).concat(candOf(b)))].sort((p, q) => q.ord - p.ord);

export let walls = [];

export function screenCircle(b, t){
  const c = S.U.circleAt(b, t);
  return { b, cx: S.vw/2 + (c.cx - P.x)*S.Z, cy: S.vh/2 + (c.cy - P.y)*S.Z, r: c.r*S.Z, px: c.cx, py: c.cy, pr: c.r };
}

export function collect(t){
  const hd = Math.hypot(S.vw, S.vh)/2, cx = S.vw/2, cy = S.vh/2;
  S.vis = [];
  for(const b of S.U.aliveAt(t)){
    const v = screenCircle(b, t);
    const D = Math.hypot(v.cx - cx, v.cy - cy);
    if(D - v.r > hd) continue;
    v.sx = v.cx; v.sy = v.cy; v.sr = v.r; v.age = t - b.tn; v.full = v.r - D > hd;
    S.vis.push(v);
  }
  S.vis.sort((a, b) => a.b.tn - b.b.tn || a.b.id - b.b.id);
  const byB = new Map(); for(const v of S.vis) byB.set(v.b, v);
  visByB = byB;
  const F = S.U.frame(t, S.Z, b => byB.get(b) || screenCircle(b, t));
  walls = Territory.buildRules(S.vis, F, QL[S.qLevel].col).filter(R => R.kind === 'wall' || R.kind === 'merge');
  // 同種真空融合的群組（共用星空等紋理）
  for(const v of S.vis) v.grp = v;
  const root = v => { while(v.grp !== v){ v.grp = v.grp.grp; v = v.grp; } return v; };
  for(const v of S.vis) for(const R of v.rules) if(R.kind === 'merge'){ const a = root(R.A), b = root(R.B); if(a !== b){ if(a.b.tn <= b.b.tn) b.grp = a; else a.grp = b; } }
  for(const v of S.vis) v.grp = root(v);
  return F;
}

/* ---------- 只在畫面附近產生幾何 ----------
   吞沒觀測者的泡泡半徑可達上百億像素，中心也遠在畫面之外。若照常從中心發射射線、畫完整的圓弧或用放射漸層，
   畫面附近的邊界會被粗略的折線近似（誤差可達數萬像素，造成區域突然跳換），漸層也會因精度不足而失真，繪圖也越來越慢。
   因此一律只產生「看得到的那一小段」：射線只掃過畫面所在的角度範圍，弧線改用畫面內的折線，漸層改用沿半徑方向的線性近似。 */
export const BIG = 2e4;

/* 上一格實際畫出的順序（drawBubbles 記下）。paintedAt：螢幕上一點最後是被哪個泡泡畫到（用 drawBubbles 實際用過的路徑、剪掉的洞與略過的範圍），
   供自我檢查比對核心的 ownerAt */
let drawn = { order: [], first: 0 };
export function setDrawn(order, first){ drawn = { order, first }; }
export function paintedAt(sx, sy){
  const { order, first } = drawn, X = sx*S.dpr, Y = sy*S.dpr;
  for(let i=order.length - 1;i>=first;i--){
    const v = order[i];
    ctx.save(); ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    cellPath(v); let inside = ctx.isPointInPath(X, Y);
    if(inside) for(const pts of v.clipHoles || []){ ctx.beginPath(); polyPath(pts); if(ctx.isPointInPath(X, Y)){ inside = false; break; } }
    ctx.restore();
    if(inside) return v;
  }
  return null;
}

export function viewBox(){ return { x0: -40, y0: -40, x1: S.vw + 40, y1: S.vh + 40 }; }

export const viewWedge = (cx, cy) => Territory.boxWedge(cx, cy, viewBox());

/* 領域的多邊形：沿射線求邊界。泡泡中心在畫面內時掃一整圈（射線數取 2 的次方，避免取樣點每格漂移）；
   中心在畫面外時只掃過畫面所在的角度範圍，並把多邊形截在畫面附近，所有座標都保持在畫面尺度。 */

export function cellPath(v, cap){
  ctx.beginPath();
  const lim = cap === undefined ? Math.max(.6, v.r) : Math.min(v.r, cap);
  const constrained = v.rules && v.rules.some(R => R.kind === 'merge' || (R.kind === 'wall' && ((R.W === v && !Territory.isHole(R, v)) || R.lYield)) || (R.kind === 'inherit' && R.X === v && !R.free));
  const wedge = viewWedge(v.cx, v.cy);
  if(!constrained && cap === undefined && v.full){ ctx.rect(-10, -10, S.vw + 20, S.vh + 20); return; }
  if(!constrained && !wedge && lim < BIG){ ctx.arc(v.cx, v.cy, lim, 0, TAU); return; }
  if(cap === undefined && v.cellPts){ const p = v.cellPts; ctx.moveTo(p[0], p[1]); for(let k=2;k<p.length;k+=2) ctx.lineTo(p[k], p[k+1]); ctx.closePath(); return; }
  let pts;
  if(!wedge){
    const N = Math.pow(2, Math.ceil(Math.log2(Math.max(32, Math.min(1024, lim*TAU/5)))));
    pts = new Float64Array(N*2);
    for(let k=0;k<N;k++){
      const th = TAU*k/N, ex = Math.cos(th), ey = Math.sin(th), rho = constrained ? Territory.cellRay(v, ex, ey, lim) : lim;
      pts[2*k] = v.cx + ex*rho; pts[2*k+1] = v.cy + ey*rho;
    }
  } else {
    const inner = Math.max(0, wedge.dmin - 2), outer = Math.min(lim, wedge.dmax + 2);
    if(outer <= inner){ if(cap === undefined) v.cellPts = new Float64Array(0); return; }
    const N = 256; pts = new Float64Array((N + 1)*4);
    for(let k=0;k<=N;k++){
      const th = wedge.a0 + (wedge.a1 - wedge.a0)*k/N, ex = Math.cos(th), ey = Math.sin(th);
      let rho = constrained ? Territory.cellRay(v, ex, ey, lim) : lim;
      rho = Math.max(inner, Math.min(outer, rho));
      pts[2*k] = v.cx + ex*rho; pts[2*k+1] = v.cy + ey*rho;
      const j = 2*N + 1 - k; pts[2*j] = v.cx + ex*inner; pts[2*j+1] = v.cy + ey*inner;
    }
  }
  if(cap === undefined) v.cellPts = pts;
  if(!pts.length) return;
  for(let k=0;k<pts.length;k+=2) S.maxPathCoord = Math.max(S.maxPathCoord, Math.abs(pts[k]), Math.abs(pts[k+1]));
  ctx.moveTo(pts[0], pts[1]); for(let k=2;k<pts.length;k+=2) ctx.lineTo(pts[k], pts[k+1]); ctx.closePath();
}

/* 領域中的洞（見 Territory.isHole）：以輸家（玩家）的中心沿射線求出洞的多邊形 —— 外緣依角度順序、內緣倒序，
   輸家中心在前緣外時內緣就是中心一點。只處理碰到畫面的洞 */
function holePoly(R){
  const L = R.L, vb = viewBox();
  if(L.cx + L.r < vb.x0 || L.cx - L.r > vb.x1 || L.cy + L.r < vb.y0 || L.cy - L.r > vb.y1) return null;
  const N = Math.pow(2, Math.ceil(Math.log2(Math.max(32, Math.min(512, L.r*TAU/4))))), out = [], inn = [];
  let any = false, ring = false;
  for(let k=0;k<=N;k++){                              // 頭尾同一個角度：外緣與內緣都是閉合的，接縫處沒有縫隙
    const th = TAU*k/N, ex = Math.cos(th), ey = Math.sin(th), [a, b] = Territory.holeSpan(R, ex, ey);
    if(b > a) any = true; if(a > 0) ring = true;
    out.push(L.cx + ex*b, L.cy + ey*b); inn.push(L.cx + ex*a, L.cy + ey*a);
  }
  if(!any) return null;
  if(!ring) return out;                               // 內緣只是中心一點：外緣本身就是洞
  for(let k=inn.length - 2;k>=0;k-=2) out.push(inn[k], inn[k+1]);
  return out;
}
const holesOf = v => (v.rules || []).filter(R => Territory.isHole(R, v));
const polyPath = pts => { ctx.moveTo(pts[0], pts[1]); for(let k=2;k<pts.length;k+=2) ctx.lineTo(pts[k], pts[k+1]); ctx.closePath(); };
/* 畫 v 之前呼叫：把畫面上的洞剪掉（每個洞各剪一次，剪裁區取交集 = 扣掉所有洞的聯集）。有剪裁時回傳 true，畫完要 ctx.restore() */
export function holeClip(v){
  const ps = holesOf(v).map(holePoly).filter(Boolean);
  v.clipHoles = null;
  if(!ps.length) return false;
  ctx.save();
  for(const pts of ps){ ctx.beginPath(); ctx.rect(-50, -50, S.vw + 100, S.vh + 100); polyPath(pts); ctx.clip('evenodd'); }
  v.clipHoles = ps;                                   // 記下實際剪掉的洞（paintedAt 用）
  return true;
}
/* 有洞落在畫面上的泡泡，不能當成「蓋住整個畫面」（洞可能比 drawBubbles 的取樣格子還小） */
export const holeOnScreen = v => holesOf(v).some(R => holePoly(R));

/* 在 [a0,a1] 角度範圍內，沿半徑 r 的圓畫出 ok(角度) 為真的部分；小圓用真正的圓弧，巨大的圓用畫面內的折線 */
export function arcRuns(cx, cy, r, a0, a1, ok, M){
  const refine = (a, b) => { for(let i=0;i<16;i++){ const m = (a + b)/2; if(ok(m)) a = m; else b = m; } return (a + b)/2; };
  let start = null, prev = a0, prevOk = false;
  const flush = (st, en) => {
    if(r < BIG){ ctx.moveTo(cx + Math.cos(st)*r, cy + Math.sin(st)*r); ctx.arc(cx, cy, r, st, en); return; }
    const K = 64;
    for(let i=0;i<=K;i++){ const a = st + (en - st)*i/K, x = cx + Math.cos(a)*r, y = cy + Math.sin(a)*r; if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); S.maxPathCoord = Math.max(S.maxPathCoord, Math.abs(x), Math.abs(y)); }
  };
  for(let k=0;k<=M;k++){
    const a = a0 + (a1 - a0)*k/M, f = ok(a);
    if(f && !prevOk) start = k === 0 ? a : refine(a, prev);
    if(!f && prevOk) flush(start, refine(prev, a));
    prev = a; prevOk = f;
  }
  if(prevOk) flush(start, a1);
}

/* 泡壁：只畫仍面向外界的部分 */
export function wallPath(v){
  ctx.beginPath();
  const cands = candOf(v);
  // 快速判斷：泡壁上這一點附近若沒有其他（非祖先的）泡泡，內側必定顯示自己、外側必定不是自己，一定可見
  const others = cands.filter(c => c !== v && !Territory.isAncestor(c.b, v.b));
  const free = th => {
    const ex = Math.cos(th), ey = Math.sin(th), x = v.cx + ex*v.r, y = v.cy + ey*v.r;
    let near = false;
    for(const c of others) if(Math.hypot(x - c.cx, y - c.cy) < c.r + 2){ near = true; break; }
    return near ? Territory.shellVisible(v, cands, x, y, ex, ey, 1.5) : true;
  };
  const wedge = viewWedge(v.cx, v.cy);
  if(wedge){
    if(v.r < wedge.dmin - 2 || v.r > wedge.dmax + 2) return;      // 泡壁根本不在畫面附近
    // 取樣數依畫面內這段弧的長度決定（約每 6 像素一點）
    arcRuns(v.cx, v.cy, v.r, wedge.a0, wedge.a1, (v.rules && v.rules.length) ? free : () => true, Math.max(24, Math.min(256, Math.ceil(Math.min(v.r*(wedge.a1 - wedge.a0), 4*(S.vw + S.vh))/6))));
    return;
  }
  if(!v.rules || !v.rules.length){ ctx.arc(v.cx, v.cy, v.r, 0, TAU); return; }
  // 一整圈：在每個鄰居覆蓋的角度範圍內加密取樣，避免漏掉小鄰居
  const ang = [];
  for(let k=0;k<96;k++) ang.push(TAU*k/96);
  for(const R of v.rules){
    const o = Territory.otherOf(R, v), dx = o.cx - v.cx, dy = o.cy - v.cy, d = Math.hypot(dx, dy);
    const c = (v.r*v.r + d*d - o.r*o.r)/(2*v.r*d);
    if(c <= -1 || c >= 1) continue;
    const a0 = Math.atan2(dy, dx), half = Math.acos(c);
    for(let k=0;k<=24;k++) ang.push(((a0 - half + 2*half*k/24) % TAU + TAU) % TAU);
  }
  ang.sort((a, b) => a - b);
  const M = ang.length, fr = ang.map(free);
  if(fr.every(Boolean)){ ctx.arc(v.cx, v.cy, v.r, 0, TAU); return; }
  const refine = (a, b) => { for(let i=0;i<16;i++){ const m = (a + b)/2; if(free(m)) a = m; else b = m; } return (a + b)/2; };
  for(let k=0;k<M;k++){
    const kp = (k - 1 + M) % M;
    if(!fr[k] || fr[kp]) continue;
    const st = refine(ang[k], ang[kp] > ang[k] ? ang[kp] - TAU : ang[kp]);
    let j = k; while(fr[(j + 1) % M] && (j + 1) % M !== k) j = (j + 1) % M;
    const jn = (j + 1) % M;
    let en = refine(ang[j], ang[jn] < ang[j] ? ang[jn] + TAU : ang[jn]);
    while(en < st) en += TAU;
    ctx.moveTo(v.cx + Math.cos(st)*v.r, v.cy + Math.sin(st)*v.r);
    ctx.arc(v.cx, v.cy, v.r, st, en);
  }
}

/* 疇壁：Territory 給出可見區段，這裡把它取樣成折線（也保存下來，供淡出時使用） */
export function wallPolylines(R){
  const dw = R.kind === 'wall' ? Territory.domainWall(R, mergeCands(R.W, R.L), viewBox())
                               : Territory.mergeCurve(R, mergeCands(R.A, R.B), viewBox());
  return dw && dw.segs.length ? polysOf(dw) : null;
}

/* 疇壁的可見區段取樣成折線（每段約 6 像素一點） */
export function polysOf(dw){
  const out = [];
  for(const [t0, t1] of dw.segs){
    const p0 = dw.P(t0), pm = dw.P((t0 + t1)/2), p1 = dw.P(t1);
    const len = Math.hypot(pm[0] - p0[0], pm[1] - p0[1]) + Math.hypot(p1[0] - pm[0], p1[1] - pm[1]);
    const K = Math.max(6, Math.min(160, Math.ceil(len/6))), arr = new Float32Array((K + 1)*2);
    for(let i=0;i<=K;i++){ const [x, y] = dw.P(t0 + (t1 - t0)*i/K); arr[2*i] = x; arr[2*i+1] = y; }
    out.push(arr);
  }
  return out;
}
