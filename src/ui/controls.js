/* 介面｜設定面板：顯示開關、即時參數、宇宙參數、種子、真空地景、重新開始（restart 會建立新的宇宙實例）。 */
import { emit } from '../app/hooks.js';
import { S } from '../app/state.js';
import { K, colSeen, isHab, tune } from '../app/config.js';
import { createUniverse } from '../core/universe.js';
import { P, animateZoom, buildPalettes, clampCam, defaultZoom, onRebase } from '../render/camera.js';
import { opt, resetTemporal, rgba } from '../render/scene.js';
import { card } from './card.js';
import { $ } from './dom.js';
import { drawSpark } from './timeline.js';

/* 控制面板 */
export const OPT_IDS = { optGrid:'grid', optWarp:'warp', optHz:'hz', optQ:'q', optNeb:'neb', optStars:'stars', optCol:'col', optFlash:'flash', optLbl:'lbl', optVig:'vig' };

export const LIVE_P = [
  { id:'gamma', label:'穿隧成核率 Γ', min:.5, max:8, step:.1, def:2.5, fmt:v => `${v.toFixed(1)} × 10⁻⁶`, set:v => tune.gamma = v*1e-6,
    note:'每單位體積、單位時間發生量子穿隧的機率。Γ 越小，泡泡越難填滿假真空，暴脹越「永恆」。' },
  { id:'innerMul', label:'口袋宇宙內部穿隧倍率', min:0, max:3, step:.05, def:1, fmt:v => `${v.toFixed(2)}×`, set:v => tune.innerMul = v,
    note:'正真空能的口袋宇宙內部，穿隧出下一層泡泡的速率倍數。設為 0 就不會產生巢狀泡泡。' },
  { id:'wallK', label:'疇壁速度倍率', min:0, max:2, step:.05, def:1, fmt:v => `${v.toFixed(2)}×`, set:v => tune.wallK = v,
    note:'不同真空之間的疇壁被能量差推動的速度。設為 0 時疇壁停在相撞的位置。' },
  { id:'habTol', label:'宜居容許範圍', min:5, max:80, step:1, def:30, fmt:v => `1/α 在 137 ± ${v}`, set:v => K.habTol = v,
    note:'精細結構常數要多接近我們的宇宙，才標記為可能宜居（✦）。' },
  { id:'gridBase', label:'網格密度', min:14, max:60, step:1, def:26, fmt:v => `${v} px`, set:v => K.gridBase = v,
    note:'最細一層網格的螢幕間距。數字越小網格越密。' },
  { id:'warp', label:'扭曲強度', min:0, max:3, step:.05, def:1, fmt:v => `${v.toFixed(2)}×`, set:v => K.warp = v,
    note:'泡壁張力、哈伯視界與量子抖動讓網格彎曲的程度。' },
  { id:'neb', label:'能量雲亮度', min:0, max:1.8, step:.05, def:1, fmt:v => `${v.toFixed(2)}×`, set:v => K.neb = v,
    note:'代表假真空能量密度的背景雲。' },
  { id:'ripples', label:'量子漲落密度', min:0, max:8, step:1, def:2, fmt:v => `${v * 5} 個／秒`, set:v => K.ripples = v,
    note:'哈伯視界內每秒出現的漲落數量。' },
  { id:'stars', label:'泡內星光', min:0, max:1.5, step:.05, def:1, fmt:v => `${v.toFixed(2)}×`, set:v => K.stars = v,
    note:'口袋宇宙冷卻後浮現的星系與恆星亮度。' },
  { id:'lblMin', label:'編號顯示門檻', min:10, max:160, step:2, def:38, fmt:v => `半徑 > ${v} px`, set:v => K.lblMin = v,
    note:'泡泡在螢幕上大於這個半徑才會標上編號。' },
];

