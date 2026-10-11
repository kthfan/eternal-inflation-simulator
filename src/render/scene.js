/* 繪製｜每格的場景：背景（backdrop.js）→ 取出畫面上的泡泡與規則（layout.js）→ 泡泡內部、泡壁 → 疇壁（walls.js）→ 標籤 → 霧與暗角。
   只讀取模擬結果，自己不做任何歸屬判斷。 */
import { emit } from '../app/hooks.js';
import { S } from '../app/state.js';
import { K, QL, isHab } from '../app/config.js';
import { TAU } from '../core/math.js';
import { Territory } from '../core/territory.js';
import { ctx, starPat } from './camera.js';
import { collect, cellPath, holeClip, holeOnScreen, wallPath, setDrawn, BIG } from './layout.js';
import { AX, AY, anchors, beginBackdrop, drawNebula, buildWarp, drawAnchored, drawFog } from './backdrop.js';
import { drawWalls, resetWalls } from './walls.js';
import { opt, rgba, mix, C4, radialGrad } from './style.js';

let T_R = 0;   // 這一格畫面的時刻

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

/* 清除跨格累積的視覺狀態（紋理相位、疇壁淡入淡出）。重新開始時呼叫；自動化截圖比對前呼叫可讓畫面只取決於時間與攝影機 */
export function resetTemporal(){ texPhase.clear(); S.texLastT = null; resetWalls(); }

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
    if(all && holeOnScreen(v)) all = false;
    if(all){ first = i; break; }
  }
  setDrawn(order, first);
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
    const clipped = holeClip(v);
    ctx.globalCompositeOperation = 'source-over';
    const s1 = Math.max(0, 1-90/sr), s2 = Math.max(s1, 1-16/sr);
    ctx.fillStyle = radialGrad(sx, sy, 0, sr, [[0, ...C4(pal.core,.985)], [s1, ...C4(mix(pal.core,pal.rim,.3),.98)], [s2, ...C4(pal.rim,.96)], [1, ...C4(pal.wall,.97)]]);
    cellPath(v); ctx.fill();

    const cg = crunchGeo(v), gr = v.grp || v;
    const V = S.U.VAC[v.b.vac];
    /* 泡泡內部的紋理和背景一樣「畫在空間上」：以觀測者為中心、隨哈伯流向外流動（雙層交叉淡入的無限縮放）。
       同種真空的泡泡共用同一片紋理，融合時天衣無縫；流動速度只取決於離觀測者多遠，和泡泡大小無關，也不會突然轉向。 */
    if(V.kind === 'ds' || V.kind === 'up' || V.kind === 'rf'){
      // 正真空能：內部仍在暴脹，物質被稀釋，看不到星系，只有能量雲（激發態假真空暴脹得比外面還快）
      const tf = v.b._tf;
      if(opt.neb && K.neb > 0 && tf > .01){
        // 能量越高，雲在內部翻湧得越快（固定方向、固定速度的緩慢漂移）
        const sp = 2 + 6*Math.sqrt(V.eps), ang = V.i*2.39996, dx = Math.cos(ang)*sp*T_R, dy = Math.sin(ang)*sp*T_R;
        // 口袋宇宙內部以自己的膨脹率 H√ε 暴脹（比外面的假真空慢），所以雲的流動也較慢
        const uN = texPh('n' + V.i, S.HUB*Math.sqrt(V.eps)/Math.LN2, V.i, sp) + Math.log2(S.Z), phN = uN - Math.floor(uN);
        ctx.globalCompositeOperation = 'lighter';
        for(const A of anchors) for(let k=0;k<2;k++){
          const x = phN + k, w = Math.pow(Math.sin(Math.PI*x/2), 2), scl = 1.25*Math.pow(2, x - 1);
          pal.neb.setTransform(new DOMMatrix().translateSelf(A.sx + dx, A.sy + dy).rotateSelf(V.i*47).scaleSelf(scl));
          ctx.globalAlpha = Math.min(1, w*.72*K.neb)*Math.min(1, sr/40)*tf*A.w; ctx.fillStyle = pal.neb; cellPath(v); ctx.fill();
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
        for(const A of anchors) for(let k=0;k<2;k++){
          const x = phS + k, w = Math.pow(Math.sin(Math.PI*x/2), 2), scl = .9*Math.pow(2, x - 1);
          starPat.setTransform(new DOMMatrix().translateSelf(A.sx, A.sy).rotateSelf(V.i*47).scaleSelf(scl));
          ctx.globalAlpha = a*Math.min(1, w*1.4)*A.w; ctx.fillStyle = starPat; cellPath(v); ctx.fill();
        }
        if(cg && cg.xt*sr > 4){
          // 收縮區：星系彼此靠攏（更密）、光被藍移變亮
          for(const A of anchors) for(let k=0;k<2;k++){
            const x = phS + k, w = Math.pow(Math.sin(Math.PI*x/2), 2);
            starPat.setTransform(new DOMMatrix().translateSelf(A.sx, A.sy).rotateSelf(V.i*47 + 37).scaleSelf(.45*Math.pow(2, x - 1)));
            ctx.globalAlpha = Math.min(1, a*(.5 + cg.heat)*Math.min(1, w*1.4))*A.w; cellPath(v, cg.xt*sr); ctx.fill();
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
    if(v.age < 3.5 && V.kind !== 'ds' && V.kind !== 'up' && V.kind !== 'rf'){
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
    if(clipped) ctx.restore();
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
  /* ---------- 疇壁（見 walls.js）---------- */
  drawWalls(T_R);
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
  T_R = t;
  const ph = beginBackdrop(t);
  drawNebula(ph);
  const F = collect(t);
  buildWarp();
  drawAnchored(t, ph);
  drawBubbles(F);
  emit('render:world', { ctx, t });
  drawFog();
  emit('render:overlay', { ctx, t });
}
