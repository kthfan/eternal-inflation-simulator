/* 核心｜自我檢查：用全新的宇宙實例驗證不變式（不影響正在執行的模擬）。瀏覽器內的「自我檢查」按鈕與 npm test 執行的是同一組。
   各主題的檢查在 checks/ 之下；共用的工具（測試用宇宙、規則、玩家、比對方法）在 checks/helpers.js。
   每修一個問題，就在對應的主題加一個能抓到它的檢查（CLAUDE.md 規則 8）。 */
import { makeHelpers } from './checks/helpers.js';
import worldChecks from './checks/world.js';
import actionChecks from './checks/actions.js';
import playerChecks from './checks/player.js';
import focusChecks from './checks/focus.js';
import regionChecks from './checks/regions.js';

/* extraP：附加的宇宙參數（例如 { localH: true } 以方案 B 跑同一組不變式；方案 B 另有自己專屬的檢查） */
export function buildSelfCheck(extraP = {}){
  const h = makeHelpers(extraP);
  const tests = [...worldChecks(h), ...actionChecks(h), ...playerChecks(h), ...focusChecks(h)];
  if(h.baseP.localH) tests.push(...regionChecks(h));
  return { tests, buildRules: h.buildRules };
}
export const SelfCheck = buildSelfCheck();
/* 方案 B（各區域膨脹率）：同一組不變式在 localH 下也必須成立 */
export const SelfCheckB = buildSelfCheck({ localH: true });
