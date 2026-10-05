/* 繪製｜畫布、攝影機（平移 P、縮放 S.Z）、物理座標 ↔ 螢幕座標轉換、各真空的配色與紋理。 */
import { S } from '../app/state.js';
import { QL } from '../app/config.js';
import { hsl2rgb } from '../core/math.js';
import { makeNebula, makeStars } from './textures.js';
import { sizeSpark } from '../ui/timeline.js';

/* ---------- 畫布與相機 ---------- */
export const cv = document.getElementById('sky'), ctx = cv.getContext('2d');

export const MAXZ = 14;

export const P = {x:0, y:0};

export let nebCanvas;

export let nebPat;

export let nebLum;

export function tintedNebula(col){
  const N = nebCanvas.width, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
  for(let i=0;i<nebLum.length;i++){
    const l = Math.pow(nebLum[i], 1.3);
    d[i*4] = col[0]*l*.42 + 4; d[i*4+1] = col[1]*l*.42 + 4; d[i*4+2] = col[2]*l*.42 + 8; d[i*4+3] = 255;
  }
  g.putImageData(img, 0, 0);
  return ctx.createPattern(c, 'repeat');
}

export let starPat;

export function defaultZoom(){ return Math.max(.45, Math.min(1.25, Math.min(S.vw,S.vh)/760)); }

export function clampCam(){
  const hd = Math.hypot(S.vw,S.vh)/2;
  S.minZ = hd/(S.RGEN*.9);
  S.Z = Math.min(MAXZ, Math.max(S.minZ, S.Z));
  const lim = Math.max(0, S.RGEN*.9 - hd/S.Z), m = Math.hypot(P.x,P.y);
  if(m > lim){ const k = lim/(m||1); P.x *= k; P.y *= k; }
}

export function resize(){
  S.dpr = Math.min(window.devicePixelRatio||1, QL[S.qLevel].dpr);
  S.vw = innerWidth; S.vh = innerHeight;
  cv.width = Math.round(S.vw*S.dpr); cv.height = Math.round(S.vh*S.dpr);
  clampCam(); sizeSpark();
}

export function toS(x,y){ return [S.vw/2 + (x-P.x)*S.Z, S.vh/2 + (y-P.y)*S.Z]; }

export function toP(sx,sy){ return [P.x + (sx-S.vw/2)/S.Z, P.y + (sy-S.vh/2)/S.Z]; }

export function zoomAbout(f, sx, sy){
  const [px,py] = toP(sx,sy);
  S.Z = Math.min(MAXZ, Math.max(S.minZ, S.Z*f));
  P.x = px - (sx-S.vw/2)/S.Z; P.y = py - (sy-S.vh/2)/S.Z;
  clampCam();
}

export function animateZoom(f, sx=S.vw/2, sy=S.vh/2){ S.zoomAnim = { rem: Math.log(f), sx, sy }; }

export function stepZoomAnim(){
  if(!S.zoomAnim) return;
  const s = S.zoomAnim.rem * .22;
  zoomAbout(Math.exp(s), S.zoomAnim.sx, S.zoomAnim.sy);
  S.zoomAnim.rem -= s;
  if(Math.abs(S.zoomAnim.rem) < .002) S.zoomAnim = null;
}

/* 每種真空的配色（只屬於畫面，模擬核心只提供色相） */
export function buildPalettes(VAC){
  return VAC.map(V => {
    const wall = hsl2rgb(V.hue, 95, 74);
    return { wall, core: hsl2rgb(V.hue, 70, 9), rim: hsl2rgb(V.hue, 58, 40), neb: V.kind === 'ds' || V.kind === 'up' ? tintedNebula(wall) : null };
  });
}

/* 模組初始化：依原本的執行順序，由 app/main.js 統一呼叫 */
export function init(){
  nebCanvas = makeNebula();
  nebPat = ctx.createPattern(nebCanvas, 'repeat');
  nebLum = (() => {   // 能量雲的亮度分布，用來替每種正真空能的真空染上自己的顏色
  const d = nebCanvas.getContext('2d').getImageData(0, 0, nebCanvas.width, nebCanvas.height).data, out = new Float32Array(d.length/4);
  for(let i=0;i<out.length;i++){ const l = (d[i*4] + d[i*4+1] + d[i*4+2])/3; out[i] = Math.min(1, Math.max(0, (l - 14)/110)); }
  return out;
})();
  starPat = ctx.createPattern(makeStars(), 'repeat');
}