export const UNI_P = [
  { id:'hub', label:'哈伯參數 H', min:.08, max:.7, step:.01, def:.25, fmt:v => `${v.toFixed(2)} / 秒`,
    note:'每秒膨脹的 e-fold 數，也就是暴脹的速率。' },
  { id:'rh', label:'哈伯半徑 R<sub>H</sub>', min:50, max:280, step:5, def:140, fmt:v => `${v} px`,
    note:'等於 c / H。決定視界大小，也決定泡壁擴張的光速 c。' },
  { id:'r0', label:'泡泡初始半徑', min:1, max:30, step:1, def:3, fmt:v => `${v} px`,
    note:'穿隧剛完成時，真真空泡泡的大小。' },
  { id:'rgen', label:'模擬範圍', min:1500, max:6000, step:100, def:3000, fmt:v => `${v} px`,
    note:'離觀測者多遠以內會產生泡泡。越大可縮得越遠，但也越吃效能。' },
  { id:'vacN', label:'真空種類數', min:4, max:16, step:1, def:12, fmt:v => `${v} 種`,
    note:'這個宇宙的地景裡有多少種可能的真空。種類越少，同種真空相遇融合的機會越多。' },
  { id:'crunchP', label:'負真空能比例', min:0, max:.6, step:.01, def:.25, fmt:v => `${Math.round(v*100)}%`,
    note:'地景中真空能為負、終將走向大擠壓的真空所佔比例。' },
  { id:'oddDimP', label:'異常維度比例', min:0, max:.6, step:.01, def:.15, fmt:v => `${Math.round(v*100)}%`,
    note:'空間維度不是 3 的真空所佔比例。' },
  { id:'presim', label:'預先演化時間', min:0, max:60, step:1, def:18, fmt:v => `${v} 秒`,
    note:'重新開始時先在背景跑多久，讓畫面一開始就有泡泡與可回看的歷史。' },
];

export const uniVal = {};

export function buildSliders(host, list, onInput){
  for(const p of list){
    const w = document.createElement('div'); w.className = 'sl';
    w.innerHTML = `<label for="p_${p.id}"><span>${p.label}</span><output id="o_${p.id}"></output></label>`+
      `<input type="range" id="p_${p.id}" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.def}">`+
      (p.note ? `<p class="note">${p.note}</p>` : '');
    host.appendChild(w);
    const inp = w.querySelector('input'), out = w.querySelector('output');
    const upd = () => { const v = parseFloat(inp.value); out.textContent = p.fmt(v); onInput(p, v); };
    inp.addEventListener('input', upd);
    p.el = inp; p.upd = upd; upd();
  }
}

export let uniReady = false;

export function refreshDerived(){
  const h = uniVal.hub, rh = uniVal.rh;
  const q = S.U ? S.U.p : {};
  const dirty = !S.U || h !== q.H || rh !== q.RH || uniVal.r0 !== q.R0 || uniVal.rgen !== q.RGEN || uniVal.presim !== S.PRESIM ||
    uniVal.vacN !== q.vacN || uniVal.crunchP !== q.crunchP || uniVal.oddDimP !== q.oddDimP ||
    parseSeed($('seedIn').value) !== q.seed || ($('obsSel').value === 'typical') !== q.typical || ($('localHSel').value === '1') !== !!q.localH;
  $('derived').innerHTML =
    `泡壁速度 c = H·R<sub>H</sub> = <b>${(h*rh).toFixed(1)} px/s</b><br>`+
    `空間倍增時間 ln2 / H = <b>${(Math.LN2/h).toFixed(2)} 秒</b><br>`+
    `每分鐘膨脹 <b>10<sup>${(h*60/Math.LN10).toFixed(1)}</sup></b> 倍`;
  $('applyBtn').classList.toggle('dirty', dirty);
  $('applyBtn').textContent = dirty ? '套用並重新開始（有未套用的變更）' : '套用並重新開始';
}

