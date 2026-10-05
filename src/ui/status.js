/* 介面｜左上統計與觀測者狀態（含走到大擠壓／熱寂時的提示橫幅）。 */
import { S } from '../app/state.js';
import { updateLandCounts } from './controls.js';
import { $ } from './dom.js';
import { body } from './panels.js';

export let fvEma = 1;

export function updateStats(){
  const N = S.HUB*S.tView, lg = N/Math.LN10;
  $('sT').textContent = S.tView.toFixed(1) + ' s';
  $('sN').textContent = N.toFixed(2);
  $('sA').innerHTML = lg < 1 ? Math.exp(N).toFixed(2) : `10<sup>${lg.toFixed(2)}</sup>`;
  $('sB').textContent = S.U.born(S.tView).toLocaleString('zh-TW');
  let fv = 0; const NS = 150;
  for(let i=0;i<NS;i++){
    const x = Math.random()*S.vw, y = Math.random()*S.vh; let inb = false;
    for(const v of S.vis){ const dx = x-v.sx, dy = y-v.sy; if(dx*dx + dy*dy < v.sr*v.sr){ inb = true; break; } }
    if(!inb) fv++;
  }
  fvEma = fvEma*.6 + (fv/NS)*.4;
  $('sF').textContent = Math.round(fvEma*100) + '%';
  updateObserver();
  updateLandCounts();
}

/* 觀測者狀態：走到終點（大擠壓或熱寂）時提示可以換個種子重新開始 */
export let obsCrunchShown = false;

export function updateObserver(){
  const st = S.U.observer(S.tView);
  const el = $('sO');
  if(st.kind === 'false') el.textContent = '假真空（暴脹中）';
  else if(st.kind === 'crunch') el.textContent = `#${st.b.id} 大擠壓`;
  else if(st.kind === 'heat') el.textContent = `#${st.b.id} 熱寂`;
  else el.textContent = `#${st.b.id} ${st.V.name}`;
  const ended = st.kind === 'crunch' || st.kind === 'heat';
  $('reseedBtn').hidden = !ended;
  const key = ended ? st.kind + st.b.id : '';
  if(ended && key !== S.obsEndKey && !body.classList.contains('ui-hidden')){
    const name = `#${st.b.id}（${S.U.VAC[st.b.vac].name}）`;
    $('bannerTxt').textContent = st.kind === 'crunch'
      ? `觀測者所在的口袋宇宙 ${name}已走到大擠壓，這條世界線在此終結。模擬仍在繼續：其他地方的暴脹不受影響，你可以回看它是怎麼被吞沒的，或換個種子，看看另一個宇宙的命運。`
      : `觀測者所在的口袋宇宙 ${name}已走入熱寂：恆星燃盡、星系遠離到視界之外，只剩下越來越冷、越來越空的空間。它會一直這樣下去，除非被鄰近宇宙的疇壁吞沒。你可以繼續觀看，或換個種子，看看另一個宇宙的命運。`;
    $('banner').hidden = false;
  }
  S.obsEndKey = key;
}
