/* 核心自我檢查（不需要瀏覽器）：npm test
   與模擬器內「自我檢查」按鈕執行的是同一組測試（src/core/selfcheck.js），差別只在這裡不含需要畫面的項目。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SelfCheck } from '../src/core/selfcheck.js';

for(const T of SelfCheck.tests){
  test(T.name, () => {
    const r = T.run();
    assert.ok(r.pass, `${T.name}：${r.detail}`);
  });
}
