/* 核心｜真空地景：由種子生成各種真空（真空能、穿隧率、大擠壓與熱寂的時間、物理常數的示意值）。純資料，不依賴其他模組的狀態。 */
import { mulberry32 } from './math.js';
import { FALSE_EPS, UP_EPS } from './constants.js';

export const VNAMES = '子丑寅卯辰巳午未申酉戌亥甲乙丙丁';

/* 由種子生成真空地景：負真空能 → 大擠壓（τ ≈ 1.5 /(H√|ε|)）；近乎為零 → 極穩定；一般正真空能 → 內部繼續穿隧 */
export function makeLandscape(r, p){
  const n = p.vacN, VAC = [];
  const hues = []; for(let i=0;i<n;i++) hues.push((i*360/n + r()*12) % 360);
  for(let i=n-1;i>0;i--){ const j = (r()*(i+1))|0; [hues[i], hues[j]] = [hues[j], hues[i]]; }
  const nA = Math.min(n-1, Math.round(n*p.crunchP)), nT = Math.max(1, Math.round(n*.18));
  const kinds = []; for(let i=0;i<n;i++) kinds.push(i < nA ? 'ads' : i < nA + nT ? 'tiny' : 'ds');
  for(let i=n-1;i>0;i--){ const j = (r()*(i+1))|0; [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  for(let i=0;i<n;i++){
    const kind = kinds[i];
    let eps, lexp, lman;
    if(kind === 'tiny'){ eps = 0; lexp = 100 + Math.floor(r()*23); lman = 1 + r()*8.9; }
    else {
      const mag = .05 + r()*.85;
      eps = kind === 'ads' ? -mag : mag;
      const val = mag*1e-10; lexp = Math.ceil(-Math.log10(val)); lman = val*Math.pow(10, lexp);
    }
    const dims = r() < 1 - p.oddDimP ? 3 : [1,2,4,5,6,7,10][(r()*7)|0];
    const ainv = kind === 'tiny' ? 137 + (r()-.5)*80 : 60 + r()*190;
    const mratio = kind === 'tiny' ? 600 + r()*2800 : 300 + r()*3600;
    // 只有仍在暴脹的正真空能宇宙會繼續穿隧；真空能近乎為零的宇宙（像我們的）衰變率極低，在模擬時間內視為穩定
    const grel = kind === 'ds' ? .25 + r()*1.25 : 0;
    r();   // 保留一次亂數消耗，讓其他屬性的抽樣順序不變
    VAC.push({ i, name: VNAMES[i] + '型真空', kind, eps, lexp, lman, lsign: eps < 0 ? -1 : 1, dims, ainv, mratio, grel, hue: hues[i],
      w: .4 + r(), crunchT: kind === 'ads' ? Math.max(3, 1.5/(p.H*Math.sqrt(-eps))) : Infinity,
      // 熱寂：真空能近乎為零的宇宙會一直膨脹、冷卻，恆星燃盡、星系彼此遠離到視界之外。Λ 越小越慢（時間尺度 ∝ 1/√Λ，這裡以指數 lexp 示意）
      hdT: kind === 'tiny' ? (30 + (lexp - 100)*2)*(.25/p.H) : Infinity });
  }
  /* 激發態假真空：放在地景最後，以獨立的亂數產生（不消耗 r），既有種子的地景與演化完全不變。
     權重 w = 0、穿隧率 grel = 0：自然成核永遠不會產生它，它內部也不會再成核（它很快就會被周圍吃掉） */
  const r2 = mulberry32((p.seed ^ 0x5bd1e995) >>> 0);
  { const val = UP_EPS*1e-10, lexp = Math.ceil(-Math.log10(val));
    VAC.push({ i: n, name: '激發態假真空', kind: 'up', eps: UP_EPS, lexp, lman: val*Math.pow(10, lexp), lsign: 1, dims: 3,
      ainv: 60 + r2()*190, mratio: 300 + r2()*3600, grel: 0, hue: 40 + r2()*20, w: 0, crunchT: Infinity, hdT: Infinity }); }
  /* 再循環假真空（D13）：在 Λ > 0 的口袋宇宙中向上穿隧回到假真空的能量（Garriga–Vilenkin 的再循環宇宙）。只能由玩家的再循環技能產生（w = 0）；
     內部與假真空完全相同：以假真空的穿隧率（成核時特別處理，grel 保持 0 讓既有種子的成核序列不變）穿隧出任何較低的真空 */
  { const val = FALSE_EPS*1e-10, lexp = Math.ceil(-Math.log10(val));
    VAC.push({ i: n + 1, name: '再循環假真空', kind: 'rf', eps: FALSE_EPS, lexp, lman: val*Math.pow(10, lexp), lsign: 1, dims: 3,
      ainv: 60 + r2()*190, mratio: 300 + r2()*3600, grel: 0, hue: 268 + r2()*14, w: 0, crunchT: Infinity, hdT: Infinity }); }
  return VAC;
}
