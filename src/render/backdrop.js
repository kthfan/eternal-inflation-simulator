/* 繪製｜背景：假真空的能量雲、時空網格與扭曲、量子漣漪、哈伯視界、模擬範圍邊緣的霧。
   都以原點（觀測者／焦點）為中心縮放流動；焦點跟隨重新置中時在新舊錨點之間交叉淡入。 */
import { S } from '../app/state.js';
import { K, QL, reduceMotion } from '../app/config.js';
import { TAU, hash } from '../core/math.js';
import { ctx, nebPat, toS } from './camera.js';
import { opt } from './style.js';

export let AX = 0, AY = 0, RHS = 0, TQ = 0, WX = 0, WY = 0;

/* 背景的錨點：能量雲、網格、量子漣漪、哈伯視界、泡內紋理都以原點（觀測者／焦點）為中心縮放流動。
   焦點跟隨重新置中時（核心的 'rebase'），原點換到新的共動點：舊錨點在 0.6 秒內淡出、新錨點淡入，畫面不會跳動。
   AW 為目前繪製中的錨點權重。 */
export let AW = 1, anchors = [];
export function anchorList(t){
  const [ax, ay] = toS(0, 0), out = [{ sx: ax, sy: ay, w: 1 }], F = S.anchorFade;
  if(!F) return out;
  const f = (performance.now() - F.t0)/600;
  if(f >= 1 || f < 0){ S.anchorFade = null; return out; }
  const e = Math.exp(S.HUB*(t - F.t)), [ox, oy] = toS(F.x*e, F.y*e), s = f*f*(3 - 2*f);
  out[0].w = s; out.push({ sx: ox, sy: oy, w: 1 - s });
  return out;
}

export const warpList = [];

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
      const w = Math.min(v2(n),5) + ph, al = Math.min(.3, .055*w)*AW;
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
    const sx = AX + px*S.Z, sy = AY + py*S.Z;      // 相對目前的錨點
    if(sx < -rad || sy < -rad || sx > S.vw+rad || sy > S.vh+rad) continue;
    const out = rr*E > S.RH;
    let a = Math.pow(1-age/L, 1.6)*Math.min(1, age*4)*.55*AW;
    if(!out && !reduceMotion) a *= .6 + .4*Math.sin(age*11 + k);
    const col = out ? '255,212,140' : '255,128,222';
    ctx.strokeStyle = `rgba(${col},${a})`;
    ctx.beginPath(); ctx.arc(sx,sy,Math.max(.8,rad),0,TAU); ctx.stroke();
    ctx.fillStyle = `rgba(${col},${a*.12})`; ctx.fill();
  }
}

export function drawHorizon(){
  ctx.save(); ctx.globalAlpha = AW;
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
  ctx.restore();
}

/* 每格開頭：錨點、視界半徑、時間；回傳能量雲的縮放相位 */
export function beginBackdrop(t){
  [AX,AY] = toS(0,0); RHS = S.RH*S.Z; TQ = t;
  anchors = anchorList(t);
  const u = S.HUB*t/Math.LN2 + Math.log2(S.Z);
  return u - Math.floor(u);
}
/* 假真空：三層無限縮放的能量雲，隨膨脹向外流動 */
export function drawNebula(ph){
  ctx.globalCompositeOperation = 'lighter';
  if(opt.neb && K.neb > 0) for(const A of anchors) for(let k=0;k<3;k++){
    const x = ph + k, w = Math.pow(Math.sin(Math.PI*x/3), 2), s = 1.7*Math.pow(2, x-1);
    nebPat.setTransform(new DOMMatrix().translateSelf(A.sx,A.sy).rotateSelf(x*8).scaleSelf(s));
    ctx.globalAlpha = Math.min(1, w*.52*K.neb)*A.w; ctx.fillStyle = nebPat; ctx.fillRect(0,0,S.vw,S.vh);
  }
  ctx.globalAlpha = 1;
}
/* 泡泡周圍的空間扭曲（網格用） */
export function buildWarp(){
  warpList.length = 0;
  for(const v of S.vis){
    if(v.full || v.sr < 5) continue;
    const ww = Math.max(8, Math.min(60, v.sr*.12));
    warpList.push({ sx:v.sx, sy:v.sy, sr:v.sr, ww, amp: Math.min(14, 3 + v.sr*.06),
      i2: Math.max(0, v.sr - 2.5*ww)**2, o2: (v.sr + 3*ww)**2 });
    if(warpList.length > QL[S.qLevel].warp) break;
  }
}
/* 網格、漣漪、視界：每個錨點各畫一次（交叉淡入） */
export function drawAnchored(t, ph){
  const keep = [AX, AY];
  for(const A of anchors){
    AX = A.sx; AY = A.sy; AW = A.w;
    if(opt.grid) drawGrid(ph);
    if(opt.q) drawRipples(t);
    if(opt.hz) drawHorizon();
  }
  [AX, AY] = keep; AW = 1;
}
/* 模擬範圍邊緣的霧與暗角 */
export function drawFog(){
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
}
