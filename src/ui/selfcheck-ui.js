/* 介面｜自我檢查按鈕：執行核心檢查、畫面相關檢查，以及外掛加入的檢查。 */
import { S } from '../app/state.js';
import { QL } from '../app/config.js';
import { SelfCheck } from '../core/selfcheck.js';
import { createUniverse } from '../core/universe.js';
import { MAXZ, P, buildPalettes, clampCam, defaultZoom } from '../render/camera.js';
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
