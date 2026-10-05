/* 應用層｜主迴圈與啟動：推進模擬（stepWorld）、每格繪製與介面更新。 */
import { emit } from './hooks.js';
import { S } from './state.js';
import { Music, musicEvents } from '../audio/music.js';
import { clampCam, defaultZoom, resize, stepZoomAnim } from '../render/camera.js';
import { collect, render } from '../render/scene.js';
import { updateCard } from '../ui/card.js';
import { restart } from '../ui/controls.js';
import { autoQuality, updatePerf } from '../ui/perf.js';
import { updateStats } from '../ui/status.js';
import { drawSpark, goLive, updateTimeline } from '../ui/timeline.js';

export let uiT = 0, spT = 0, pfT = 0;

// 推進模擬一步；draw 為 false 時（背景運行）只計算不繪製
export function stepWorld(dtR, draw){
  const dt = dtR*S.speed;
  S.U.advance(dt);
  emit('frame', { dtR, dt, draw });
  if(S.isLive) S.tView = S.U.tLive;
  else if(S.playing && !S.scrubbing){ S.tView += dt; if(S.tView >= S.U.tLive){ goLive(); } }
  S.pendingCol = [];
  if(draw){ stepZoomAnim(); render(S.tView); }
  else if(Music.on) collect(S.tView);
  if(Music.on){
    if(S.tView > S.prevT && S.tView - S.prevT < Math.max(.5, dt*1.2)) musicEvents(S.prevT, S.tView);
    Music.tick(dtR, S.HUB*S.tView/Math.LN2/4);
  }
  S.prevT = S.tView;
}

export function frame(now){
  requestAnimationFrame(frame);
  if(document.hidden) return;
  if(now - S.last < 1000/S.fpsCap - 2) return;          // 影格率上限
  const dtR = Math.min(.1, (now - S.last)/1000); S.last = now;
  const w0 = performance.now();
  stepWorld(dtR, true);
  updateTimeline();
  uiT += dtR; if(uiT > .2){ uiT = 0; updateStats(); updateCard(); }
  spT += dtR; if(spT > .5){ spT = 0; drawSpark(); }
  const work = performance.now() - w0;
  S.workEma += (work - S.workEma)*.08;
  S.fpsEma += (1/Math.max(dtR, 1e-3) - S.fpsEma)*.05;
  S.frames++; S.fpsClock += dtR; if(S.fpsClock >= 1){ S.fpsShown = Math.round(S.frames/S.fpsClock); S.frames = 0; S.fpsClock = 0; }
  autoQuality(dtR, now);
  pfT += dtR; if(pfT > 1){ pfT = 0; updatePerf(); }
}

/* 模組初始化：依原本的執行順序，由 app/main.js 統一呼叫 */
export function init(){
  /* ---------- 啟動 ---------- */
  resize();
  S.Z = defaultZoom();
  clampCam();
  restart();
  drawSpark();
  S.prevT = S.tView;
  requestAnimationFrame(frame);
}
