/* 核心｜數學工具：可重現的亂數（mulberry32）、雜湊、Poisson 抽樣、HSL 轉 RGB。純函式，不依賴瀏覽器。 */
/* ---------- 1. 工具 ---------- */
export const TAU = Math.PI * 2;

export function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function hsl2rgb(h, s, l){ s /= 100; l /= 100; const k = n => (n + h/30) % 12, a = s*Math.min(l, 1-l), f = n => l - a*Math.max(-1, Math.min(k(n)-3, Math.min(9-k(n), 1))); return [f(0)*255, f(8)*255, f(4)*255]; }

export function hash(a,b,c){
  let h = Math.imul((a|0) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h>>>13) ^ (b|0), 0xc2b2ae35);
  h = Math.imul(h ^ (h>>>16) ^ Math.imul(c|0, 0x27d4eb2d), 0x85ebca6b);
  h ^= h>>>15; h = Math.imul(h, 0x2c1b3c6d); h ^= h>>>12;
  return (h>>>0) / 4294967296;
}

export function poisson(rng, l){
  if(l > 30){ const u = rng()||1e-9, v = rng(); return Math.max(0, Math.round(l + Math.sqrt(l)*Math.sqrt(-2*Math.log(u))*Math.cos(TAU*v))); }
  const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rng(); } while(p > L); return k-1;
}
