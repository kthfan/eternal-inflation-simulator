/* 範例外掛「檢視器」：示範外掛 API 的各種用法，也作為撰寫新外掛的範本。
   · 'render:overlay'：在游標旁畫出物理座標與該點所屬的宇宙
   · U.on('born')：統計每秒誕生的泡泡數
   · addPanel：在設定面板加入自己的區塊與開關
   · 'keydown'（可攔截）：按 I 開關檢視器
   · addCheck：加入自己的自我檢查項目 */
export function inspector(){
  let on = true, mx = -1, my = -1, born = 0, rate = 0, acc = 0, off = null;
  return {
    name: 'inspector',
    setup(api){
      const panel = api.addPanel({ title: '檢視器（範例外掛）', open: true, html: `
        <label class="tog"><input type="checkbox" id="inspOn" checked><span>顯示游標資訊（I）</span></label>
        <p class="note">每秒誕生泡泡：<b id="inspRate">0</b></p>` });
      panel.querySelector('#inspOn').addEventListener('change', e => { on = e.target.checked; });
      api.camera.cv.addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; });
      api.on('universe', U => { if(off) off(); born = 0; off = U.on('born', () => born++); });
      api.on('frame', ({ dtR }) => {
        acc += dtR;
        if(acc >= 1){ rate = born/acc; born = 0; acc = 0; const el = document.getElementById('inspRate'); if(el) el.textContent = rate.toFixed(1); }
      });
      api.on('keydown', e => {
        if(e.key !== 'i' && e.key !== 'I') return false;
        on = !on; panel.querySelector('#inspOn').checked = on; return true;   // 攔截：核心不再處理這個按鍵
      });
      api.on('render:overlay', ({ ctx }) => {
        if(!on || mx < 0) return;
        const [px, py] = api.camera.toPhysical(mx, my);
        const own = api.U.ownerAt(px, py, api.tView);
        const txt = `(${px.toFixed(0)}, ${py.toFixed(0)})  ${own ? '#' + own.b.id + ' ' + api.U.VAC[own.b.vac].name : '假真空'}`;
        ctx.save(); ctx.font = '12px "Noto Sans TC", sans-serif'; ctx.textBaseline = 'top';
        const w = ctx.measureText(txt).width + 12;
        ctx.fillStyle = 'rgba(10,6,24,.75)'; ctx.fillRect(mx + 14, my + 14, w, 22);
        ctx.fillStyle = '#ede7ff'; ctx.fillText(txt, mx + 20, my + 19);
        ctx.restore();
      });
      api.addCheck({ name: '外掛：檢視器', desc: '外掛 API 的事件（universe、frame、render:overlay）都必須確實被呼叫', run(){
        let n = 0; const stop = api.on('render:overlay', () => n++);
        api.render(api.tView); stop();
        return { pass: n === 1 && !!api.U, detail: `render:overlay 呼叫 ${n} 次` };
      }});
    },
  };
}
