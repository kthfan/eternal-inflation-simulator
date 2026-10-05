/* 擴充點（hooks）：各版本的模擬器以「外掛」的形式加入功能，不修改核心程式。
   核心在固定的時機呼叫 emit；外掛用 on 訂閱。
   可「攔截」的事件（滑鼠、鍵盤）用 emitUntil：任何一個處理者回傳 true，核心就不再處理這個事件。

   目前提供的事件（參數）：
   · 'universe'        (U)                 建立新宇宙之後（重新開始、換種子）
   · 'frame'           ({ dtR, dt, draw }) 每次推進模擬之後（draw 為 false 代表背景運行、不繪製）
   · 'render:world'    ({ ctx, t })        泡泡、疇壁都畫完之後、暗角之前：畫在世界上的東西（會被暗角影響）
   · 'render:overlay'  ({ ctx, t })        整格畫完之後：畫在最上層的東西（游標、提示）
   · 'pointerdown' / 'pointermove' / 'pointerup' / 'wheel' (event)   可攔截
   · 'keydown'         (event)             可攔截
   · 'select'          (bubble 或 null)    點選泡泡（或取消）之後 */
const handlers = new Map();
export function on(name, fn){
  if(!handlers.has(name)) handlers.set(name, []);
  handlers.get(name).push(fn);
  return () => { const a = handlers.get(name); const i = a.indexOf(fn); if(i >= 0) a.splice(i, 1); };
}
export function emit(name, ...args){
  const a = handlers.get(name); if(!a) return;
  for(const fn of a.slice()){ try { fn(...args); } catch(e){ console.error(`[hook ${name}]`, e); } }
}
export function emitUntil(name, ...args){
  const a = handlers.get(name); if(!a) return false;
  for(const fn of a.slice()){ try { if(fn(...args) === true) return true; } catch(e){ console.error(`[hook ${name}]`, e); } }
  return false;
}
export const hasHandlers = name => !!(handlers.get(name) && handlers.get(name).length);
