/* 介面｜泡泡資訊卡：真空、物理常數、命運說明、回到誕生時刻。 */
import { emit } from '../app/hooks.js';
import { S } from '../app/state.js';
import { isHab, tune } from '../app/config.js';
import { P, clampCam, defaultZoom } from '../render/camera.js';
import { crunchGeo, heatGeo, rgba } from '../render/scene.js';
import { $ } from './dom.js';
import { seek } from './timeline.js';

/* 資訊卡 */
export let card;

export function lamStr(V){ return `${V.lsign < 0 ? '−' : '+'}${V.lman.toFixed(1)} × 10<sup>−${V.lexp}</sup>`; }

export function fateText(b, v){
  const V = S.U.VAC[b.vac];
  if(b.s < 0){
    const tc = Math.log(S.RH/(S.RH - b.r0))/S.HUB;
    return `向上穿隧產生的區域：它的真空能比周圍高，泡壁被周圍往內推而收縮，放出的能量歸吃掉它的一方。` +
      (b.r0 < S.RH ? `它會在誕生後約 ${tc.toFixed(1)} 秒縮成一點、消失。` : '它比哈伯半徑還大，收縮追不上空間的膨脹，永遠縮不掉 —— 這正是永恆暴脹的原理。');
  }
  if(V.dims !== 3) return `這裡的空間有 ${V.dims} 個維度。行星軌道與原子都難以穩定，我們熟悉的化學不會出現。`;
  if(b.crunch){
    const cg = v && crunchGeo(v);
    if(cg && cg.xc > 0) return '真空能為負，這個宇宙已走到大擠壓。從外面看，奇點區從中心向泡壁擴散；對裡面的居民而言，整個宇宙是在同一刻結束的。泡壁本身不受影響，仍照常擴張。';
    if(cg) return '真空能為負，膨脹已經反轉。空間正在收縮，星系彼此靠攏，光被壓縮得越來越藍、越來越熱。';
    return `真空能為負。它目前仍在膨脹，但終將反轉，約在誕生後 ${V.crunchT.toFixed(1)} 秒走到大擠壓（|Λ| 越大越快）。`;
  }
  if(V.kind === 'tiny'){
    const hg = v && heatGeo(v);
    if(hg && hg.x1 > 0) return '這個宇宙已走入熱寂：恆星燃盡、黑洞蒸發，加速膨脹把其他星系推到視界之外。從外面看，熱寂區從中心向泡壁擴散；它不是結束，而是無限漫長地趨近於什麼都不發生。';
    if(hg) return '這個宇宙正在冷卻：恆星一顆顆熄滅，星系彼此遠離，光越來越暗、越來越紅。';
    return isHab(b) ? '真空能幾乎為零，物理常數也落在能形成原子、恆星與長壽星系的範圍。人擇原理說，也許有人正在這裡仰望星空。它已不再暴脹，終將走向熱寂。'
      : '真空能幾乎為零，已經不再暴脹，不會再生出新的口袋宇宙；但常數組合不太適合孕育複雜結構。它終將走向熱寂。';
  }
  return '真空能為正，內部仍在暴脹，會繼續穿隧出能量更低的下一層口袋宇宙。';
}

export function openCard(b){
  S.selected = b;
  const pal = S.PAL[b.vac];
  $('cSw').style.background = `radial-gradient(circle, ${rgba(pal.core,1)} 45%, ${rgba(pal.rim,1)} 80%, ${rgba(pal.wall,1)} 100%)`;
  $('cTitle').textContent = `口袋宇宙 #${b.id}・${S.U.VAC[b.vac].name}`;
  card.hidden = false;
  updateCard();
  emit('select', b);
}

export function updateCard(){
  if(!S.selected || card.hidden) return;
  const b = S.selected, v = S.vis.find(o => o.b === b);
  let state;
  if(S.tView < b.tn) state = `<dt>狀態</dt><dd>尚未誕生（${(b.tn - S.tView).toFixed(1)} 秒後）</dd>`;
  else if(S.tView >= b.texit) state = `<dt>狀態</dt><dd>已流出觀測範圍</dd>`;
  else {
    const E = S.U.E(b, S.tView), r = S.U.circleAt(b, S.tView).r;
    state = `<dt>年齡</dt><dd>${(S.tView-b.tn).toFixed(1)} s</dd><dt>物理半徑</dt><dd>${(r/S.RH).toFixed(2)} R<sub>H</sub></dd><dt>與觀測者距離</dt><dd>${(b.d*E/S.RH).toFixed(2)} R<sub>H</sub></dd>`;
  }
  $('cFate').textContent = fateText(b, v);
  const gone = b.tn < S.U.tStart;
  $('cJump').disabled = gone;
  $('cJump').textContent = gone ? '誕生時刻已超出回放保留範圍' : '回到它誕生的時刻';
  const V = S.U.VAC[b.vac];
  const origin = (b.parent ? `第 ${b.depth + 1} 層，誕生於 #${b.parent.id}（${S.U.VAC[b.parent.vac].name}）內部` : '第 1 層，誕生於暴脹假真空') + (b.act ? '（由使用者放置）' : '');
  const fate = b.s < 0 ? `<dt>塌縮時間</dt><dd>${b.r0 < S.RH ? `誕生後 ${(Math.log(S.RH/(S.RH - b.r0))/S.HUB).toFixed(1)} s` : '永遠縮不掉'}</dd>`
    : V.kind === 'ads' ? `<dt>大擠壓時間</dt><dd>誕生後 ${V.crunchT.toFixed(1)} s</dd>`
    : V.kind === 'tiny' ? `<dt>熱寂時間</dt><dd>誕生後 ${V.hdT.toFixed(0)} s</dd>` : `<dt>內部穿隧率</dt><dd>${(V.grel*tune.innerMul).toFixed(2)} Γ</dd>`;
  $('cList').innerHTML =
    `<dt>來源</dt><dd>${origin}</dd>` +
    `<dt>誕生時刻</dt><dd>t = ${b.tn.toFixed(1)} s（N = ${(S.HUB*b.tn).toFixed(2)}）</dd>` + state +
    `<dt>真空能量密度 Λ</dt><dd>${lamStr(V)}</dd>` + fate +
    `<dt>空間維度</dt><dd>${V.dims}</dd>` +
    `<dt>精細結構常數</dt><dd>1 / ${V.ainv.toFixed(1)}</dd>` +
    `<dt>質子／電子質量比</dt><dd>${Math.round(V.mratio).toLocaleString('zh-TW')}</dd>`;
}

/* 模組初始化：依原本的執行順序，由 app/main.js 統一呼叫 */
export function init(){
  card = $('card');
  $('cClose').addEventListener('click', () => { card.hidden = true; S.selected = null; emit('select', null); });
  $('cJump').addEventListener('click', () => {
    if(!S.selected || S.selected.tn < S.U.tStart) return;
    const t0 = Math.max(S.U.tStart, S.selected.tn - 1.2);
    seek(t0); S.playing = true;
    const E = Math.exp(S.HUB*(t0 - S.selected.tn));
    S.Z = Math.max(S.Z, 1.4*defaultZoom());
    P.x = S.selected.x*E; P.y = S.selected.y*E; clampCam();
  });
}
