/* 應用層｜背景運行：離開頁面時以 Web Worker 計時繼續推進模擬與音樂。 */
import { S } from './state.js';
import { stepWorld } from './loop.js';
import { Music } from '../audio/music.js';
import { $, store } from '../ui/dom.js';

/* ---------- 背景運行 ---------- */
export let bgLast = 0, bgInt = null, bgWorker = null, bgWorkerOk = true;
export let bgRun;

export function bgTick(){
  if(!document.hidden) return;
  const now = performance.now(), dtR = Math.min(120, (now - bgLast)/1000);
  bgLast = now;
  if(dtR > 0) stepWorld(dtR, false);
}

// 優先用 Web Worker 計時（背景分頁中不太會被瀏覽器節流），不行就退回 setInterval
export function startBg(){
  bgLast = performance.now();
  if(bgWorkerOk && !bgWorker){
    try {
      const url = URL.createObjectURL(new Blob(['let id=null;onmessage=e=>{clearInterval(id);id=e.data>0?setInterval(()=>postMessage(0),e.data):null;}'], { type:'text/javascript' }));
      bgWorker = new Worker(url);
      bgWorker.onmessage = bgTick;
      bgWorker.onerror = () => { bgWorkerOk = false; bgWorker = null; if(document.hidden && !bgInt) bgInt = setInterval(bgTick, 250); };
    } catch(e){ bgWorkerOk = false; bgWorker = null; }
  }
  if(bgWorker) bgWorker.postMessage(200);
  else if(!bgInt) bgInt = setInterval(bgTick, 250);
}

export function stopBg(){
  if(bgWorker) bgWorker.postMessage(0);
  if(bgInt){ clearInterval(bgInt); bgInt = null; }
}

/* 模組初始化：依原本的執行順序，由 app/main.js 統一呼叫 */
export function init(){
  bgRun = store.get('bg') === '1';
  $('optBg').checked = bgRun;
  $('optBg').addEventListener('change', e => { bgRun = e.target.checked; store.set('bg', bgRun ? '1' : '0'); });
  document.addEventListener('visibilitychange', () => {
    if(document.hidden){
      if(bgRun) startBg(); else Music.suspend();
    } else {
      if(bgInt || bgWorker) bgTick();
      stopBg(); Music.resume();
      S.last = performance.now();
    }
  });
}
