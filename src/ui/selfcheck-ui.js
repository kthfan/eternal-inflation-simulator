/* 介面｜自我檢查按鈕：依序執行核心檢查（core/selfcheck.js）、外掛加入的檢查、畫面相關的檢查（checks-render.js）。 */
import { SelfCheck } from '../core/selfcheck.js';
import { renderChecks } from './checks-render.js';
import { $ } from './dom.js';

/* 外掛可以加入自己的檢查項目（格式同 SelfCheck.tests：{ name, desc, run() → { pass, detail } }） */
export const extraChecks = [];

/* 模組初始化：依原本的執行順序，由 app/main.js 統一呼叫 */
export function init(){
  $('checkBtn').addEventListener('click', async () => {
    const btn = $('checkBtn'), out = $('checkOut');
    btn.disabled = true; out.innerHTML = '';
    const rows = [...SelfCheck.tests, ...extraChecks, ...renderChecks];
    let passN = 0;
    for(const T of rows){
      const li = document.createElement('li'); li.innerHTML = `<b>${T.name}</b><span>執行中…</span>`; out.appendChild(li);
      await new Promise(r => setTimeout(r, 30));
      let r; try { r = T.run(); } catch(e){ r = { pass: false, detail: '發生錯誤：' + e.message }; }
      if(r.pass) passN++;
      li.className = r.pass ? 'ok' : 'bad';
      li.innerHTML = `<b>${r.pass ? '✓' : '✗'} ${T.name}</b><span>${r.detail}</span><small>${T.desc}</small>`;
    }
    const sum = document.createElement('li'); sum.className = passN === rows.length ? 'ok sum' : 'bad sum';
    sum.innerHTML = `<b>${passN} / ${rows.length} 項通過</b>`; out.appendChild(sum);
    btn.disabled = false;
  });
}
