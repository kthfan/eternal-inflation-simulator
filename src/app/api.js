/* 外掛 API：外掛透過這個物件與模擬器互動，不直接 import 內部模組。
   只要這裡的介面不變，核心內部怎麼重構都不會弄壞外掛。新增功能時請優先擴充這裡。 */
import { S } from './state.js';
import { on, emit, emitUntil } from './hooks.js';
import { Territory } from '../core/territory.js';
import { createUniverse, STEP } from '../core/universe.js';
import { mulberry32, hsl2rgb, TAU } from '../core/math.js';
import { SelfCheck } from '../core/selfcheck.js';
import { P, cv, ctx, toS, toP, clampCam, defaultZoom, zoomAbout, animateZoom, MAXZ } from '../render/camera.js';
import { render, rgba, mix, opt as renderOpt, resetTemporal } from '../render/scene.js';
import { K, tune } from './config.js';
import { $, store } from '../ui/dom.js';
import { seek, goLive, togglePlay } from '../ui/timeline.js';
import { restart } from '../ui/controls.js';
import { openCard } from '../ui/card.js';
import { extraChecks } from '../ui/selfcheck-ui.js';

export function createApi(){
  return {
    version: 1,
    // 事件
    on, emit, emitUntil,
    // 狀態（唯讀為主；直接改 S 的欄位請小心）
    S,
    get U(){ return S.U; },
    get tView(){ return S.tView; },
    tune, K, renderOpt,
    // 核心
    Territory, createUniverse, STEP, mulberry32, hsl2rgb, TAU, SelfCheck,
    // 攝影機與座標（物理座標 ↔ 螢幕座標）
    camera: {
      P, cv, get Z(){ return S.Z; }, MAXZ,
      toScreen: toS, toPhysical: toP,
      set(x, y, Z){ if(x !== undefined) P.x = x; if(y !== undefined) P.y = y; if(Z !== undefined) S.Z = Z; clampCam(); },
      zoomAbout, animateZoom, defaultZoom, clamp: clampCam,
    },
    // 繪製
    ctx, render, rgba, mix, resetTemporal,
    // 時間軸
    time: { seek, goLive, togglePlay },
    restart, openCard,
    // 介面
    $, store,
    /* 在設定面板加入一個可摺疊區塊，回傳內容容器 */
    addPanel({ title, html = '', open = false }){
      const d = document.createElement('details'); if(open) d.open = true;
      d.innerHTML = `<summary>${title}</summary><div class="plugin-panel">${html}</div>`;
      const anchor = [...document.querySelectorAll('#controls > details')].pop();
      document.getElementById('controls').insertBefore(d, anchor || null);
      return d.querySelector('.plugin-panel');
    },
    /* 加入自我檢查項目 */
    addCheck(test){ extraChecks.push(test); },
  };
}
