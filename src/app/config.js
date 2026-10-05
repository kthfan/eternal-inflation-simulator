/* 應用層｜共用設定：會影響演化的即時參數 tune（交給模擬核心）、只影響畫面的參數 K、畫質等級 QL 等。 */
import { S } from './state.js';

export const tune = { gamma: 2.5e-6, innerMul: 1, wallK: 1 };   // 會影響演化的即時參數（交給模擬核心）

// 只影響畫面的參數
export const K = { habTol:30, gridBase:26, warp:1, neb:1, ripples:2, stars:1, lblMin:38 };

export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const QL = [
  { name:'低', dpr:1,   step:30, warp:24, col:200, stars:24 },
  { name:'中', dpr:1.5, step:22, warp:50, col:400, stars:60 },
  { name:'高', dpr:2,   step:16, warp:90, col:600, stars:999 },
];

export const colSeen = new Set();

export const isHab = b => { const v = S.U.VAC[b.vac]; return v.kind === 'tiny' && v.dims === 3 && Math.abs(v.ainv - 137) < K.habTol && v.mratio > 1000 && v.mratio < 3000; };

export const epsOf = b => S.U.VAC[b.vac].eps;
