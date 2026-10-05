/* 核心｜領域幾何 Territory：「某一點屬於哪個宇宙」的唯一一套規則，物理（成核、觀測者、點選）與畫面（填色、泡壁、疇壁）共用。
   與座標系無關：物理座標與螢幕座標只差一個縮放倍率。純函式，不依賴瀏覽器。 */
import { TAU } from './math.js';

/* ---------- 2. Territory 領域幾何 ----------
   「圓」= { b: 泡泡, cx, cy, r }，座標系任意。
   frame F = { eps(b), shift(W, L)（以該座標系為單位的疇壁位移）, circ(b)（任意泡泡在該座標系中的圓） }。

   規則（兩個無親緣關係、光錐相交的泡泡之間）：
   · merge   同種真空：每點屬於泡壁先到的一方（加權沃羅諾伊），交界不留疇壁。
   · wall    不同真空：疇壁是通過兩個泡壁交點、向輸家鼓起的圓弧。輸家＝真空能較高者（相同時較早誕生者）。
   · inherit 一個泡泡 X 的光錐整個落在另一個 Y 之內（X 誕生在正被 Y 入侵的宇宙裡）：
             若 X 的真空能比 Y 低，X 不受 Y 限制（低能量真空以光速推進）；
             否則 X 與 Y 的交界沿用 Y 與「X 最近一個不在 Y 光錐內的祖先 D」之間的疇壁。
   有親緣關係的泡泡之間沒有規則：子泡泡永遠蓋在母泡泡之上。
   向上穿隧（使用者動作）會產生真空能比母宇宙「高」的子泡泡；繪製順序因此改用「繪製鍵」（見 drawOrder），
   當輸家因而畫在贏家之後，輸家要明確讓出贏家那一側（R.lYield）。沒有向上穿隧時，行為與原本完全相同。 */
