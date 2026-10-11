/* 繪製｜疇壁：可見區段由 Territory 決定（layout.js 取樣成折線），這裡負責樣式 ——
   · 粗細與亮度：反映兩側真空能的差距（差距越大，推進越快、帶的能量越多）
   · 雙色：兩側各描一條自己宇宙顏色的細線
   · 推進方向：一道道漣漪從疇壁向能量較高的一側（正被吞掉的那邊）推出去
   · 碰撞瞬間：相撞後約 3 秒內沿著新生的疇壁發光，再逐漸平息；同種真空融合時，融合處也會短暫發光；泡壁交點的閃光
   出現時約 0.25 秒淡入；消失時在原處約 0.45 秒淡出 */
import { S } from '../app/state.js';
import { colSeen, epsOf } from '../app/config.js';
import { TAU } from '../core/math.js';
import { Territory } from '../core/territory.js';
import { ctx } from './camera.js';
import { walls, mergeCands, viewBox, wallPolylines, polysOf } from './layout.js';
import { opt, rgba, mix, WHITE } from './style.js';

export const wallFade = new Map();

export let wallFadeLast = performance.now();
export function resetWalls(){ wallFade.clear(); }

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

/* 這一格的疇壁（含淡出中的）與泡壁交點的閃光；T_R 為畫面時刻 */
export function drawWalls(T_R){
  if(opt.col){
    const now = performance.now(), dtr = Math.min(.1, (now - wallFadeLast)/1000); wallFadeLast = now;
    const seen = new Set();
    for(const R of walls){
      const isWall = R.kind === 'wall', A = isWall ? R.W : R.A, Bv = isWall ? R.L : R.B;
      const age = T_R - S.U.contactStart(A.b, Bv.b, T_R), flash = age >= 0 && age < 3 ? (1 - age/3)**2 : 0;
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
  // 不同真空相撞的那一刻：泡壁交點的閃光（也通知音效）
  for(const R of walls){
    if(R.kind !== 'wall' || !(R.g.h > 0)) continue;     // 沒有交點（例如推進前緣還沒碰到、或兩圓同心）就沒有相撞的瞬間
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
}
