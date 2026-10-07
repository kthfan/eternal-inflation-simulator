/* 核心自我檢查（不需要瀏覽器）：npm test
   與模擬器內「自我檢查」按鈕執行的是同一組測試（src/core/selfcheck.js），差別只在這裡不含需要畫面的項目。
   方案 B（各區域各自的膨脹率，實驗中）只跑它專屬的檢查；整組不變式在方案 B 下的狀況見 docs/ROADMAP.md D11。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SelfCheck, SelfCheckB } from '../src/core/selfcheck.js';

for(const T of [...SelfCheck.tests, ...SelfCheckB.tests.filter(T => T.name.startsWith('方案 B'))]){
  test(T.name, () => {
    const r = T.run();
    assert.ok(r.pass, `${T.name}：${r.detail}`);
  });
}