export const Territory = (() => {
  const isAncestor = (a, b) => { for(let p = b.parent; p; p = p.parent) if(p === a) return true; return false; };
  const related = (a, b) => isAncestor(a, b) || isAncestor(b, a);
  const insideOf = (a, o) => Math.hypot(a.cx - o.cx, a.cy - o.cy) + a.r <= o.r;
  const arrival = (c, x, y) => Math.hypot(x - c.cx, y - c.cy) - c.r;

  /* 疇壁幾何：贏家 W、輸家 L。圓弧通過兩泡壁交點，頂點從「泡壁先到」的平分點起，被位移 s 推向輸家，限制在透鏡區內。
     lSide(x,y)：該點是否在輸家那一側（只在透鏡區內有意義）。 */
  function wallGeom(wx, wy, rW, lx, ly, rL, s){
    const dx = lx - wx, dy = ly - wy, d = Math.hypot(dx, dy);
    if(!(d > 0)) return null;
    const ux = dx/d, uy = dy/d;
    const xc = (rW*rW - rL*rL + d*d)/(2*d), h = Math.sqrt(Math.max(0, rW*rW - xc*xc));
    let xv = (d + rW - rL)/2 + s/2;
    xv = Math.max(d - rL + .5, Math.min(xv, rW - .5));
    const sig = xv - xc;
    const g = { wx, wy, ux, uy, xc, h, xv, sig, line: Math.abs(sig) < .5,
      p1x: wx + ux*xc + uy*h, p1y: wy + uy*xc - ux*h, p2x: wx + ux*xc - uy*h, p2y: wy + uy*xc + ux*h };
    if(!g.line){ g.R = (h*h + sig*sig)/(2*Math.abs(sig)); const xo = xv - Math.sign(sig)*g.R; g.cx = wx + ux*xo; g.cy = wy + uy*xo; }
    g.lSide = (x, y) => {
      if(g.line) return (x - wx)*ux + (y - wy)*uy > xc;
      const inside = (x - g.cx)**2 + (y - g.cy)**2 < g.R*g.R;
      return sig > 0 ? !inside : inside;
    };
    return g;
  }
  const beats = (F, a, b) => { const ea = F.eps(a), eb = F.eps(b); return ea < eb || (ea === eb && a.tn > b.tn); };
  /* 繪製鍵：自己與所有祖先的真空能最小值。一般的家族中子孫的真空能一定較低，所以就等於自己的真空能；
     向上穿隧的子泡泡（比母宇宙高）則沿用母宇宙的鍵，同鍵時較晚誕生者後畫 → 仍然畫在母宇宙之上 */
  const dkey = (F, b) => { let e = F.eps(b); for(let q = b.parent; q; q = q.parent){ const x = F.eps(q); if(x < e) e = x; } return e; };
  /* 繪製順序：繪製鍵高的先畫；相同時較早誕生的先畫 */
  const drawOrder = (F, a, b) => (dkey(F, b.b) - dkey(F, a.b)) || (a.b.tn - b.b.tn);

  function rule(F, A, B){
    const d = Math.hypot(B.cx - A.cx, B.cy - A.cy);
    if(d >= A.r + B.r) return null;
    if(related(A.b, B.b)) return null;
    if(d <= Math.abs(A.r - B.r)){
      const [X, Y] = A.r < B.r ? [A, B] : [B, A];
      let D = null;
      for(let q = X.b.parent; q; q = q.parent){ const c = F.circ(q); if(!c) break; if(!insideOf(c, Y)){ D = c; break; } }
      // X 的真空能比 Y 低：X 是更低能量的真空泡泡，會以光速推進 Y 的地盤，不受 Y 限制
      if(beats(F, X.b, Y.b)) return { kind:'inherit', X, Y, free:true };
      if(!D) return { kind:'inherit', X, Y, g:null };
      if(D.b.vac === Y.b.vac) return { kind:'inherit', X, Y, D, merge:true, g: wallGeom(Y.cx, Y.cy, Y.r, D.cx, D.cy, D.r, 0) };
      if(!beats(F, Y.b, D.b)) return { kind:'inherit', X, Y, D, free:true };
      return { kind:'inherit', X, Y, D, g: wallGeom(Y.cx, Y.cy, Y.r, D.cx, D.cy, D.r, F.shift(Y.b, D.b)) };
    }
    if(A.b.vac === B.b.vac) return { kind:'merge', A, B };
    const [W, L] = beats(F, A.b, B.b) ? [A, B] : [B, A];
    const g = wallGeom(W.cx, W.cy, W.r, L.cx, L.cy, L.r, F.shift(W.b, L.b));
    if(!g) return null;
    const R = { kind:'wall', W, L, g };
    // 輸家畫在贏家之後（只發生在向上穿隧的家族）：輸家不能再「整圓畫下、讓贏家蓋掉」，必須自己讓出贏家側。
    // 疇壁若已越過輸家中心，輸家剩下的部分不再對中心呈星形，視為整個被吃掉（cE）
    if(drawOrder(F, L, W) > 0){ R.lYield = true; R.cE = arrival(W, L.cx, L.cy) < 0 && !g.lSide(L.cx, L.cy); }
    return R;
  }
  const otherOf = (R, v) => R.kind === 'merge' ? (R.A === v ? R.B : R.A) : R.kind === 'wall' ? (R.W === v ? R.L : R.W) : (R.X === v ? R.Y : R.X);
  /* 規則下，兩者重疊處的點 (x,y) 屬於誰 */
  function ownerIn(R, x, y){
    if(R.kind === 'merge') return arrival(R.A, x, y) < arrival(R.B, x, y) ? R.A : R.B;
    if(R.kind === 'wall') return R.g.lSide(x, y) ? R.L : R.W;
    if(R.free) return R.X;
    return R.g && R.g.lSide(x, y) ? R.X : R.Y;
  }
  /* 規則 R 的另一方是否把點從 v 手中拿走（點須在另一方的圓內） */
  const takes = (R, v, x, y) => ownerIn(R, x, y) !== v;

  /* 繪製領域：v 畫出來時實際蓋住的範圍。
     贏家只需讓出輸家側；輸家畫完整的圓（被贏家蓋住的部分自然消失；若輸家反而後畫，則自己讓出贏家側）；
     同種真空互相平分；X 讓出 Y 側。繪製順序見 drawOrder。 */
  function drawContains(v, x, y){
    if(arrival(v, x, y) >= 0) return false;
    for(const R of v.rules || []){
      if(R.kind === 'merge'){ if(arrival(otherOf(R, v), x, y) < arrival(v, x, y)) return false; }
      else if(R.kind === 'wall'){
        if(R.W === v){ if(arrival(R.L, x, y) < 0 && R.g.lSide(x, y)) return false; }
        else if(R.lYield){ if(R.cE || (arrival(R.W, x, y) < 0 && !R.g.lSide(x, y))) return false; }
      }
      else if(R.X === v && !R.free){ if(!R.g || !R.g.lSide(x, y)) return false; }
    }
    return true;
  }
  /* 為一組圓建立兩兩之間的規則（物理與畫面共用）。圓需依誕生時間排序；結果掛在各圓的 rules 上，kids 為可見的子孫 */
  function buildRules(cs, F, maxN = Infinity){
    const byB = new Map();
    for(const c of cs){ c.rules = []; c.kids = null; byB.set(c.b, c); }
    const n = Math.min(cs.length, maxN), all = [];
    for(let i=0;i<n;i++) for(let j=0;j<i;j++){
      const R = rule(F, cs[j], cs[i]);
      if(R){ cs[j].rules.push(R); cs[i].rules.push(R); all.push(R); }
    }
    for(const c of cs) for(let q = c.b.parent; q; q = q.parent){ const pc = byB.get(q); if(pc) (pc.kids || (pc.kids = [])).push(c); }
    return all;
  }
  /* 某一點屬於哪個宇宙：就是「畫面上這一點最後被誰畫到」。
     物理計算（成核、觀測者、點選）直接用繪製規則來判斷，所以兩者在定義上就一致。
     只需考慮涵蓋該點的泡泡：drawContains 只會受到同樣涵蓋該點的鄰居影響。 */
  function ownerAt(F, circles, x, y){
    const cands = [];
    for(const c of circles) if(Math.hypot(x - c.cx, y - c.cy) < c.r) cands.push({ b: c.b, cx: c.cx, cy: c.cy, r: c.r, src: c });
    if(!cands.length) return null;
    cands.sort((a, b) => a.b.tn - b.b.tn || a.b.id - b.b.id);
    buildRules(cands, F);
    cands.sort((a, b) => drawOrder(F, a, b));
    let own = null;
    for(const c of cands) if(drawContains(c, x, y)) own = c;
    return own ? own.src : null;
  }
  /* drawContains 的解析版本：沿射線方向 (ex,ey) 求出領域的邊界距離（領域對中心呈星形） */
  function cellRay(v, ex, ey, lim){
    let rho = lim;
    for(const R of v.rules || []){
      if(R.kind === 'merge'){
        const o = otherOf(R, v), wx = o.cx - v.cx, wy = o.cy - v.cy, w2 = wx*wx + wy*wy, kk = v.r - o.r, den = 2*(ex*wx + ey*wy - kk);
        if(den > 0){ const r = (w2 - kk*kk)/den; if(r < rho) rho = r; }
      } else if(R.kind === 'wall'){
        if(R.W !== v){
          if(!R.lYield) continue;
          // 輸家後畫：讓出「在贏家圓內、且在贏家側」的部分（與贏家的情況互為鏡像）
          if(R.cE){ rho = 0; break; }
          const o = R.W, g = R.g;
          const fx = v.cx - o.cx, fy = v.cy - o.cy, bq = ex*fx + ey*fy, disc = bq*bq - (fx*fx + fy*fy - o.r*o.r);
          if(disc <= 0) continue;
          const sq = Math.sqrt(disc), r1 = Math.max(0, -bq - sq), r2 = -bq + sq;
          if(r2 <= 0 || r1 >= rho) continue;
          let rs = Infinity;
          if(g.line){
            const eu = ex*g.ux + ey*g.uy, x0 = (v.cx - g.wx)*g.ux + (v.cy - g.wy)*g.uy;
            if(x0 + r1*eu <= g.xc) rs = r1; else if(eu < -1e-12){ const t = (g.xc - x0)/eu; if(t < r2) rs = Math.max(r1, t); }
          } else {
            const gx = v.cx - g.cx, gy = v.cy - g.cy, bb = ex*gx + ey*gy, dd = bb*bb - (gx*gx + gy*gy - g.R*g.R);
            if(g.sig < 0){
              if(dd <= 0) rs = r1;
              else { const t1 = -bb - Math.sqrt(dd), t2 = -bb + Math.sqrt(dd); if(r1 < t1 || r1 > t2) rs = r1; else if(t2 < r2) rs = t2; }
            } else if(dd > 0){
              const t1 = -bb - Math.sqrt(dd), t2 = -bb + Math.sqrt(dd), lo = Math.max(r1, t1), hi = Math.min(r2, t2);
              if(lo < hi) rs = lo;
            }
          }
          if(rs < rho) rho = rs;
          continue;
        }
        const o = R.L, g = R.g;
        const fx = v.cx - o.cx, fy = v.cy - o.cy, bq = ex*fx + ey*fy, disc = bq*bq - (fx*fx + fy*fy - o.r*o.r);
        if(disc <= 0) continue;
        const sq = Math.sqrt(disc), r1 = Math.max(0, -bq - sq), r2 = -bq + sq;
        if(r2 <= 0 || r1 >= rho) continue;
        let rs = Infinity;
        if(g.line){
          const eu = ex*g.ux + ey*g.uy, x0 = (v.cx - g.wx)*g.ux + (v.cy - g.wy)*g.uy;
          if(x0 + r1*eu > g.xc) rs = r1; else if(eu > 1e-12){ const t = (g.xc - x0)/eu; if(t < r2) rs = Math.max(r1, t); }
        } else {
          const gx = v.cx - g.cx, gy = v.cy - g.cy, bb = ex*gx + ey*gy, dd = bb*bb - (gx*gx + gy*gy - g.R*g.R);
          if(g.sig > 0){
            if(dd <= 0) rs = r1;
            else { const t1 = -bb - Math.sqrt(dd), t2 = -bb + Math.sqrt(dd); if(r1 < t1 || r1 > t2) rs = r1; else if(t2 < r2) rs = t2; }
          } else if(dd > 0){
            const t1 = -bb - Math.sqrt(dd), t2 = -bb + Math.sqrt(dd), lo = Math.max(r1, t1), hi = Math.min(r2, t2);
            if(lo < hi) rs = lo;
          }
        }
        if(rs < rho) rho = rs;
      } else if(R.X === v && !R.free){
        const g = R.g; if(!g){ rho = 0; break; }
        let rs = Infinity;
        if(g.line){
          const x0 = (v.cx - g.wx)*g.ux + (v.cy - g.wy)*g.uy, eu = ex*g.ux + ey*g.uy;
          if(x0 <= g.xc) rs = 0; else if(eu < -1e-12) rs = (x0 - g.xc)/(-eu);
        } else {
          const gx = v.cx - g.cx, gy = v.cy - g.cy, bb = ex*gx + ey*gy, c0 = gx*gx + gy*gy - g.R*g.R, dd = bb*bb - c0;
          if(g.sig > 0){ if(c0 < 0) rs = 0; else if(dd > 0){ const t1 = -bb - Math.sqrt(dd); if(t1 > 0) rs = t1; } }
          else { if(c0 >= 0) rs = 0; else rs = -bb + Math.sqrt(Math.max(0, dd)); }
        }
        if(rs < rho) rho = rs;
      }
    }
    return Math.max(0, rho);
  }
  /* 泡壁上的點是否已被別的宇宙佔走 */
  function wallTaken(v, x, y){
    for(const R of v.rules || []){
      if(R.kind === 'inherit' && R.Y === v) continue;
      const o = otherOf(R, v);
      if(arrival(o, x, y) < 0 && takes(R, v, x, y)) return true;
    }
    return false;
  }
  /* ---------- 交界線的可見性：以「畫面實際顯示的宇宙」為準 ----------
     原本是用兩兩規則判斷某段交界有沒有被第三個宇宙佔走。但三個泡泡交會處，兩兩規則彼此並不完全一致，
     判斷結果可能和畫面實際顯示的領域對不上：交界線在該出現的地方缺了一段，造成不連續。
     現在一律在交界線兩側各取一點，看畫面上那兩點實際顯示的是誰：兩側確實是這兩個宇宙（或它們的子孫），才畫出這段線。
     cands 必須包含所有可能涵蓋這一帶的泡泡，且每個都帶有繪製順序 ord。 */
  function displayOwner(cands, x, y){
    let best = null;
    for(const c of cands) if((!best || c.ord > best.ord) && drawContains(c, x, y)) best = c;
    return best;
  }
  /* 曲線上這一點是不是畫面上的交界：兩側顯示的宇宙不同、且不是同種真空。
     不要求兩側一定是這條曲線所屬的兩個泡泡：三個泡泡交會時，畫面上的交界常由「第三方的曲線」構成
     （例如子泡泡被鄰居的疇壁截斷、截斷處另一側顯示的卻是它的母宇宙），這些地方也必須畫線，交界才會連續。 */
  function wallBetween(R, cands, x, y, nx, ny, e){
    const o1 = displayOwner(cands, x + nx*e, y + ny*e), o2 = displayOwner(cands, x - nx*e, y - ny*e);
    return !!o1 && !!o2 && o1 !== o2 && o1.b.vac !== o2.b.vac;
  }
  /* 只保留可能影響這段交界的候選：兩個主角、它們的祖先，以及圓與兩者重疊區外接框相交的第三方。
     third 為 false 時代表附近沒有第三方：交界兩側必定就是這兩個宇宙，不需要逐點判斷。 */
  function relevantCands(cands, A, B, e){
    const x0 = Math.max(A.cx - A.r, B.cx - B.r) - e, x1 = Math.min(A.cx + A.r, B.cx + B.r) + e;
    const y0 = Math.max(A.cy - A.r, B.cy - B.r) - e, y1 = Math.min(A.cy + A.r, B.cy + B.r) + e;
    const cs = []; let third = false;
    for(const c of cands){
      if(c === A || c === B || isAncestor(c.b, A.b) || isAncestor(c.b, B.b)){ cs.push(c); continue; }
      const qx = Math.max(x0, Math.min(x1, c.cx)), qy = Math.max(y0, Math.min(y1, c.cy));
      if(Math.hypot(qx - c.cx, qy - c.cy) < c.r){ cs.push(c); third = true; }
    }
    return { cs, third };
  }
  /* 依曲線在 [T0,T1] 的長度決定取樣數（約每 2.5 單位一點，夠細才不會漏掉短短一截而閃爍），短曲線不必取到 256 點 */
  function curveSamples(P, T0, T1){
    let len = 0, p = P(T0);
    for(let i=1;i<=8;i++){ const q = P(T0 + (T1 - T0)*i/8); len += Math.hypot(q[0] - p[0], q[1] - p[1]); p = q; }
    return Math.max(24, Math.min(256, Math.ceil(len/2.5)));
  }
  /* 同種真空的平分線（雙曲線 |p−cA|−rA = |p−cB|−rB）的參數式。融合處本身不畫線，
     但這條曲線若剛好成為「兩種不同真空」在畫面上的交界（第三方介入時），也要畫出來 */
  /* seam 為 true 時改求「融合處」本身（兩側都是這兩個同種泡泡的部分），供融合瞬間的發光使用 */
  function mergeCurve(R, cands, box, e = 1.5, seam = false){
    const A = R.A, B = R.B, dx = B.cx - A.cx, dy = B.cy - A.cy, d = Math.hypot(dx, dy);
    if(!(d > 0)) return null;
    const a = (A.r - B.r)/2, c = d/2; if(Math.abs(a) >= c) return null;
    const rel = relevantCands(cands, A, B, e + 2);
    if(!seam && !rel.third) return null;             // 沒有第三方：平分線兩側都是同種真空，不會是交界
    const bb = Math.sqrt(c*c - a*a), ux = dx/d, uy = dy/d, mx = A.cx + dx/2, my = A.cy + dy/2;
    // 參數範圍只取兩個泡壁交點之間（重疊區內）那一段
    const xc = (A.r*A.r - B.r*B.r + d*d)/(2*d), hh = Math.sqrt(Math.max(0, A.r*A.r - xc*xc));
    const S = Math.max(1e-6, Math.asinh(hh/bb));
    const P = t => { const sg = -S + 2*S*t; return [mx + ux*a*Math.cosh(sg) - uy*bb*Math.sinh(sg), my + uy*a*Math.cosh(sg) + ux*bb*Math.sinh(sg)]; };
    const N = t => { const p0 = P(Math.max(0, t - 1e-4)), p1 = P(Math.min(1, t + 1e-4)), tx = p1[0] - p0[0], ty = p1[1] - p0[1], l = Math.hypot(tx, ty) || 1; return [-ty/l, tx/l]; };
    const inBoth = (x, y) => arrival(A, x, y) < 0 && arrival(B, x, y) < 0;
    const inBox = (x, y) => !box || (x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1);
    const ok = seam
      ? (t => { const [x, y] = P(t); if(!inBox(x, y)) return false; if(!rel.third) return true; const [nx, ny] = N(t);
          const o1 = displayOwner(rel.cs, x + nx*e, y + ny*e), o2 = displayOwner(rel.cs, x - nx*e, y - ny*e);
          return (o1 === A || o1 === B) && (o2 === A || o2 === B); })
      : (t => { const [x, y] = P(t); if(!inBox(x, y)) return false; const [nx, ny] = N(t); return wallBetween(R, rel.cs, x, y, nx, ny, e); });
    return { P, segs: sampleSegs(ok, 0, 1, curveSamples(P, 0, 1)) };
  }
  function sampleSegs(ok, T0, T1, M){
    const tt = i => T0 + (T1 - T0)*i/M, fl = []; for(let i=0;i<=M;i++) fl.push(ok(tt(i)));
    const refine = (a, b) => { for(let i=0;i<14;i++){ const m = (a + b)/2; if(ok(m)) a = m; else b = m; } return (a + b)/2; };
    const segs = [];
    for(let i=0;i<=M;i++){
      if(!fl[i] || (i > 0 && fl[i-1])) continue;
      let j = i; while(j < M && fl[j+1]) j++;
      segs.push([i > 0 ? refine(tt(i), tt(i-1)) : T0, j < M ? refine(tt(j), tt(j+1)) : T1]);
      i = j;
    }
    return segs;
  }
  /* 泡壁：內側確實顯示自己、外側不是自己（也不是同種真空）時才畫 */
  function shellVisible(v, cands, x, y, nx, ny, e){
    const inn = displayOwner(cands, x - nx*e, y - ny*e);
    if(inn !== v) return false;
    const out = displayOwner(cands, x + nx*e, y + ny*e);
    return !out || (out !== v && out.b.vac !== v.b.vac);
  }
  /* 疇壁：回傳求點函式與可見區段 */
  /* 從 (cx,cy) 看矩形 box 所佔的角度範圍與距離範圍（中心在矩形內時回傳 null） */
  function boxWedge(cx, cy, B){
    if(cx > B.x0 && cx < B.x1 && cy > B.y0 && cy < B.y1) return null;
    const cs = [[B.x0,B.y0],[B.x1,B.y0],[B.x1,B.y1],[B.x0,B.y1]];
    const a = cs.map(([x, y]) => Math.atan2(y - cy, x - cx)).sort((p, q) => p - q);
    let gi = 3, gap = a[0] + TAU - a[3];
    for(let i=0;i<3;i++){ if(a[i+1] - a[i] > gap){ gap = a[i+1] - a[i]; gi = i; } }
    const a0 = a[(gi + 1) % 4];
    let dmax = 0; for(const [x, y] of cs) dmax = Math.max(dmax, Math.hypot(x - cx, y - cy));
    const qx = Math.max(B.x0, Math.min(B.x1, cx)), qy = Math.max(B.y0, Math.min(B.y1, cy));
    return { a0, a1: a0 + (TAU - gap), dmin: Math.hypot(qx - cx, qy - cy), dmax };
  }
  /* box（可省略）：只計算落在這個矩形附近的部分，畫面用它避免為畫面外的疇壁做大量取樣 */
  function domainWall(R, cands, box, e = 1.5){
    const { W, L, g } = R;
    if(!(g.h > .5)) return null;
    let P, arc = null;
    if(g.line) P = t => [g.p1x + (g.p2x - g.p1x)*t, g.p1y + (g.p2y - g.p1y)*t];
    else {
      const a1 = Math.atan2(g.p1y - g.cy, g.p1x - g.cx), vx = g.wx + g.ux*g.xv, vy = g.wy + g.uy*g.xv;
      const norm = a => { while(a < a1) a += TAU; while(a >= a1 + TAU) a -= TAU; return a; };
      let a2 = norm(Math.atan2(g.p2y - g.cy, g.p2x - g.cx)); const av = norm(Math.atan2(vy - g.cy, vx - g.cx));
      if(av > a2) a2 -= TAU;
      arc = { a1, a2 };
      P = t => { const a = a1 + (a2 - a1)*t; return [g.cx + Math.cos(a)*g.R, g.cy + Math.sin(a)*g.R]; };
    }
    // 法向量（用來在疇壁兩側各取一點）
    const N = t => {
      if(g.line){ const dx = g.p2x - g.p1x, dy = g.p2y - g.p1y, l = Math.hypot(dx, dy) || 1; return [-dy/l, dx/l]; }
      const [x, y] = P(t); return [(x - g.cx)/g.R, (y - g.cy)/g.R];
    };
    // 可見參數範圍 [T0, T1]
    let T0 = 0, T1 = 1;
    if(box){
      if(!arc){
        const [x0, y0] = P(0), [x1, y1] = P(1), dx = x1 - x0, dy = y1 - y0;
        for(const [pp, q] of [[-dx, x0 - box.x0], [dx, box.x1 - x0], [-dy, y0 - box.y0], [dy, box.y1 - y0]]){
          if(pp === 0){ if(q < 0) return { P, arc, g, segs: [] }; continue; }
          const r = q/pp; if(pp < 0) T0 = Math.max(T0, r); else T1 = Math.min(T1, r);
        }
      } else {
        const wd = boxWedge(g.cx, g.cy, box);
        if(wd){
          if(g.R < wd.dmin - 2 || g.R > wd.dmax + 2) return { P, arc, g, segs: [] };
          const lo = Math.min(arc.a1, arc.a2), hi = Math.max(arc.a1, arc.a2);
          // 弧與畫面角度範圍可能重疊兩段：取兩段的聯集（之前只取第一段，另一段若才是看得到的部分，疇壁就會突然消失）
          let a = Infinity, b = -Infinity;
          for(let k=-2;k<=2;k++){
            const s0 = Math.max(lo, wd.a0 + TAU*k), s1 = Math.min(hi, wd.a1 + TAU*k);
            if(s0 < s1){ const ta = (s0 - arc.a1)/(arc.a2 - arc.a1), tb = (s1 - arc.a1)/(arc.a2 - arc.a1); a = Math.min(a, ta, tb); b = Math.max(b, ta, tb); }
          }
          if(!(b > a)) return { P, arc, g, segs: [] };
          T0 = Math.max(0, a); T1 = Math.min(1, b);
        }
      }
      if(!(T1 > T0)) return { P, arc, g, segs: [] };
    }
    const rel = relevantCands(cands, W, L, e + 2);
    if(!rel.third) return { P, N, arc, g, segs: [[T0, T1]] };     // 附近沒有第三方：整段都是這兩個宇宙的交界
    const ok = t => { const [x, y] = P(t), [nx, ny] = N(t); return wallBetween(R, rel.cs, x, y, nx, ny, e); };
    return { P, N, arc, g, segs: sampleSegs(ok, T0, T1, curveSamples(P, T0, T1)) };
  }
  return { isAncestor, related, insideOf, arrival, wallGeom, beats, rule, otherOf, ownerIn, takes, buildRules, ownerAt, drawOrder, drawContains, cellRay, wallTaken, displayOwner, shellVisible, boxWedge, domainWall, mergeCurve };
})();
