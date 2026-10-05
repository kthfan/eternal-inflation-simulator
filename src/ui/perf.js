/* 介面｜效能與資源：畫質、影格率上限、回放保留時間、效能讀數。 */
import { S } from '../app/state.js';
import { QL } from '../app/config.js';
import { Music } from '../audio/music.js';
import { resize } from '../render/camera.js';
import { $, store } from './dom.js';
import { body } from './panels.js';
import { drawSpark, fmt } from './timeline.js';

export const bootAt = performance.now();

export let slowT = 0, fastT = 0, lastDown = -1e9;

export function autoQuality(dtR, now){
  if(S.qMode !== 'auto') return;
  const slow = S.workEma > 14 || S.fpsEma < S.fpsCap*.75;
  const fast = S.workEma < 6 && S.fpsEma > S.fpsCap*.92;
  if(slow){ slowT += dtR; fastT = 0; if(slowT > 2 && S.qLevel > 0){ S.qLevel--; resize(); slowT = 0; lastDown = now; } }
  else if(fast){ fastT += dtR; slowT = 0; if(fastT > 8 && S.qLevel < 2 && now - lastDown > 20000){ S.qLevel++; resize(); fastT = 0; } }
  else { slowT = 0; fastT = 0; }
}

export function updatePerf(){
  if(body.classList.contains('ctl-closed') || body.classList.contains('ui-hidden')) return;
  const mem = performance.memory ? `${(performance.memory.usedJSHeapSize/1048576).toFixed(1)} MB` : '此瀏覽器不提供';
  const estKB = (S.U.hist.length + S.U.longs.length)*0.26 + S.U.buckets.length*0.008;
  $('perf').innerHTML =
    `畫面更新 <b>${S.fpsShown} fps</b>，每格運算 <b>${S.workEma.toFixed(1)} ms</b><br>`+
    `目前畫質 <b>${QL[S.qLevel].name}</b>${S.qMode === 'auto' ? '（自動）' : ''}，解析度 ×${S.dpr.toFixed(1)}<br>`+
    `記憶中的泡泡 <b>${(S.U.hist.length + S.U.longs.length).toLocaleString('zh-TW')}</b> 個（約 ${(estKB/1024).toFixed(1)} MB）<br>`+
    `模擬中 <b>${S.U.live.length}</b> 個，畫面中 <b>${S.vis.length}</b> 個<br>`+
    `可回看 <b>${fmt(S.U.tLive - S.U.tStart)}</b>／保留上限 ${fmt(S.HIST)}<br>`+
    `JS 記憶體 <b>${mem}</b><br>`+
    `已連續運行 <b>${fmt((performance.now() - bootAt)/1000)}</b><br>`+
    `音樂 <b>${Music.on ? `開（${Music.voices} 個發聲中）` : '關'}</b>`;
}

/* 模組初始化：依原本的執行順序，由 app/main.js 統一呼叫 */
export function init(){
  /* ---------- 效能與資源 ---------- */
  $('qSel').addEventListener('change', e => { S.qMode = e.target.value; store.set('q', S.qMode); if(S.qMode !== 'auto'){ S.qLevel = +S.qMode; resize(); } });
  { const q = store.get('q'); if(q && ['auto','0','1','2'].includes(q)){ S.qMode = q; $('qSel').value = q; if(q !== 'auto') S.qLevel = +q; resize(); } }
  $('fpsSel').addEventListener('change', e => { S.fpsCap = +e.target.value; });
  $('histSel').addEventListener('change', e => { S.HIST = +e.target.value; S.U.window = S.HIST; S.U.trim(); drawSpark(); });
}