export function parseSeed(str){
  str = String(str || '').trim();
  if(/^\d{1,10}$/.test(str)) return Number(str) >>> 0;
  let h = 2166136261; for(const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function landHTML(){
  return S.U.VAC.map(V => {
    const p = S.PAL[V.i];
    const tag = V.kind === 'up' ? '比假真空更高，只能由向上穿隧產生，會被周圍吃掉' : V.kind === 'rf' ? '與假真空相同，只能由玩家的再循環產生，重新開始永恆暴脹' : V.kind === 'ads' ? `Λ<0，${V.crunchT.toFixed(1)} s 後大擠壓` : V.kind === 'tiny' ? `Λ≈0，不再暴脹，${V.hdT.toFixed(0)} s 後熱寂` : `Λ>0，仍在暴脹，內部穿隧 ${V.grel.toFixed(2)}Γ`;
    const hab = isHab({ vac: V.i }) ? ' ✦' : '';
    return `<div class="vr"><i style="background:radial-gradient(circle,${rgba(p.core,1)} 40%,${rgba(p.rim,1)} 75%,${rgba(p.wall,1)} 100%)"></i>`+
      `<span><b>${V.name}${hab}</b>　${tag}${V.dims !== 3 ? `，${V.dims} 維` : ''}</span><em id="vc${V.i}">0</em></div>`;
  }).join('');
}

export function updateLandCounts(){ for(const V of S.U.VAC){ const el = document.getElementById('vc' + V.i); if(el) el.textContent = S.U.vacCount[V.i].toLocaleString('zh-TW'); } }

/* 重新開始：用目前的參數建立一個全新的宇宙（舊的直接丟棄）。opts.actions：要重播的動作紀錄 */
export function restart(opts = {}){
  const seed = parseSeed($('seedIn').value);
  $('seedIn').value = seed;
  S.PRESIM = uniVal.presim;
  S.U = createUniverse({ seed, H: uniVal.hub, RH: uniVal.rh, R0: uniVal.r0, RGEN: uniVal.rgen, typical: $('obsSel').value === 'typical',
    vacN: uniVal.vacN, crunchP: uniVal.crunchP, oddDimP: uniVal.oddDimP, localH: $('localHSel').value === '1' }, tune, { actions: opts.actions });
  S.U.window = S.HIST;
  S.U.on('rebase', onRebase); S.anchorFade = null;
  S.HUB = S.U.p.H; S.RH = S.U.p.RH; S.R0 = S.U.p.R0; S.RGEN = S.U.p.RGEN;
  S.PAL = buildPalettes(S.U.VAC);
  $('landscape').innerHTML = landHTML(); $('sS').textContent = seed;
  S.obsEndKey = ''; $('banner').hidden = true; $('reseedBtn').hidden = true;
  resetTemporal();
  try { history.replaceState(null, '', '#seed=' + seed + (S.U.p.typical ? '&obs=typical' : '') + (S.U.p.localH ? '&localH=1' : '')); } catch(e){}
  colSeen.clear(); S.pendingCol = [];
  S.tView = 0; S.isLive = true; S.playing = true; S.scrubbing = false;
  S.selected = null; card.hidden = true; S.zoomAnim = null;
  clampCam();
  S.U.presim(S.PRESIM); S.tView = S.U.tLive; S.prevT = S.tView;
  drawSpark(); refreshDerived();
  emit('universe', S.U);
}

/* 模組初始化：依原本的執行順序，由 app/main.js 統一呼叫 */
export function init(){
  for(const [id,key] of Object.entries(OPT_IDS)) $(id).addEventListener('change', e => opt[key] = e.target.checked);
  buildSliders($('liveSliders'), LIVE_P, (p,v) => p.set(v));
  buildSliders($('uniSliders'), UNI_P, (p,v) => { uniVal[p.id] = v; if(uniReady) refreshDerived(); });
  { // 初始種子：網址 #seed=… 優先，否則隨機
    const m = /seed=([^&]+)/.exec(location.hash), o = /obs=typical/.test(location.hash);
    $('seedIn').value = m ? parseSeed(decodeURIComponent(m[1])) : (Math.random()*1e9) >>> 0;
    if(o) $('obsSel').value = 'typical';
    if(/localH=1/.test(location.hash)) $('localHSel').value = '1';
  }
  uniReady = true;
  refreshDerived();
  $('applyBtn').addEventListener('click', () => restart());
  $('seedIn').addEventListener('input', refreshDerived);
  $('obsSel').addEventListener('change', refreshDerived);
  $('localHSel').addEventListener('change', refreshDerived);
  $('seedRnd').addEventListener('click', () => { $('seedIn').value = (Math.random()*1e9) >>> 0; refreshDerived(); });
  $('bannerClose').addEventListener('click', () => { $('banner').hidden = true; });
  $('bannerNew').addEventListener('click', () => { $('seedIn').value = (Math.random()*1e9) >>> 0; restart(); });
  $('reseedBtn').addEventListener('click', () => { $('seedIn').value = (Math.random()*1e9) >>> 0; restart(); });
  $('resetAll').addEventListener('click', () => {
    for(const p of LIVE_P){ p.el.value = p.def; p.upd(); }
    for(const p of UNI_P){ p.el.value = p.def; p.upd(); }
    for(const [id,key] of Object.entries(OPT_IDS)){ $(id).checked = true; opt[key] = true; }
    restart();
  });
  $('zin').addEventListener('click', () => animateZoom(1.8));
  $('zout').addEventListener('click', () => animateZoom(1/1.8));
  $('zreset').addEventListener('click', () => { S.zoomAnim = null; S.Z = defaultZoom(); P.x = 0; P.y = 0; clampCam(); });
}
