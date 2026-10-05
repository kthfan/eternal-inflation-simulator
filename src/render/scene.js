/* 繪製｜每格的場景：取出畫面上的泡泡、以 Territory 建立規則、畫背景／網格／漣漪／視界／泡泡內部／泡壁／疇壁／特效。
   只讀取模擬結果，自己不做任何歸屬判斷。 */
import { emit } from '../app/hooks.js';
import { S } from '../app/state.js';
import { K, QL, colSeen, epsOf, isHab, reduceMotion } from '../app/config.js';
import { TAU, hash } from '../core/math.js';
import { Territory } from '../core/territory.js';
import { P, ctx, nebPat, starPat, toS } from './camera.js';

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

export const opt = { grid:true, warp:true, hz:true, q:true, neb:true, stars:true, col:true, flash:true, lbl:true, vig:true };

export let walls = [];

export let AX = 0, AY = 0, RHS = 0, TQ = 0, WX = 0, WY = 0, T_R = 0, PH = 0;

export const warpList = [];

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

export function viewBox(){ return { x0: -40, y0: -40, x1: S.vw + 40, y1: S.vh + 40 }; }

export const viewWedge = (cx, cy) => Territory.boxWedge(cx, cy, viewBox());

/* 放射漸層：小泡泡用真正的放射漸層；巨大泡泡改用沿半徑方向的線性漸層（畫面範圍內兩者幾乎相同，但精度足夠） */
export function radialGrad(cx, cy, r0, r1, stops){
  const css = s => `rgba(${s[1]|0},${s[2]|0},${s[3]|0},${s[4]})`;
  const D = Math.hypot(S.vw/2 - cx, S.vh/2 - cy), diag = Math.hypot(S.vw, S.vh)/2 + 40;
  if(r1 < BIG || D < 1){ const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1); for(const s of stops) g.addColorStop(s[0], css(s)); return g; }
  const nx = (S.vw/2 - cx)/D, ny = (S.vh/2 - cy)/D, da = Math.max(r0, D - diag), db = Math.max(da + 1, D + diag);
  const g = ctx.createLinearGradient(cx + nx*da, cy + ny*da, cx + nx*db, cy + ny*db);
  const at = rho => {
    const f = (rho - r0)/(r1 - r0);
    if(f <= stops[0][0]) return stops[0];
    for(let i=1;i<stops.length;i++) if(f <= stops[i][0]){ const a = stops[i-1], b = stops[i], t = (f - a[0])/((b[0] - a[0]) || 1); return [f, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t, a[3]+(b[3]-a[3])*t, a[4]+(b[4]-a[4])*t]; }
    return stops[stops.length - 1];
  };
  g.addColorStop(0, css(at(da)));
  for(const s of stops){ const u = (r0 + s[0]*(r1 - r0) - da)/(db - da); if(u > 0 && u < 1) g.addColorStop(u, css(s)); }
  g.addColorStop(1, css(at(db)));
  return g;
}

export const C4 = (c, a) => [c[0], c[1], c[2], a];

/* 領域的多邊形：沿射線求邊界。泡泡中心在畫面內時掃一整圈（射線數取 2 的次方，避免取樣點每格漂移）；
   中心在畫面外時只掃過畫面所在的角度範圍，並把多邊形截在畫面附近，所有座標都保持在畫面尺度。 */

