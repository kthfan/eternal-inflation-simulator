/* 應用程式進入點：各版本（variants/<名稱>/main.js）呼叫 startApp，並傳入自己的外掛。
   初始化順序與重構前的單檔版本完全相同（由 tools 依原始碼順序產生），請勿任意調換。 */
import { S } from './state.js';
import * as hooks from './hooks.js';
import { createApi } from './api.js';
import { init as initCamera } from '../render/camera.js';
import { init as initTimeline } from '../ui/timeline.js';
import { init as initCard } from '../ui/card.js';
import { init as initControls } from '../ui/controls.js';
import { init as initPanels } from '../ui/panels.js';
import { init as initInput } from '../ui/input.js';
import { init as initMusic } from '../audio/music.js';
import { init as initBackground } from './background.js';
import { init as initPerf } from '../ui/perf.js';
import { init as initSelfCheckUI } from '../ui/selfcheck-ui.js';
import { init as initLoop } from './loop.js';

let started = false;
export function startApp({ plugins = [] } = {}){
  if(started) throw new Error('startApp 只能呼叫一次');
  started = true;
  const api = createApi();
  // 外掛先登記（在任何模組初始化之前），才能收到第一個 'universe' 事件
  for(const p of plugins){ try { p.setup && p.setup(api); } catch(e){ console.error(`[plugin ${p.name || '?'}]`, e); } }
  initCamera();   // render/camera
  initTimeline();   // ui/timeline
  initCard();   // ui/card
  initControls();   // ui/controls
  initPanels();   // ui/panels
  initInput();   // ui/input
  initMusic();   // audio/music
  initBackground();   // app/background
  initPerf();   // ui/perf
  initSelfCheckUI();   // ui/selfcheck-ui
  initLoop();   // app/loop
  for(const p of plugins){ try { p.ready && p.ready(api); } catch(e){ console.error(`[plugin ${p.name || '?'}]`, e); } }
  return api;
}
