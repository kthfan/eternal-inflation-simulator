/* 介面｜自我檢查按鈕：執行核心檢查、畫面相關檢查，以及外掛加入的檢查。 */
import { S } from '../app/state.js';
import { QL } from '../app/config.js';
import { SelfCheck } from '../core/selfcheck.js';
import { createUniverse } from '../core/universe.js';
import { MAXZ, P, buildPalettes, clampCam, defaultZoom, onRebase } from '../render/camera.js';
import { TEX_VMAX, render } from '../render/scene.js';
import { $ } from './dom.js';



/* 外掛可以加入自己的檢查項目（格式同 SelfCheck.tests：{ name, desc, run() → { pass, detail } }） */
export const extraChecks = [];

/* 模組初始化：依原本的執行順序，由 app/main.js 統一呼叫 */
export function init(){
  /* ---------- 自我檢查介面 ---------- */
  $('checkBtn').addEventListener('click', async () => {
    const btn = $('checkBtn'), out = $('checkOut');
    btn.disabled = true; out.innerHTML = '';
    const rows = [...SelfCheck.tests, ...extraChecks, { name: '巨大泡泡繪製', desc: '典型觀測者模式演化 10 分鐘後（觀測者已被半徑上億像素的泡泡吞沒），畫面幾何必須仍在畫面尺度、繪製不得變慢', run(){
      const keep = { U: S.U, PAL: S.PAL, HUB: S.HUB, RH: S.RH, R0: S.R0, RGEN: S.RGEN, Z: S.Z, px: P.x, py: P.y };
      let worst = 0, ms = 0, ok = true, err = '';
      try {
        for(const seed of [23, 777, 4242]){
          const T = createUniverse({ seed, H: .25, RH: 140, R0: 3, RGEN: 3000, typical: true, vacN: 12, crunchP: .25, oddDimP: .15 }, { gamma: 2.5e-6, innerMul: 1, wallK: 1 });
          T.presim(600);
          S.U = T; S.PAL = buildPalettes(T.VAC); S.HUB = T.p.H; S.RH = T.p.RH; S.R0 = T.p.R0; S.RGEN = T.p.RGEN; P.x = 0; P.y = 0; S.Z = defaultZoom();
          for(const zf of [1, .4, 6]){
            S.Z = Math.max(S.minZ, Math.min(MAXZ, defaultZoom()*zf));
            S.maxPathCoord = 0; render(T.tSim);
            const t0 = performance.now(); for(let i=0;i<4;i++) render(T.tSim - i*.5); ms = Math.max(ms, (performance.now() - t0)/4);
            worst = Math.max(worst, S.maxPathCoord);
          }
        }
      } catch(e){ ok = false; err = e.message; }
      S.U = keep.U; S.PAL = keep.PAL; S.HUB = keep.HUB; S.RH = keep.RH; S.R0 = keep.R0; S.RGEN = keep.RGEN; S.Z = keep.Z; P.x = keep.px; P.y = keep.py;
      if(!ok) return { pass: false, detail: '發生錯誤：' + err };
      return { pass: worst < 1e6 && ms < 16, detail: `最大路徑座標 ${Math.round(worst).toLocaleString('zh-TW')} 像素，最慢每格 ${ms.toFixed(1)} 毫秒` };
    }}, { name: '紋理流速上限', desc: `放大到最大並平移到模擬範圍邊緣（離觀測者最遠處）連續播放，口袋宇宙內的能量雲與星空在畫面上的移動速度不得超過每秒 ${TEX_VMAX} 像素`, run(){
      const keep = { Z: S.Z, px: P.x, py: P.y, last: S.texLastT };
      S.texSpeedSeen = 0;
      try {
        for(const zf of [1, 4, 100]){
          S.Z = Math.max(S.minZ, Math.min(MAXZ, defaultZoom()*zf)); P.x = S.RGEN; P.y = 0; clampCam();
          for(let i=0;i<20;i++) render(S.tView + i/30);
        }
      } finally { S.Z = keep.Z; P.x = keep.px; P.y = keep.py; S.texLastT = keep.last; }
      return { pass: S.texSpeedSeen <= TEX_VMAX + .01, detail: `觀測到的最大移動速度 ${S.texSpeedSeen.toFixed(1)} 像素／秒` };
    }}, { name: '重新置中淡入的繪製效能', desc: '焦點跟隨重新置中時，背景（能量雲、網格、漣漪、視界、泡內紋理）在新舊兩個錨點各畫一次並交叉淡入：這段期間每格仍應低於 16 毫秒', run(){
      const keep = S.anchorFade; let ms = 0;
      try {
        S.anchorFade = { x: 1.2*S.RH, y: -.4*S.RH, t: S.tView, t0: performance.now() };
        render(S.tView);
        const t0 = performance.now(); for(let i=0;i<10;i++){ S.anchorFade.t0 = performance.now() - 300; render(S.tView); } ms = (performance.now() - t0)/10;
      } finally { S.anchorFade = keep; }
      return { pass: ms < 16, detail: `淡入期間平均每格 ${ms.toFixed(1)} 毫秒（畫質：${QL[S.qLevel].name}）` };
    }}, { name: '重新置中時畫面連續', desc: '玩家前進觸發焦點跟隨（原點換到新的共動點）的那一格，畫面變化不應明顯大於一般的一格（背景錨點交叉淡入）', run(){
      const keep = { U: S.U, PAL: S.PAL, HUB: S.HUB, RH: S.RH, R0: S.R0, RGEN: S.RGEN, Z: S.Z, px: P.x, py: P.y, fade: S.anchorFade, tv: S.tView };
      const at = [], other = [];
      try {
        const T = createUniverse({ seed: 4242, H: .25, RH: 140, R0: 3, RGEN: 3000, typical: false, vacN: 12, crunchP: .25, oddDimP: .15 }, { gamma: 2.5e-6, innerMul: 1, wallK: 1 });
        T.presim(20); T.on('rebase', onRebase);
        S.U = T; S.PAL = buildPalettes(T.VAC); S.HUB = T.p.H; S.RH = T.p.RH; S.R0 = T.p.R0; S.RGEN = T.p.RGEN; S.Z = defaultZoom(); S.anchorFade = null;
        T.act({ type: 'spawn', x: 0, y: 0, vac: T.VAC.filter(v => v.eps < 1).sort((a, b) => a.eps - b.eps)[0].i, r: 25 }); T.advance(2/30);
        const Pl = T.player; if(!Pl) throw new Error('玩家誕生失敗');
        T.act({ type: 'steer', dx: 0, dy: -1, rT: 25 });
        const g = $('sky').getContext('2d'); let prev = null, rec = T.recenters;
        for(let i=0;i<150;i++){
          T.advance(1/30); S.tView = T.tLive;
          const c = T.circleAt(Pl, S.tView); P.x = c.cx; P.y = c.cy;
          render(S.tView);
          const W = $('sky').width, H = $('sky').height, d = g.getImageData(0, 0, W, H).data;
          if(prev){ let sum = 0, n = 0; for(let k=0;k<d.length;k+=4*53){ sum += Math.abs(d[k] - prev[k]) + Math.abs(d[k+1] - prev[k+1]) + Math.abs(d[k+2] - prev[k+2]); n++; } (T.recenters !== rec ? at : other).push(sum/n); }
          rec = T.recenters; prev = d;
        }
      } catch(e){ return { pass: false, detail: '發生錯誤：' + e.message }; }
      finally { S.U = keep.U; S.PAL = keep.PAL; S.HUB = keep.HUB; S.RH = keep.RH; S.R0 = keep.R0; S.RGEN = keep.RGEN; S.Z = keep.Z; P.x = keep.px; P.y = keep.py; S.anchorFade = keep.fade; S.tView = keep.tv; }
      const med = other.slice().sort((a, b) => a - b)[other.length >> 1] || 1, worst = Math.max(0, ...at);
      return { pass: at.length > 0 && worst < 2.5*med, detail: `重新置中 ${at.length} 次，那一格的畫面變化最大 ${worst.toFixed(1)}（一般一格的中位數 ${med.toFixed(1)}）` };
    }}, { name: '方案 B 的繪製效能', desc: '同一組種子分別以「單一膨脹率」與「各區域各自的膨脹率（方案 B）」演化後繪製。以每格時間的中位數比較（無頭瀏覽器偶爾會有與內容無關的數秒停頓）：預設縮放下方案 B 仍應低於 16 毫秒；縮到最小只列出供參考（方案 B 的口袋內兄弟泡泡較擁擠、疇壁較多）', run(){
      const keep = { U: S.U, PAL: S.PAL, HUB: S.HUB, RH: S.RH, R0: S.R0, RGEN: S.RGEN, Z: S.Z, px: P.x, py: P.y, fade: S.anchorFade, tv: S.tView };
      const ms = { off: [0, 0], on: [0, 0] };
      try {
        for(const [seed, typical, T] of [[4242, false, 120], [99, false, 90], [7, false, 60], [23, true, 30]]) for(const localH of [false, true]){
          const U = createUniverse({ seed, H: .25, RH: 140, R0: 3, RGEN: 3000, typical, localH, vacN: 12, crunchP: .25, oddDimP: .15 }, { gamma: 2.5e-6, innerMul: 1, wallK: 1 });
          U.presim(T);
          S.U = U; S.PAL = buildPalettes(U.VAC); S.HUB = U.p.H; S.RH = U.p.RH; S.R0 = U.p.R0; S.RGEN = U.p.RGEN; S.anchorFade = null; S.tView = U.tSim;
          const k = localH ? 'on' : 'off';
          [defaultZoom(), S.minZ].forEach((z, zi) => {
            S.Z = z; P.x = 0; P.y = 0; clampCam(); render(S.tView);
            const f = []; for(let i=0;i<9;i++){ const t0 = performance.now(); render(S.tView - (i%3)*.03); f.push(performance.now() - t0); }
            ms[k][zi] = Math.max(ms[k][zi], f.sort((a, b) => a - b)[4]);
          });
        }
      } catch(e){ return { pass: false, detail: '發生錯誤：' + e.message }; }
      finally { S.U = keep.U; S.PAL = keep.PAL; S.HUB = keep.HUB; S.RH = keep.RH; S.R0 = keep.R0; S.RGEN = keep.RGEN; S.Z = keep.Z; P.x = keep.px; P.y = keep.py; S.anchorFade = keep.fade; S.tView = keep.tv; }
      const f = a => `預設縮放 ${a[0].toFixed(1)}、縮到最小 ${a[1].toFixed(1)} 毫秒`;
      return { pass: ms.on[0] < 16, detail: `最慢的中位數｜單一膨脹率：${f(ms.off)}；方案 B：${f(ms.on)}` };
    }}, { name: '繪製效能', desc: '目前畫面的單格繪製時間應低於 16 毫秒（每秒 60 格的預算）', run(){
      const t0 = performance.now(); for(let i=0;i<10;i++) render(S.tView); const ms = (performance.now() - t0)/10;
      return { pass: ms < 16, detail: `平均每格 ${ms.toFixed(1)} 毫秒（畫質：${QL[S.qLevel].name}）` };
    }}];
    let passN = 0;
    for(const T of rows){
      const li = document.createElement('li'); li.innerHTML = `<b>${T.name}</b><span>執行中…</span>`; out.appendChild(li);
      await new Promise(r => setTimeout(r, 30));
      let r; try { r = T.run(); } catch(e){ r = { pass: false, detail: '發生錯誤：' + e.message }; }
      if(r.pass) passN++;
      li.className = r.pass ? 'ok' : 'bad';
      li.innerHTML = `<b>${r.pass ? '✓' : '✗'} ${T.name}</b><span>${r.detail}</span><small>${T.desc}</small>`;
    }
    const sum = document.createElement('li'); sum.className = passN === rows.length ? 'ok sum' : 'bad sum';
    sum.innerHTML = `<b>${passN} / ${rows.length} 項通過</b>`; out.appendChild(sum);
    btn.disabled = false;
  });
}
