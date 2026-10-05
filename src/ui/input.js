/* 介面｜滑鼠、觸控、滾輪、鍵盤。外掛可透過 hooks 攔截這些事件（例如遊戲中拖曳泡泡）。 */
import { emit, emitUntil } from '../app/hooks.js';
import { S } from '../app/state.js';
import { Music, setMusic } from '../audio/music.js';
import { P, animateZoom, clampCam, cv, defaultZoom, resize, toP, zoomAbout } from '../render/camera.js';
import { card, openCard } from './card.js';
import { body, setUI } from './panels.js';
import { goLive, seek, togglePlay } from './timeline.js';

/* 畫布：平移、縮放、點選 */
export const pts = new Map();

export let down = null, pinch = null;

export function endPointer(e){
  if(emitUntil('pointerup', e)){ pts.delete(e.pointerId); return; }
  if(!pts.has(e.pointerId)) return;
  pts.delete(e.pointerId); pinch = null;
  if(pts.size === 0){
    cv.classList.remove('dragging');
    if(down && !down.moved && performance.now() - down.t < 500) handleClick(e.clientX, e.clientY);
    down = null;
  }
}

export function handleClick(x,y){
  const [px, py] = toP(x, y);
  let best = S.U.ownerAt(px, py, S.tView);
  if(!best){   // 太小的泡泡給 8 像素的點擊容許範圍
    let bd = 8;
    for(const v of S.vis){ const d = Math.hypot(x - v.sx, y - v.sy) - v.sr; if(d < bd){ bd = d; best = v; } }
  }
  if(best){ openCard(best.b); return; }
  card.hidden = true; S.selected = null; emit('select', null);
}

/* 模組初始化：依原本的執行順序，由 app/main.js 統一呼叫 */
export function init(){
  cv.addEventListener('pointerdown', e => {
    if(emitUntil('pointerdown', e)) return;   // 外掛可攔截滑鼠操作（例如拖曳泡泡）
    cv.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if(pts.size === 1) down = { x:e.clientX, y:e.clientY, t:performance.now(), moved:false };
    else if(down) down.moved = true;
    pinch = null; S.zoomAnim = null;
    cv.classList.add('dragging');
  });
  cv.addEventListener('pointermove', e => {
    if(emitUntil('pointermove', e)) return;
    if(!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId), cur = { x:e.clientX, y:e.clientY };
    pts.set(e.pointerId, cur);
    if(pts.size === 1){
      P.x -= (cur.x-prev.x)/S.Z; P.y -= (cur.y-prev.y)/S.Z; clampCam();
      if(down && Math.hypot(cur.x-down.x, cur.y-down.y) > 5) down.moved = true;
    } else if(pts.size === 2){
      const [a,b] = [...pts.values()];
      const mid = { x:(a.x+b.x)/2, y:(a.y+b.y)/2 }, dist = Math.hypot(a.x-b.x, a.y-b.y);
      if(pinch){
        zoomAbout(dist/(pinch.dist||1), mid.x, mid.y);
        P.x -= (mid.x-pinch.mid.x)/S.Z; P.y -= (mid.y-pinch.mid.y)/S.Z; clampCam();
      }
      pinch = { mid, dist };
    }
  });
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    if(emitUntil('wheel', e)) return;
    S.zoomAnim = null;
    const dy = e.deltaMode === 1 ? e.deltaY*16 : e.deltaY;
    zoomAbout(Math.exp(-dy*.0015), e.clientX, e.clientY);
  }, { passive:false });
  cv.addEventListener('dblclick', e => animateZoom(2, e.clientX, e.clientY));
  addEventListener('keydown', e => {
    const tag = (e.target.tagName||'').toLowerCase();
    if(tag === 'input' || tag === 'select') return;
    if(emitUntil('keydown', e)) return;
    if(e.key === ' '){ if(tag === 'button') return; togglePlay(); e.preventDefault(); }
    else if(e.key === 'ArrowLeft'){ seek(S.tView - 5); e.preventDefault(); }
    else if(e.key === 'ArrowRight'){ seek(S.tView + 5); e.preventDefault(); }
    else if(e.key === 'l' || e.key === 'L') goLive();
    else if(e.key === '+' || e.key === '=') animateZoom(1.5);
    else if(e.key === '-' || e.key === '_') animateZoom(1/1.5);
    else if(e.key === '0'){ S.Z = defaultZoom(); P.x = 0; P.y = 0; clampCam(); }
    else if(e.key === 'Escape'){ card.hidden = true; S.selected = null; emit('select', null); }
    else if(e.key === 'h' || e.key === 'H') setUI(!body.classList.contains('ui-hidden'));
    else if(e.key === 'm' || e.key === 'M') setMusic(!Music.on);
  });
  addEventListener('resize', resize);
}
