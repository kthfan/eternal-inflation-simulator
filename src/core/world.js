/* 核心｜世界：泡泡的誕生（自然成核與指定成核）、存活清單、歸屬查詢、內部時間（大擠壓、熱寂）、流出與退場、歷史保留。 */
import { TAU, poisson } from './math.js';
import { Territory } from './territory.js';
import { STEP, LONG, BUCKET, MAXB, FALSE_EPS } from './constants.js';

export function installWorld(W){
  const { U, p, tune, VAC, rng } = W;
  const maxInner = Math.max(0, ...VAC.map(v => v.grel));

  U.bornBy = t => { const h = U.hist; let lo = 0, hi = h.length; while(lo < hi){ const m = (lo + hi) >> 1; if(h[m].tn <= t) lo = m + 1; else hi = m; } return lo; };
  U.born = t => U.trimmed + U.bornBy(t);
  /* 時刻 t 仍存活的泡泡（直播或回放共用同一個入口） */
  U.aliveAt = t => {
    if(t >= U.tSim - 1e-9) return U.live.filter(b => b.tn <= t && b.texit > t);
    const out = U.longs.filter(b => b.tn <= t && b.texit > t);
    for(let i = U.bornBy(t) - 1; i >= 0; i--){ const b = U.hist[i]; if(b.tn < t - LONG) break; if(!b.long && b.texit > t) out.push(b); }
    return out;
  };
  /* 某一點屬於哪個宇宙：一律由 Territory 決定（就是畫面上最後畫到的那一個） */
  U.ownerAt = (x, y, t) => Territory.ownerAt(U.frame(t), U.aliveAt(t).map(b => U.circleAt(b, t)), x, y);
  /* 此刻仍存活（排除 skip）的所有圓：動作與玩家的判斷用 */
  W.liveCircles = (t, skip = null) => { const out = []; for(const b of U.live) if(b.texit > t && b !== skip) out.push(U.circleAt(b, t)); return out; };
  U.crunchedAt = (b, x, y, t) => {
    if(!b.crunch) return false;
    const c = U.circleAt(b, t), xx = Math.min(1, Math.hypot(x - c.cx, y - c.cy)/c.r);
    return (t - b.tn)*Math.sqrt(1 - xx*xx) >= b.crunchT;
  };
  /* 內部時間 τ = 年齡·√(1−x²)（與大擠壓相同的同時性），超過 heatT 即進入熱寂 */
  U.heatAt = (b, x, y, t) => {
    if(!isFinite(b.heatT)) return false;
    const c = U.circleAt(b, t), xx = Math.min(1, Math.hypot(x - c.cx, y - c.cy)/c.r);
    return (t - b.tn)*Math.sqrt(1 - xx*xx) >= b.heatT;
  };
  U.observer = t => {
    const o = U.ownerAt(0, 0, t);
    if(!o) return { kind:'false' };
    if(U.crunchedAt(o.b, 0, 0, t)) return { kind:'crunch', b:o.b };
    if(U.heatAt(o.b, 0, 0, t)) return { kind:'heat', b:o.b };
    return { kind:'pocket', b:o.b, V:VAC[o.b.vac] };
  };

  /* 何時流出模擬範圍（或縮成一點）：根空間中的泡泡在 t0 時中心離原點 d、半徑 r0、泡壁方向 s，之後中心隨哈伯流、泡壁以光速。
     · 擴張：近側邊緣 = E·(d − r0 − RH) + RH，超過 RGEN + 60 就流出；d < r0 + RH 的泡泡會吞沒原點，永遠不會流出
     · 收縮：r0 < RH 時在 (1/H)·ln(RH/(RH−r0)) 後縮成一點；近側邊緣 = E·(d − r0 + RH) − RH
     區域空間（方案 B）中的泡泡沒有解析式，由 space.js 的 sweep 掃描判斷 */
  function exitTime(s, d, r0, t0){
    if(s > 0){ const den = d - r0 - p.RH; return den > 0 ? t0 + Math.log((p.RGEN + 60 - p.RH)/den)/p.H : Infinity; }
    const tc = r0 < p.RH ? t0 + Math.log(p.RH/(p.RH - r0))/p.H : Infinity, den = d - r0 + p.RH;
    return Math.min(tc, den > 0 ? t0 + Math.log((p.RGEN + 60 + p.RH)/den)/p.H : Infinity);
  }
  W.exitTime = exitTime;

  /* 誕生：自然成核時依母宇宙以下的真空權重抽樣；forced（使用者動作）：{ vac, s, r0, seed, ctl, … } 直接指定，不消耗主亂數序列 */
  function addBubble(x, y, d, t, parent, forced){
    let vac = 0, seed;
    if(forced){ vac = forced.vac; seed = forced.seed; }
    else {
      const pe = parent ? VAC[parent.vac].eps : FALSE_EPS;
      let tot = 0; for(const v of VAC) if(v.eps < pe) tot += v.w;
      if(tot <= 0) return null;
      let pick = rng()*tot;
      for(const v of VAC){ if(v.eps < pe){ pick -= v.w; if(pick <= 0){ vac = v.i; break; } } }
      seed = rng();
    }
    const V = VAC[vac], s = forced ? forced.s : 1, r0 = forced ? forced.r0 : p.R0;
    const b = { id: U.nextId++, tn: t, x, y, d, vac, seed, parent: parent || null, depth: parent ? parent.depth + 1 : 0, s, r0,
      crunch: V.kind === 'ads', crunchT: V.crunchT, heatT: V.hdT, texit: 0 };
    const sp = W.regionSpace(parent);
    b.texit = sp.region ? sp.place(b, x, y, t) : exitTime(s, d, r0, t);
    if(forced) b.act = true;
    if(forced && forced.ctl){ b.texit = Infinity; W.initCtl(b, forced, t); }   // 玩家宇宙：一直保留（之後由焦點跟隨處理，見 D9 M4）
    b.long = b.dyn || !(b.texit - t <= LONG);
    U.hist.push(b); U.live.push(b); if(b.long) U.longs.push(b);
    U.vacCount[vac]++;
    W.notify('born', b);
    const k = Math.floor(t/BUCKET) - U.bucketBase; while(U.buckets.length <= k) U.buckets.push(0); U.buckets[k]++;
    return b;
  }
  W.addBubble = addBubble;

  /* 成核：以最大可能穿隧率撒點，再依該點所屬真空的穿隧率接受。歸屬判斷與畫面使用同一個 Territory.ownerAt */
  W.nucleate = () => {
    const t = U.tSim, gmax = Math.max(1, maxInner*tune.innerMul);
    const n = poisson(rng, tune.gamma*gmax*Math.PI*p.RGEN*p.RGEN*STEP);
    if(!n) return;
    const F = U.frame(t), circles = W.liveCircles(t);
    const pc = U.player ? U.circleAt(U.player, t) : null;
    for(let i=0;i<n;i++){
      const rr = p.RGEN*Math.sqrt(rng()), ang = rng()*TAU, u = rng();
      // 後選模式：會吞沒觀測者的泡泡不在這條世界線的過去。有玩家宇宙時原點跟著玩家（焦點跟隨），等於後選「玩家附近仍在暴脹」的世界線：
      // 否則典型的世界線幾乎必然落入某個口袋宇宙 —— 泡壁以光速擴張，比光速慢的玩家逃不掉，整個區域很快變成不再暴脹的死寂宇宙
      if(!p.typical && !pc && rr < p.RH + p.R0 + 3) continue;
      const x = Math.cos(ang)*rr, y = Math.sin(ang)*rr;
      // 有玩家時，後選的對象是玩家：誕生點離玩家泡壁不到一個哈伯半徑的泡泡（玩家靜止時會被它吞沒）不在這條世界線的過去
      if(!p.typical && pc && Math.hypot(x - pc.cx, y - pc.cy) < pc.r + p.RH + p.R0 + 3) continue;
      const own = Territory.ownerAt(F, circles, x, y);
      let rel = 1;
      if(own && own.b.player) continue;                      // 不在玩家宇宙內成核
      if(own){
        if(Territory.arrival(own, x, y) > -p.R0*2) continue;   // 太貼近泡壁的地方不成核
        rel = VAC[own.b.vac].kind === 'rf' ? 1 : VAC[own.b.vac].grel*tune.innerMul;   // 再循環假真空：與假真空相同
      }
      if(u*gmax >= rel) continue;
      const b = addBubble(x, y, rr, t, own ? own.b : null);
      if(b) circles.push(U.circleAt(b, t));
    }
  };

  /* 退場：永遠不會流出模擬範圍的巨大泡泡（吞沒了觀測者的那些），一旦在整個模擬範圍內已經不可能再擁有任何地盤，就讓它退場。
     否則它們會一層層累積、半徑無限增長，彼此之間的幾何計算終究會失去精度，造成歸屬來回跳動與繪製變慢。
     判斷條件（三者任一）：被自己的子孫完整覆蓋；被一個勝過它的宇宙以疇壁完整佔據；或與同種真空的另一個泡泡都已覆蓋整個範圍（保留較早誕生者）。 */
  W.retire = () => {
    const t = U.tSim, Rg = p.RGEN + 200;
    const live = U.live.filter(b => b.texit > t && b.tn < t);
    if(live.length < 2) return;
    const C = new Map(live.map(b => [b, U.circleAt(b, t)]));
    const covers = c => Math.hypot(c.cx, c.cy) + Rg < c.r;
    const ring = []; for(let k=0;k<48;k++) ring.push([Math.cos(TAU*k/48)*Rg, Math.sin(TAU*k/48)*Rg]); ring.push([0, 0]);
    const F = U.frame(t);
    for(const b of live){
      if(isFinite(b.texit) || b.player) continue;          // 玩家宇宙不退場
      const cb = C.get(b);
      for(const o of live){
        if(o === b) continue;
        const co = C.get(o);
        if(!covers(co)) continue;
        let gone = false;
        if(Territory.isAncestor(b, o)) gone = true;
        else if(!Territory.related(b, o)){
          // 用與畫面、成核完全相同的規則判斷（包含「光錐被包住時沿用祖先疇壁」的情況）
          const R = Territory.rule(F, co, cb);
          if(!R) gone = false;
          else if(R.kind === 'merge') gone = covers(cb) && (o.tn < b.tn || (o.tn === b.tn && o.id < b.id));
          else if(R.kind === 'wall') gone = R.W === co && ring.every(([x, y]) => Territory.arrival(cb, x, y) >= 0 || !R.g.lSide(x, y));
          else if(R.kind === 'inherit'){
            if(R.X === cb) gone = !R.free && (!R.g || ring.every(([x, y]) => !R.g.lSide(x, y)));
            else gone = !!R.free;      // o 在 b 的光錐內且不受 b 限制，又已覆蓋整個範圍：b 再也拿不到地盤
          }
        }
        if(gone){ b.texit = t + STEP/2; b.retired = true; W.notify('retire', b); break; }   // 從下一步起退場（這一步誕生的泡泡仍看得到它）
      }
    }
  };

  /* 只保留回放視窗內的歷史：一般泡泡壽命不超過 LONG，視窗前 LONG 秒以前的可以丟；長壽泡泡另存在 longs */
  U.trim = () => {
    const tl = U.tLive;
    let cut = tl - U.window;
    if(U.hist.length > MAXB) cut = Math.max(cut, U.hist[U.hist.length - Math.floor(MAXB*.9)].tn + LONG + 1);
    cut = Math.min(cut, tl - 5);
    if(cut <= U.tStart + .5) return;
    U.tStart = cut;
    const idx = U.bornBy(cut - LONG - 1);
    if(idx > 0){ U.hist.splice(0, idx); U.trimmed += idx; }
    if(U.longs.some(b => b.texit <= cut)) U.longs = U.longs.filter(b => b.texit > cut);
    for(const b of U.longs) if(b.ctl) W.trimCtl(b, cut);
    const kb = Math.floor(cut/BUCKET) - U.bucketBase;
    if(kb > 0){ U.buckets.splice(0, kb); U.bucketBase += kb; }
  };
}
