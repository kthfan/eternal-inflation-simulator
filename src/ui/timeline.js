/* 介面｜直播式時間軸：播放／暫停、拖曳回看、回到直播、誕生率波形。 */
import { S } from '../app/state.js';
import { BUCKET } from '../core/universe.js';
import { $ } from './dom.js';

export let scrub, thumb, played, tip, mark;

export let spark, sctx;

export let playBtn, liveBtn, liveTxt, timeLbl, backBtn, fwdBtn;

export function fmt(s){ s = Math.max(0, s); const h = Math.floor(s/3600), m = Math.floor(s/60)%60, r = Math.floor(s%60); return h ? `${h}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}` : `${m}:${String(r).padStart(2,'0')}`; }

export const span = () => Math.max(1e-6, S.U.tLive - S.U.tStart);

export function goLive(){ S.isLive = true; S.playing = true; S.tView = S.U.tLive; }

export function seek(t){
  S.tView = Math.max(S.U.tStart, Math.min(S.U.tLive, t));
  if(S.tView >= S.U.tLive - .05) goLive(); else S.isLive = false;
}

export function togglePlay(){
  if(S.playing){ S.playing = false; S.isLive = false; }
  else S.playing = true;
}

export let lastTL = '';

export function updateTimeline(){
  const f = S.U.tLive > S.U.tStart ? (S.tView - S.U.tStart)/span() : 1;
  thumb.style.left = (f*100) + '%';
  played.style.width = (f*100) + '%';
  liveBtn.classList.toggle('on', S.isLive);
  liveTxt.textContent = S.isLive ? '直播中' : '回到直播';
  playBtn.classList.toggle('paused', !S.playing);
  playBtn.setAttribute('aria-label', S.playing ? '暫停' : '播放');
  fwdBtn.disabled = S.isLive;
  const behind = S.U.tLive - S.tView;
  const s = S.isLive ? fmt(S.tView) : `${fmt(S.tView)}<span class="behind">落後直播 ${fmt(behind)}</span>`;
  if(s !== lastTL){ timeLbl.innerHTML = s; lastTL = s; scrub.setAttribute('aria-valuenow', S.tView.toFixed(1)); scrub.setAttribute('aria-valuemax', S.U.tLive.toFixed(1)); scrub.setAttribute('aria-valuetext', `${fmt(S.tView)}，共 ${fmt(S.U.tLive)}`); }
  if(S.selected && S.selected.tn >= S.U.tStart){ mark.style.display = 'block'; mark.style.left = ((S.selected.tn - S.U.tStart)/span()*100) + '%'; }
  else mark.style.display = 'none';
}

export function sizeSpark(){ const r = spark.getBoundingClientRect(); spark.width = Math.max(1, Math.round(r.width*S.dpr)); spark.height = Math.max(1, Math.round(r.height*S.dpr)); drawSpark(); }

export function drawSpark(){
  if(!S.U) return;
  const W = spark.width, Hh = spark.height;
  sctx.clearRect(0,0,W,Hh);
  const buckets = S.U.buckets, b0 = Math.max(0, Math.floor(S.U.tStart/BUCKET) - S.U.bucketBase);
  const nb = Math.max(1, Math.ceil(S.U.tLive/BUCKET) - S.U.bucketBase - b0);
  const cols = Math.max(1, Math.floor(W/(3*S.dpr)));
  const vals = new Array(cols).fill(0);
  for(let c=0;c<cols;c++){ const i0 = Math.floor(c/cols*nb), i1 = Math.max(i0+1, Math.floor((c+1)/cols*nb)); let s = 0, n = 0; for(let i=i0;i<i1 && i+b0<buckets.length;i++){ s += buckets[i+b0]; n++; } vals[c] = n ? s/n : 0; }
  let mx = 0, mn = Infinity; for(const v of vals){ mx = Math.max(mx, v); mn = Math.min(mn, v); } if(!(mx > mn)){ mx = mn + 1; }
  const g = sctx.createLinearGradient(0,0,W,0);
  const st = getComputedStyle(document.documentElement);
  g.addColorStop(0, st.getPropertyValue('--accent-2').trim() || '#6fd3ff');
  g.addColorStop(1, st.getPropertyValue('--accent').trim() || '#ff6fcf');
  sctx.fillStyle = g;
  const bw = W/cols;
  for(let i=0;i<cols;i++){
    const hgt = Math.max(1*S.dpr, (.15 + .8*(vals[i]-mn)/(mx-mn))*Hh);
    sctx.fillRect(i*bw + bw*.2, Hh - hgt, bw*.6, hgt);
  }
}

/* 時間軸操作 */
export function tFromX(x){ const r = scrub.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left)/r.width)); }

export const endScrub = () => { S.scrubbing = false; scrub.classList.remove('active'); };

/* 模組初始化：依原本的執行順序，由 app/main.js 統一呼叫 */
export function init(){
  scrub = $('scrub');
  thumb = $('thumb');
  played = $('played');
  tip = $('tip');
  mark = $('mark');
  spark = $('spark');
  sctx = spark.getContext('2d');
  playBtn = $('play');
  liveBtn = $('live');
  liveTxt = $('liveTxt');
  timeLbl = $('timeLbl');
  backBtn = $('back');
  fwdBtn = $('fwd');
  scrub.addEventListener('pointerdown', e => {
    S.scrubbing = true; scrub.classList.add('active'); scrub.setPointerCapture(e.pointerId);
    const f = tFromX(e.clientX); if(f > .995) goLive(); else seek(S.U.tStart + f*span());
  });
  scrub.addEventListener('pointermove', e => {
    const f = tFromX(e.clientX), t = S.U.tStart + f*span();
    tip.style.left = (f*100) + '%';
    tip.textContent = f > .995 ? '直播' : `${fmt(t)}　N = ${(S.HUB*t).toFixed(1)}`;
    if(S.scrubbing){ if(f > .995) goLive(); else seek(t); }
  });
  scrub.addEventListener('pointerup', endScrub);
  scrub.addEventListener('pointercancel', endScrub);
  scrub.addEventListener('keydown', e => {
    if(e.key === 'Home'){ seek(S.U.tStart); e.preventDefault(); }
    if(e.key === 'End'){ goLive(); e.preventDefault(); }
  });
  playBtn.addEventListener('click', togglePlay);
  liveBtn.addEventListener('click', goLive);
  backBtn.addEventListener('click', () => seek(S.tView - 10));
  fwdBtn.addEventListener('click', () => seek(S.tView + 10));
  $('speed').addEventListener('change', e => { S.speed = parseFloat(e.target.value); });
}