export function cellPath(v, cap){
  ctx.beginPath();
  const lim = cap === undefined ? Math.max(.6, v.r) : Math.min(v.r, cap);
  const constrained = v.rules && v.rules.some(R => R.kind === 'merge' || (R.kind === 'wall' && (R.W === v || R.lYield)) || (R.kind === 'inherit' && R.X === v && !R.free));
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

export function warp(x,y){
  let dx = 0, dy = 0;
  if(!opt.warp || K.warp <= 0){ WX = 0; WY = 0; return; }
  for(let i=0;i<warpList.length;i++){
    const w = warpList[i], vx = x-w.sx, vy = y-w.sy, r2 = vx*vx + vy*vy;
    if(r2 > w.o2 || r2 < w.i2) continue;
    const r = Math.sqrt(r2) || 1, d = r - w.sr, f = w.amp*Math.exp(-d*d/(w.ww*w.ww));
    dx += vx/r*f; dy += vy/r*f;
  }
  const hx = x-AX, hy = y-AY, hr = Math.sqrt(hx*hx + hy*hy) || 1, hd = (hr-RHS)/(RHS*.5);
  const sw = Math.exp(-hd*hd)*Math.min(7, RHS*.05)*(.65 + .35*Math.sin(TQ*.9));
  dx += (hx*.8 - hy*.35)/hr*sw; dy += (hy*.8 + hx*.35)/hr*sw;
  if(!reduceMotion){
    dx += 1.8*Math.sin(y*.019 + x*.007 + TQ*1.7);
    dy += 1.8*Math.sin(x*.017 - y*.006 + TQ*1.3);
  }
  WX = dx*K.warp; WY = dy*K.warp;
}

export function v2(n){ if(n === 0) return 6; n = Math.abs(n); let c = 0; while((n & 1) === 0 && c < 6){ n >>= 1; c++; } return c; }

export function drawGrid(ph){
  const sig = K.gridBase*Math.pow(2, ph), step = QL[S.qLevel].step;
  ctx.globalCompositeOperation = 'lighter';
  for(let axis=0; axis<2; axis++){
    const a0 = axis ? AY : AX, len = axis ? S.vw : S.vh, span = axis ? S.vh : S.vw;
    const n0 = Math.floor((-40-a0)/sig), n1 = Math.ceil((span+40-a0)/sig);
    for(let n=n0; n<=n1; n++){
      const w = Math.min(v2(n),5) + ph, al = Math.min(.3, .055*w);
      if(al < .005) continue;
      const p = a0 + n*sig;
      ctx.strokeStyle = `rgba(196,176,255,${al})`;
      ctx.lineWidth = .45 + .16*w;
      ctx.beginPath();
      for(let s=-20, first=true; s<=len+20; s+=step){
        const x = axis ? s : p, y = axis ? p : s;
        warp(x,y);
        if(first){ ctx.moveTo(x+WX, y+WY); first = false; } else ctx.lineTo(x+WX, y+WY);
      }
      ctx.stroke();
    }
  }
}

export function drawRipples(t){
  const dtb = .2, L = 5, m = K.ripples;
  const k0 = Math.max(0, Math.floor((t-L)/dtb)), k1 = Math.floor(t/dtb);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 1.1;
  for(let k=k0;k<=k1;k++) for(let i=0;i<m;i++){
    const tb = (k + hash(k,i,11))*dtb, age = t - tb;
    if(age < 0 || age > L) continue;
    const ang = hash(k,i,12)*TAU, rr = (.12 + .83*Math.sqrt(hash(k,i,13)))*S.RH;
    const E = Math.exp(S.HUB*age), px = Math.cos(ang)*rr*E, py = Math.sin(ang)*rr*E;
    const rad = (3 + hash(k,i,14)*9)*E*S.Z;
    const [sx,sy] = toS(px,py);
    if(sx < -rad || sy < -rad || sx > S.vw+rad || sy > S.vh+rad) continue;
    const out = rr*E > S.RH;
    let a = Math.pow(1-age/L, 1.6)*Math.min(1, age*4)*.55;
    if(!out && !reduceMotion) a *= .6 + .4*Math.sin(age*11 + k);
    const col = out ? '255,212,140' : '255,128,222';
    ctx.strokeStyle = `rgba(${col},${a})`;
    ctx.beginPath(); ctx.arc(sx,sy,Math.max(.8,rad),0,TAU); ctx.stroke();
    ctx.fillStyle = `rgba(${col},${a*.12})`; ctx.fill();
  }
}

export function drawHorizon(){
  ctx.globalCompositeOperation = 'source-over';
  const g = ctx.createRadialGradient(AX,AY,0,AX,AY,RHS);
  g.addColorStop(0,'rgba(255,220,160,.05)'); g.addColorStop(.85,'rgba(255,220,160,.02)'); g.addColorStop(1,'rgba(255,220,160,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(AX,AY,RHS,0,TAU); ctx.fill();
  ctx.setLineDash([5,7]); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(242,196,109,.6)';
  ctx.beginPath(); ctx.arc(AX,AY,RHS,0,TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.font = '500 12px "Noto Serif TC", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(242,210,150,.85)';
  if(RHS > 70) ctx.fillText('哈伯視界', AX, AY - RHS - 6);
  // 觀測者
  ctx.globalCompositeOperation = 'lighter';
  const s = 7;
  ctx.strokeStyle = 'rgba(255,236,190,.9)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(AX-s,AY); ctx.lineTo(AX+s,AY); ctx.moveTo(AX,AY-s); ctx.lineTo(AX,AY+s); ctx.stroke();
  const gg = ctx.createRadialGradient(AX,AY,0,AX,AY,10); gg.addColorStop(0,'rgba(255,240,200,.9)'); gg.addColorStop(1,'rgba(255,240,200,0)');
  ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(AX,AY,10,0,TAU); ctx.fill();
  if(RHS > 70){ ctx.globalCompositeOperation = 'source-over'; ctx.textBaseline = 'top'; ctx.font = '12px "Noto Sans TC", sans-serif'; ctx.fillStyle = 'rgba(242,226,190,.7)'; ctx.fillText('觀測者', AX, AY + 12); }
}

export const rgba = (c,a) => `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;

export const mix = (a,b,t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];

/* 大擠壓：負真空能的宇宙膨脹 → 減速 → 收縮 → 奇點。
   泡泡內部的「同一時刻」在外部座標中是碗狀的雙曲面：離中心 x（以泡壁半徑為 1）處的內部時間約為 τ = 年齡·√(1−x²)。
   所以從外面看，中心最先收縮、最先抵達奇點，熾熱的收縮區與黑色的奇點區由內向外擴散，逼近泡壁卻追不上。 */
/* 熱寂：從外面看同樣由中心向外擴散。x0 之外尚未開始；x0~x1 之間逐漸冷卻變暗；x1 之內已陷入熱寂 */
export function heatGeo(v){
  const T2 = v.b.heatT; if(!isFinite(T2)) return null;
  const A = v.age, T1 = T2*.35;
  if(A <= T1) return null;
  return { x0: Math.sqrt(1 - (T1/A)**2), x1: A > T2 ? Math.sqrt(1 - (T2/A)**2) : 0, prog: Math.min(1, (A - T1)/(T2 - T1)) };
}

export function crunchGeo(v){
  const b = v.b; if(!b.crunch) return null;
  const A = v.age, tc = b.crunchT, tt = tc*.55;
  if(A <= tt) return null;
  return { xt: Math.sqrt(1 - (tt/A)**2), xc: A > tc ? Math.sqrt(1 - (tc/A)**2) : 0, heat: Math.min(1, (A - tt)/(tc - tt)) };
}

export const TEX_VMAX = 30;   // 口袋宇宙內部紋理在畫面上的最大移動速度（像素／秒）

export const texPhase = new Map(), texStepped = new Set();

export const wallFade = new Map();

export let wallFadeLast = performance.now();

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

/* 折線各點的單位法向量（以前後兩點的切線求得） */
export function normalsOf(p){
  if(p._n) return p._n;
  const n = new Float32Array(p.length), last = p.length - 2;
  for(let i=0;i<=last;i+=2){
    const a = Math.max(0, i - 2), b = Math.min(last, i + 2), tx = p[b] - p[a], ty = p[b+1] - p[a+1], l = Math.hypot(tx, ty) || 1;
    n[i] = -ty/l; n[i+1] = tx/l;
  }
  return p._n = n;
}

export function tracePolys(pts, off){
  ctx.beginPath();
  for(const p of pts){
    const n = off ? normalsOf(p) : null;
    for(let i=0;i<p.length;i+=2){
      const x = off ? p[i] + n[i]*off : p[i], y = off ? p[i+1] + n[i+1]*off : p[i+1];
      if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }
}

export const WHITE = [255,255,255];

export function drawWallStyled(f, ph){
  const st = f.style, a = f.a;
  if(st.seam){                                  // 融合處的短暫發光
    tracePolys(f.pts, 0);
    ctx.lineWidth = 14; ctx.strokeStyle = rgba(mix(st.col, WHITE, .3), .22*st.flash); ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = rgba(mix(st.col, WHITE, .6), .5*st.flash); ctx.stroke();
    return;
  }
  const s = st.str, mid = mix(st.colP, st.colM, .5);
  // 光暈（越寬越亮代表能量差越大）
  tracePolys(f.pts, 0);
  ctx.lineWidth = 4 + 9*s; ctx.strokeStyle = rgba(mid, (.07 + .15*s)*a); ctx.stroke();
  // 碰撞瞬間的能量釋放
  if(st.flash > .01){
    ctx.lineWidth = 18; ctx.strokeStyle = rgba(mix(mid, WHITE, .3), .22*st.flash*a); ctx.stroke();
    ctx.lineWidth = 6; ctx.strokeStyle = rgba(mix(mid, WHITE, .65), .5*st.flash*a); ctx.stroke();
  }
  // 推進方向：漣漪從疇壁往輸家那一側推出去，速度隨能量差加快
  if(st.ripple && s > .03){
    const cyc = ph*(.35 + 1.1*s);
    ctx.lineWidth = 1.1;
    for(let k=0;k<3;k++){
      const o = ((cyc + k/3) % 1 + 1) % 1, d = 3 + o*(10 + 14*s), al = Math.pow(1 - o, 1.6)*.42*s*a;
      if(al < .01) continue;
      tracePolys(f.pts, st.sign*d);
      ctx.strokeStyle = rgba(mix(st.sign > 0 ? st.colM : st.colP, WHITE, .5), al); ctx.stroke();
    }
  }
  // 雙色：兩側各描一條自己宇宙顏色的細線
  const w = 1 + .9*s, al = (.5 + .45*s)*a;
  tracePolys(f.pts, 1.3); ctx.lineWidth = w; ctx.strokeStyle = rgba(mix(st.colP, WHITE, .4), al); ctx.stroke();
  tracePolys(f.pts, -1.3); ctx.lineWidth = w; ctx.strokeStyle = rgba(mix(st.colM, WHITE, .4), al); ctx.stroke();
}

/* 清除跨格累積的視覺狀態（紋理相位、疇壁淡入淡出）。重新開始時呼叫；自動化截圖比對前呼叫可讓畫面只取決於時間與攝影機 */
export function resetTemporal(){ texPhase.clear(); S.texLastT = null; wallFade.clear(); }

export function drawBubbles(F){
  /* 星空與能量雲是大面積填色，每格只替有限數量的泡泡繪製（數量由畫質決定）。
     原本是依繪製順序先到先得，泡泡一進出畫面，名額的分界就跳動，造成紋理忽隱忽現。
     現在改成依「在畫面上的可見面積」排序，把名額給最大的泡泡，並讓紋理以約 0.3 秒淡入淡出。 */
  const nowR = performance.now(), fdt = Math.min(.1, (nowR - (drawBubbles.last || nowR))/1000); drawBubbles.last = nowR;
  const texCand = [];
  for(const v of S.vis){
    if(v.sr <= 6) continue;
    const w = Math.min(S.vw, v.sx + v.sr) - Math.max(0, v.sx - v.sr), h = Math.min(S.vh, v.sy + v.sr) - Math.max(0, v.sy - v.sr);
    if(w > 0 && h > 0) texCand.push({ v, area: Math.min(w*h, Math.PI*v.sr*v.sr) });
  }
  texCand.sort((a, b) => b.area - a.area);
  const texOK = new Set(); for(let i=0;i<Math.min(texCand.length, QL[S.qLevel].stars);i++) texOK.add(texCand[i].v);
  for(const v of S.vis){
    const tgt = texOK.has(v) ? 1 : 0, b = v.b;
    if(b._tf === undefined) b._tf = tgt;
    b._tf += (tgt - b._tf)*Math.min(1, fdt*10);
  }
  // 繪製順序：真空能高的先畫、低的後畫（子泡泡能量必定低於母泡泡，所以也一定畫在上層）
  const order = S.vis.slice().sort((a, b) => Territory.drawOrder(F, a, b));
  for(const v of S.vis){ v.cand = null; v.ord = undefined; }
  order.forEach((v, i) => v.ord = i);
  /* 被後面畫的泡泡完全蓋住的，就不必畫內部。
     吞沒觀測者的巨大泡泡會一層層累積且永遠存在，若每層都畫滿整個畫面（漸層、紋理、大擠壓），繪製會越來越慢。 */
  let first = 0;
  for(let i=order.length-1;i>=0;i--){
    const v = order[i]; if(!v.full) continue;
    let all = true;
    for(let gx=0;gx<=15 && all;gx++) for(let gy=0;gy<=9 && all;gy++) if(!Territory.drawContains(v, S.vw*gx/15, S.vh*gy/9)) all = false;
    if(all){ first = i; break; }
  }
  /* 紋理流速上限：紋理以觀測者為中心縮放，畫面上的移動速度 = 縮放率 × 與觀測者的距離。
     泡泡流到遠處、或畫面放大時，距離變大，看起來就越流越快。
     這裡依「各真空在畫面上可見部分離觀測者最遠的距離」限制縮放率，讓任何一點的移動都不超過 TEX_VMAX 像素／秒。
     相位改為逐格累積（暫停時不動、拖曳時間軸時跟著前後移動），所以速率改變時不會跳動。 */
  const dtv = Math.max(-.25, Math.min(.25, T_R - (S.texLastT === null ? T_R : S.texLastT))); S.texLastT = T_R;
  const rhoMax = new Map();
  for(let oi=first; oi<order.length; oi++){
    const v = order[oi], x0 = Math.max(0, v.cx - v.r), x1 = Math.min(S.vw, v.cx + v.r), y0 = Math.max(0, v.cy - v.r), y1 = Math.min(S.vh, v.cy + v.r);
    if(x1 <= x0 || y1 <= y0) continue;
    let m = 0; for(const [x, y] of [[x0,y0],[x1,y0],[x0,y1],[x1,y1]]) m = Math.max(m, Math.hypot(x - AX, y - AY));
    rhoMax.set(v.b.vac, Math.max(rhoMax.get(v.b.vac) || 0, m));
  }
  const texPh = (key, natural, vac, drift = 0) => {      // natural：自然的縮放率（log2／秒）；drift：另外疊加的固定漂移速度
    const vmax = TEX_VMAX - drift, rho = Math.max(60, rhoMax.get(vac) || 60), rate = Math.min(natural, vmax/(Math.LN2*rho));
    S.texSpeedSeen = Math.max(S.texSpeedSeen, Math.LN2*rate*(rhoMax.get(vac) || 0) + drift);
    let ph = texPhase.get(key); if(ph === undefined) ph = 0;
    if(!texStepped.has(key)){ ph += rate*dtv; texPhase.set(key, ph); texStepped.add(key); }
    return ph;
  };
  texStepped.clear();
  for(let oi=first; oi<order.length; oi++){
    const v = order[oi];
    const pal = S.PAL[v.b.vac], sr = Math.max(.6, v.sr), sx = v.sx, sy = v.sy;
    ctx.globalCompositeOperation = 'source-over';
    const s1 = Math.max(0, 1-90/sr), s2 = Math.max(s1, 1-16/sr);
    ctx.fillStyle = radialGrad(sx, sy, 0, sr, [[0, ...C4(pal.core,.985)], [s1, ...C4(mix(pal.core,pal.rim,.3),.98)], [s2, ...C4(pal.rim,.96)], [1, ...C4(pal.wall,.97)]]);
    cellPath(v); ctx.fill();

    const cg = crunchGeo(v), gr = v.grp || v;
    const V = S.U.VAC[v.b.vac];
    /* 泡泡內部的紋理和背景一樣「畫在空間上」：以觀測者為中心、隨哈伯流向外流動（雙層交叉淡入的無限縮放）。
       同種真空的泡泡共用同一片紋理，融合時天衣無縫；流動速度只取決於離觀測者多遠，和泡泡大小無關，也不會突然轉向。 */
    if(V.kind === 'ds' || V.kind === 'up'){
      // 正真空能：內部仍在暴脹，物質被稀釋，看不到星系，只有能量雲（激發態假真空暴脹得比外面還快）
      const tf = v.b._tf;
      if(opt.neb && K.neb > 0 && tf > .01){
        // 能量越高，雲在內部翻湧得越快（固定方向、固定速度的緩慢漂移）
        const sp = 2 + 6*Math.sqrt(V.eps), ang = V.i*2.39996, dx = Math.cos(ang)*sp*T_R, dy = Math.sin(ang)*sp*T_R;
        // 口袋宇宙內部以自己的膨脹率 H√ε 暴脹（比外面的假真空慢），所以雲的流動也較慢
        const uN = texPh('n' + V.i, S.HUB*Math.sqrt(V.eps)/Math.LN2, V.i, sp) + Math.log2(S.Z), phN = uN - Math.floor(uN);
        ctx.globalCompositeOperation = 'lighter';
        for(let k=0;k<2;k++){
          const x = phN + k, w = Math.pow(Math.sin(Math.PI*x/2), 2), scl = 1.25*Math.pow(2, x - 1);
          pal.neb.setTransform(new DOMMatrix().translateSelf(AX + dx, AY + dy).rotateSelf(V.i*47).scaleSelf(scl));
          ctx.globalAlpha = Math.min(1, w*.72*K.neb)*Math.min(1, sr/40)*tf; ctx.fillStyle = pal.neb; cellPath(v); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
    else if(opt.stars && sr > 16 && v.b._tf > .01){
      const a = K.stars*Math.min(1, Math.max(0,(gr.age-.8)/3))*Math.min(1, sr/60)*v.b._tf;
      if(a > .02){
        /* 不再暴脹的宇宙：星系幾乎隨空間靜止，不能像暴脹那樣每 3 秒放大一倍（那會看起來越流越快）。
           只保留非常緩慢的擴張（約 60 秒才放大一倍），所有同種真空共用、與泡泡大小無關、不會跳動 */
        const uS = texPh('s' + V.i, 1/60, V.i) + Math.log2(S.Z), phS = uS - Math.floor(uS);
        ctx.globalCompositeOperation = 'lighter';
        for(let k=0;k<2;k++){
          const x = phS + k, w = Math.pow(Math.sin(Math.PI*x/2), 2), scl = .9*Math.pow(2, x - 1);
          starPat.setTransform(new DOMMatrix().translateSelf(AX, AY).rotateSelf(V.i*47).scaleSelf(scl));
          ctx.globalAlpha = a*Math.min(1, w*1.4); ctx.fillStyle = starPat; cellPath(v); ctx.fill();
        }
        if(cg && cg.xt*sr > 4){
          // 收縮區：星系彼此靠攏（更密）、光被藍移變亮
          for(let k=0;k<2;k++){
            const x = phS + k, w = Math.pow(Math.sin(Math.PI*x/2), 2);
            starPat.setTransform(new DOMMatrix().translateSelf(AX, AY).rotateSelf(V.i*47 + 37).scaleSelf(.45*Math.pow(2, x - 1)));
            ctx.globalAlpha = Math.min(1, a*(.5 + cg.heat)*Math.min(1, w*1.4)); cellPath(v, cg.xt*sr); ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      }
    }
    const hg = heatGeo(v);
    if(hg){
      // 星光逐漸熄滅、星系遠離到視界之外：畫面上變成一片越來越暗、偏紅的空曠
      const { x0, x1, prog } = hg, mid = x1 + (x0 - x1)*.45;
      const hs = [[0, 4,3,9, x1 > 0 ? .93 : .93*prog]];
      if(x1 > 0) hs.push([x1, 4,3,9, .93]);
      hs.push([Math.max(x1, mid), 26,10,16, .55*prog], [Math.max(x1, mid, x0), 30,12,18, 0]);
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = radialGrad(sx, sy, 0, sr, hs); cellPath(v); ctx.fill();
    }
    if(v.age < 3.5 && V.kind !== 'ds' && V.kind !== 'up'){
      const a = Math.pow(1 - v.age/3.5, 2)*.85, rr = Math.max(2, sr);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = radialGrad(sx, sy, 0, rr, [[0, 255,252,240, a], [.5, ...C4(pal.wall, a*.5)], [1, ...C4(pal.wall, 0)]]);
      cellPath(v); ctx.fill();
    }
    if(cg){
      const { xt, xc, heat } = cg, mid = xc + (xt - xc)*.32;
      const hs = [[0, 255,250,242, xc > 0 ? .9 : .9*heat]];
      if(xc > 0) hs.push([xc, 255,250,242, .95]);
      hs.push([Math.max(xc, mid), 160,192,255, .5*heat], [Math.max(xc, mid, xt), 120,150,255, 0]);
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = radialGrad(sx, sy, 0, sr, hs); cellPath(v); ctx.fill();
      if(xc > 0){
        ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000';
        cellPath(v, xc*sr); ctx.fill();
        if(xc*sr > 2){
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = radialGrad(sx, sy, Math.max(0, xc*sr - 6), xc*sr + 3, [[0, 255,248,236, 0], [.62, 255,248,236, .9], [1, 255,248,236, 0]]);
          cellPath(v, xc*sr + 3); ctx.fill();
        }
      }
    }
  }
  // 泡壁（只畫仍面向假真空或母宇宙的部分）與疇壁
  ctx.globalCompositeOperation = 'lighter';
  for(const v of S.vis){
    if(v.full) continue;
    const col = S.PAL[v.b.vac].wall;
    if(v.sr < 1.2){ ctx.fillStyle = rgba(col,.9); ctx.fillRect(v.sx-1,v.sy-1,2,2); }
    else {
      wallPath(v);
      ctx.lineWidth = Math.min(10, 3 + v.sr*.05); ctx.strokeStyle = rgba(col,.12); ctx.stroke();
      ctx.lineWidth = Math.min(2.4, .8 + v.sr*.012); ctx.strokeStyle = rgba(col,.9); ctx.stroke();
    }
    if(opt.flash && v.age < .9){
      const a = Math.pow(1 - v.age/.9, 2), rr = v.sr + 6 + v.age*70;
      const g = ctx.createRadialGradient(v.sx,v.sy,0,v.sx,v.sy,rr);
      g.addColorStop(0, `rgba(255,255,255,${a*.9})`); g.addColorStop(.3, rgba(col,a*.4)); g.addColorStop(1, rgba(col,0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(v.sx,v.sy,rr,0,TAU); ctx.fill();
    }
  }
  /* ---------- 疇壁 ----------
     · 粗細與亮度：反映兩側真空能的差距（差距越大，推進越快、帶的能量越多）
     · 雙色：兩側各描一條自己宇宙顏色的細線
     · 推進方向：一道道漣漪從疇壁向能量較高的一側（正被吞掉的那邊）推出去
     · 碰撞瞬間：相撞後約 3 秒內沿著新生的疇壁發光，再逐漸平息；同種真空融合時，融合處也會短暫發光
     出現時約 0.25 秒淡入；消失時在原處約 0.45 秒淡出 */
  if(opt.col){
    const now = performance.now(), dtr = Math.min(.1, (now - wallFadeLast)/1000); wallFadeLast = now;
    const seen = new Set();
    for(const R of walls){
      const isWall = R.kind === 'wall', A = isWall ? R.W : R.A, Bv = isWall ? R.L : R.B;
      const age = T_R - S.U.collideTime(A.b, Bv.b), flash = age >= 0 && age < 3 ? (1 - age/3)**2 : 0;
      // 融合處的短暫發光（同種真空相撞釋放的能量）
      if(!isWall && flash > .01){
        const sm = Territory.mergeCurve(R, mergeCands(A, Bv), viewBox(), 1.5, true);
        if(sm && sm.segs.length){
          const k = 's' + A.b.id + ':' + Bv.b.id; seen.add(k);
          wallFade.set(k, { a: 1, pts: polysOf(sm), style: { seam: true, col: S.PAL[A.b.vac].wall, flash } });
        }
      }
      const pl = wallPolylines(R); if(!pl) continue;
      const k = R.kind[0] + A.b.id + ':' + Bv.b.id; seen.add(k);
      let f = wallFade.get(k); if(!f){ f = { a: 0 }; wallFade.set(k, f); }
      // 取一個中間點，判斷法向量兩側各顯示誰（決定兩側顏色與哪一側是輸家）
      const cd = mergeCands(A, Bv), p0 = pl[0], nr0 = normalsOf(p0), m = (p0.length >> 2) << 1;
      const mx = p0[m], my = p0[m+1], nx = nr0[m], ny = nr0[m+1];
      const oP = Territory.displayOwner(cd, mx + nx*2.5, my + ny*2.5), oM = Territory.displayOwner(cd, mx - nx*2.5, my - ny*2.5);
      const colP = S.PAL[(oP || A).b.vac].wall, colM = S.PAL[(oM || Bv).b.vac].wall;
      const eP = oP ? epsOf(oP.b) : epsOf(A.b), eM = oM ? epsOf(oM.b) : epsOf(Bv.b);
      const D = Math.abs(eP - eM), str = D/(D + .25);
      f.a = Math.min(1, f.a + dtr/.25);
      f.pts = pl;
      // 輸家（真空能較高）在 + 側時 sign = +1；各段折線的法向量方向一致（同一條曲線依參數方向取樣）
      f.style = { colP, colM, str, sign: eP > eM ? 1 : -1, ripple: D > .02, flash: isWall ? flash : 0 };
    }
    const ph = T_R;
    for(const [k, f] of wallFade){
      if(!seen.has(k)){ f.a -= dtr/.45; if(f.a <= 0){ wallFade.delete(k); continue; } }
      drawWallStyled(f, ph);
    }
  } else wallFade.clear();
  // 不同真空相撞的那一刻：泡壁交點的閃光
  for(const R of walls){
    if(R.kind !== 'wall') continue;
    const A = R.W, B = R.L, x1 = R.g.p1x, y1 = R.g.p1y, x2 = R.g.p2x, y2 = R.g.p2y;
    const ck = A.b.id + ':' + B.b.id;
    if(!colSeen.has(ck)){ colSeen.add(ck); if(colSeen.size > 6000) colSeen.clear(); S.pendingCol.push((x1+x2)/(2*S.vw)*2 - 1); }
    if(!opt.col) continue;
    const cm = mix(S.PAL[A.b.vac].wall, S.PAL[B.b.vac].wall, .5);
    const fs = 6 + Math.min(16, Math.min(A.sr,B.sr)*.08);
    for(const [fx,fy] of [[x1,y1],[x2,y2]]){
      if(fx < -fs || fy < -fs || fx > S.vw+fs || fy > S.vh+fs) continue;
      if(A.rules.some(R2 => { const o = Territory.otherOf(R2, A); return o !== B && Math.hypot(fx - o.cx, fy - o.cy) < o.r - .5; })) continue;
      const g = ctx.createRadialGradient(fx,fy,0,fx,fy,fs);
      g.addColorStop(0,'rgba(255,255,255,.95)'); g.addColorStop(.3, rgba(cm,.5)); g.addColorStop(1, rgba(cm,0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fx,fy,fs,0,TAU); ctx.fill();
    }
  }
  // 標籤與選取
  ctx.globalCompositeOperation = 'source-over';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if(opt.lbl){
    ctx.font = '500 11.5px "Noto Serif TC", serif';
    for(const v of S.vis){
      if(v.sr < K.lblMin) continue;
      const lx = v.sx, ly = v.sy - v.sr*.55;
      if(lx < 0 || ly < 0 || lx > S.vw || ly > S.vh) continue;
      ctx.fillStyle = 'rgba(255,255,255,.72)';
      ctx.fillText(`#${v.b.id}${isHab(v.b) ? ' ✦' : ''}`, lx, ly);
    }
  }
  if(S.selected){
    const v = S.vis.find(o => o.b === S.selected);
    if(v && v.sr < BIG){
      ctx.setLineDash([6,6]); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.arc(v.sx, v.sy, v.sr + 7, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
  }
}

export function render(t){
  ctx.setTransform(S.dpr,0,0,S.dpr,0,0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.fillStyle = '#0c0820'; ctx.fillRect(0,0,S.vw,S.vh);
  [AX,AY] = toS(0,0); RHS = S.RH*S.Z; TQ = t; T_R = t;
  const u = S.HUB*t/Math.LN2 + Math.log2(S.Z), ph = u - Math.floor(u); PH = ph;

  // 假真空：三層無限縮放的能量雲，隨膨脹向外流動
  ctx.globalCompositeOperation = 'lighter';
  if(opt.neb && K.neb > 0) for(let k=0;k<3;k++){
    const x = ph + k, w = Math.pow(Math.sin(Math.PI*x/3), 2), s = 1.7*Math.pow(2, x-1);
    nebPat.setTransform(new DOMMatrix().translateSelf(AX,AY).rotateSelf(x*8).scaleSelf(s));
    ctx.globalAlpha = Math.min(1, w*.52*K.neb); ctx.fillStyle = nebPat; ctx.fillRect(0,0,S.vw,S.vh);
  }
  ctx.globalAlpha = 1;

  const F = collect(t);
  warpList.length = 0;
  for(const v of S.vis){
    if(v.full || v.sr < 5) continue;
    const ww = Math.max(8, Math.min(60, v.sr*.12));
    warpList.push({ sx:v.sx, sy:v.sy, sr:v.sr, ww, amp: Math.min(14, 3 + v.sr*.06),
      i2: Math.max(0, v.sr - 2.5*ww)**2, o2: (v.sr + 3*ww)**2 });
    if(warpList.length > QL[S.qLevel].warp) break;
  }

  if(opt.grid) drawGrid(ph);
  if(opt.q) drawRipples(t);
  if(opt.hz) drawHorizon();
  drawBubbles(F);
  emit('render:world', { ctx, t });

  // 模擬範圍邊緣與暗角
  ctx.globalCompositeOperation = 'source-over';
  const fr = S.RGEN*S.Z;
  const fog = ctx.createRadialGradient(AX,AY,fr*.8,AX,AY,fr*.93);
  fog.addColorStop(0,'rgba(12,8,32,0)'); fog.addColorStop(1,'rgba(12,8,32,1)');
  ctx.fillStyle = fog; ctx.fillRect(0,0,S.vw,S.vh);
  if(opt.vig){
  const vg = ctx.createRadialGradient(S.vw/2,S.vh/2,Math.min(S.vw,S.vh)*.35,S.vw/2,S.vh/2,Math.hypot(S.vw,S.vh)*.6);
  vg.addColorStop(0,'rgba(6,3,18,0)'); vg.addColorStop(1,'rgba(6,3,18,.55)');
  ctx.fillStyle = vg; ctx.fillRect(0,0,S.vw,S.vh);
  }
  emit('render:overlay', { ctx, t });
}
