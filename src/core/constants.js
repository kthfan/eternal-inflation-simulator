/* 核心｜常數：所有模組共用的固定值。 */
export const STEP = 1/30;   // 固定模擬步長：與影格率無關，才能用種子重現

/* 單一泡泡的膨脹倍數上限（只是最後的保險，避免數值溢位）。
   各泡泡到達上限的時間不同，若上限太低，彼此的相對幾何會被扭曲，造成歸屬來回跳動；
   實際上永遠存在的泡泡在那之前就會「退場」（見 world.js 的 retire），只剩一個，不會再與誰比較。 */
export const EMAX = 1e13;
export const LONG = 90;     // 壽命超過此值（含永遠不會流出者）的泡泡另外保存，回放時一律納入
export const BUCKET = 0.5, MAXB = 160000;
export const FALSE_EPS = 1;   // 假真空的真空能（其他真空以它為單位）
export const UP_EPS = 1.6;    // 激發態假真空：比假真空更高，只能由向上穿隧（使用者動作）產生，見 docs/ROADMAP.md D5、D6
