/* 繪製｜共用的顯示選項與顏色、漸層小工具。 */
import { S } from '../app/state.js';
import { ctx } from './camera.js';
import { BIG } from './layout.js';

export const opt = { grid:true, warp:true, hz:true, q:true, neb:true, stars:true, col:true, flash:true, lbl:true, vig:true };

export const rgba = (c,a) => `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;

export const mix = (a,b,t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];

export const WHITE = [255,255,255];

export const C4 = (c, a) => [c[0], c[1], c[2], a];

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
