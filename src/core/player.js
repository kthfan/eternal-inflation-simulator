/* 核心｜玩家宇宙（可控制的泡泡，docs/ROADMAP.md D 節）：誕生、操控、軌跡段、能量帳、接觸、曲速（D12）、再循環與遊戲結束（D13）。
   軌跡以「每步一段」的解析式保存（ctl 上的 SEG 欄位，每個欄位一個陣列），幾何由所在空間計算（space.js 的 seg）；
   每一步（playerStep）：更新接觸區間、累計曲速借貸、困住的倒數、結算能量帳、償還量子利息、由控制器決定下一段。 */
import { TAU, hash } from './math.js';
import { Territory } from './territory.js';
import { STEP, LONG, FALSE_EPS } from './constants.js';

/* 玩家宇宙（docs/ROADMAP.md D3、D4、D9 M3）：
   E0 初始能量（單位：Δε·RH²）、eta 能量轉換效率、k 半徑控制的回復率（1/秒）、minE 力竭後恢復控制所需的能量、
   recenter 玩家離原點超過幾個哈伯半徑就重新置中（焦點跟隨，D9 M4）、cell 能量帳取樣格點的間距（像素）、latticeMax 格點半徑格數上限（巨大的玩家宇宙改用較粗的格點）、downCost 向下穿隧技能的固定成本（向上穿隧的成本 = Δε × 區域面積） */
export const PLAYER = { E0: 5, eta: .8, k: 1.5, minE: .5, cell: 3.5, latticeMax: 16, downCost: .15, range: 1, recenter: .75,
  /* 曲速（D12）：k 預設倍率（×c）、kMax 上限（保證 A2 的丟棄仍精確：(1 + kMax)·RH 要小於 RGEN）；
     借貸速率 kappa·k²·(r/RH)²（Alcubierre：負能量 ∝ v²R²）；量子不等式：借貸速率 × 持續時間² ≤ Q；
     量子利息：結束後在 repayT 秒內償還 借貸 × (1 + 持續時間/TI) */
  warp: { k: 5, kMax: 15, kappa: .25, Q: 4, TI: 4, repayT: 1.5 },
  /* 再循環（D13）：在 Λ > 0 的口袋宇宙中，以自己為中心向上穿隧出半徑 margin × 當地哈伯半徑的假真空區域（大於哈伯半徑 → 永遠縮不掉、重新永恆暴脹）；
     所在處 Λ ≤ 0（無法再循環）持續 trapT 秒就遊戲結束 */
  recycle: { margin: 1.05, trapT: 8 } };

/* 軌跡段的欄位：時刻、起點 (x, y)（所在空間內的座標）、半徑、前進速度 (ux, uy)、曲速速度 (vx, vy)、泡壁速度 w、所在區域 reg（null 為根空間）、該空間的膨脹率 h。
   新增、覆寫、修剪都經過這份清單，欄位不會再彼此錯開 */
export const SEG = ['t', 'x', 'y', 'r', 'ux', 'uy', 'vx', 'vy', 'w', 'reg', 'h'];

export function installPlayer(W){
  const { U, p, VAC } = W, LH = W.LH, cLight = W.cLight;
  U.player = null;

  /* ---------- 軌跡段 ---------- */
  /* (x, y) 為物理位置；在區域空間（方案 B）時改存相對該區域錨點的偏移，並記下該空間的膨脹率 */
  function pushSeg(b, t, x, y, r, ux, uy, w, reg = null, vx = 0, vy = 0){
    const C = b.ctl, n = C.t.length, sp = W.regionSpace(reg), h = sp.h;
    if(sp.region) [x, y] = sp.toLocal(x, y, t);
    const rec = { t, x, y, r, ux, uy, vx, vy, w, reg, h };
    if(n && C.t[n-1] === t){ for(const k of SEG) C[k][n-1] = rec[k]; return; }
    for(const k of SEG) C[k].push(rec[k]);
  }
  /* 玩家宇宙的內部時間無法再用光錐的雙曲面公式（D7）；輕鬆模式下先不會大擠壓、熱寂 */
  W.initCtl = (b, forced, t) => {
    b.crunch = false; b.heatT = Infinity;
    b.ctl = { contacts: new Map(), in: { dx: 0, dy: 0, rT: b.r0 }, eta: forced.eta, mode: forced.mode, E: PLAYER.E0, exhausted: false, gain: 0, loss: 0,
      warp: null, repay: null, lastWarp: null };
    for(const k of SEG) b.ctl[k] = [];
    pushSeg(b, t, b.x, b.y, b.r0, 0, 0, 0);
    U.anyCtl = true;
  };
  /* 修剪回放視窗之前的軌跡段與接觸區間 */
  W.trimCtl = (b, cut) => {
    const C = b.ctl; let k = 0; while(k + 1 < C.t.length && C.t[k + 1] <= cut - 1) k++;
    if(k) for(const key of SEG) C[key].splice(0, k);
    for(const [id, arr] of C.contacts){ const kept = arr.filter(iv => iv[1] >= cut - LONG); if(kept.length) C.contacts.set(id, kept); else C.contacts.delete(id); }
  };
  /* 玩家所在的區域 = 「除了玩家以外」玩家中心點的擁有者（歸屬一律由 Territory 判斷）；null 為假真空 */
  function regionOf(b, t, c){
    const cs = []; for(const o of U.live) if(o !== b && o.tn <= t && o.texit > t) cs.push(U.circleAt(o, t));
    const own = Territory.ownerAt(U.frame(t), cs, c.cx, c.cy);
    return own ? own.b : null;
  }
  /* 玩家此刻所在的空間（原本的模型：一律是根空間，不必判斷區域） */
  const localSpace = (b, t, c) => LH ? W.regionSpace(regionOf(b, t, c)) : W.root;

  /* ---------- 誕生與操控 ----------
     · spawn { x, y, vac, r, eta, mode }：在假真空中誕生玩家宇宙。mode：'relaxed'（輕鬆，預設：能量可以透支，只限制技能）
       或 'survival'（生存：能量耗盡就力竭，泡壁回到以光速自由膨脹）（同時只有一個；舊的會被放手，之後像一般泡泡一樣以光速擴張）
     · steer { dx, dy, rT }：玩家的輸入 —— 前進方向（長度 ≤ 1）與目標半徑；核心依此決定每一步的 (u, w)，見 decide */
  W.onAction('spawn', (a, t, k) => {
    const V = VAC[a.vac];
    if(!V || !(V.eps < FALSE_EPS)) return { ok: false, reason: '玩家宇宙必須是比假真空低的真空' };
    if(!isFinite(a.x) || !isFinite(a.y)) return { ok: false, reason: '參數錯誤' };
    const r0 = a.r === undefined ? .3*p.RH : +a.r;
    if(!(r0 >= 2*p.R0 && r0 <= .8*p.RH)) return { ok: false, reason: '玩家宇宙的大小不合理' };
    const F = U.frame(t), circles = W.liveCircles(t);
    if(Territory.ownerAt(F, circles, a.x, a.y)) return { ok: false, reason: '玩家宇宙要誕生在假真空中' };
    for(let j=0;j<24;j++){
      const th = TAU*j/24;
      if(Territory.ownerAt(F, circles, a.x + Math.cos(th)*(r0 + 2), a.y + Math.sin(th)*(r0 + 2))) return { ok: false, reason: '範圍內已有其他宇宙' };
    }
    if(U.player) release(U.player, t);
    const eta = a.eta === undefined ? PLAYER.eta : Math.max(.05, Math.min(1, +a.eta));
    const mode = a.mode === 'survival' ? 'survival' : 'relaxed';
    const b = W.addBubble(a.x, a.y, Math.hypot(a.x, a.y), t, null, { vac: a.vac, s: 1, r0, seed: hash(p.seed, a.step, k), ctl: true, eta, mode });
    b.player = true; U.player = b;
    decide(b, t);
    return { ok: true, id: b.id };
  }, true);
  W.onAction('steer', a => {
    const P = U.player; if(!P) return { ok: false, reason: '沒有玩家宇宙' };
    let dx = +a.dx || 0, dy = +a.dy || 0; const m = Math.hypot(dx, dy); if(m > 1){ dx /= m; dy /= m; }
    const rT = a.rT === undefined ? P.ctl.in.rT : Math.max(2*p.R0, Math.min(.95*p.RH, +a.rT));
    P.ctl.in = { dx, dy, rT };
    return { ok: true };
  });

  /* ---------- 曲速（D12）----------
     空間本身的扭曲不受光速限制（前方收縮、後方膨脹，Alcubierre）：整個玩家宇宙連同內部的空間以 V = k·c 被搬動，
     泡壁相對被搬動的空間仍不超光速。代價是負能量（違反零能量條件），以「向真空借貸」表示：
     · 借貸速率 kappa·k²·(r/RH)²（越快、越大越貴）；量子不等式：借貸速率 × 持續時間² ≤ Q，到了上限自動結束
     · 量子利息：結束後必須在 repayT 秒內償還 借貸 × (1 + 持續時間/TI)（越久才還，利息越高），償還期間不能再啟動
     · 方向跟著玩家的輸入（鍵盤或滑鼠）改變，放開則維持原方向；可以隨時停下。碰到其他泡泡不會脫離：
       搬動的是空間本身，不轉手地盤；進入別的宇宙之後照一般規則（比你低的會吃掉你、比你高的被你吃掉）
     · warp { on: true, dx, dy, k }：啟動；warp { on: false }：停下 */
  const warpRate = (k, r) => PLAYER.warp.kappa*k*k*(r/p.RH)**2;
  function accrue(C, t, r){ const Wp = C.warp; Wp.B += warpRate(Wp.k, r)*Math.max(0, t - Wp.tAcc); Wp.tAcc = t; }
  function endWarp(b, t, why){
    const C = b.ctl, Wp = C.warp; if(!Wp) return;
    accrue(C, t, U.circleAt(b, t).r);
    const tau = t - Wp.t0, due = Wp.B*(1 + tau/PLAYER.warp.TI);
    C.warp = null;
    C.repay = due > 0 ? { left: due, rate: due/PLAYER.warp.repayT } : null;
    C.lastWarp = { t0: Wp.t0, t1: t, tau, k: Wp.k, borrowed: Wp.B, due, why };
  }
  W.onAction('warp', (a, t) => {
    const P = U.player; if(!P) return { ok: false, reason: '沒有玩家宇宙' };
    const C = P.ctl;
    if(!a.on){ if(!C.warp) return { ok: false, reason: '不在曲速中' }; endWarp(P, t, '手動'); return { ok: true }; }
    if(C.warp) return { ok: false, reason: '已在曲速中' };
    if(C.repay) return { ok: false, reason: '正在償還量子利息' };
    if(C.exhausted) return { ok: false, reason: '力竭中，無法啟動' };
    if(!(C.E > 0)) return { ok: false, reason: '能量透支中，無法再借貸負能量' };
    const c = U.circleAt(P, t), h = localSpace(P, t, c).h;
    if(h*c.r >= cLight) return { ok: false, reason: '失控中，無法啟動' };
    let dx = +a.dx || 0, dy = +a.dy || 0; const m = Math.hypot(dx, dy);
    if(!(m > 0)) return { ok: false, reason: '需要方向' };
    const k = Math.max(1, Math.min(PLAYER.warp.kMax, a.k === undefined ? PLAYER.warp.k : +a.k || PLAYER.warp.k));
    C.warp = { k, dx: dx/m, dy: dy/m, t0: t, tAcc: t, B: 0 };
    return { ok: true, k };
  });

  /* ---------- 再循環（D13）----------
     在 Λ > 0 的口袋宇宙中，以玩家為中心向上穿隧出「再循環假真空」：半徑 margin × 當地的哈伯半徑（所在空間的 hubble），
     大於哈伯半徑的區域被周圍往內推也縮不掉，反而繼續長大 → 內部以假真空的穿隧率重新開始永恆暴脹。成本 = Δε × 面積（與技能 2 相同）。
     Λ ≤ 0 的宇宙不能再循環：反德西特會塌縮、閔考斯基無法向上穿隧。 */
  const rfVac = VAC.findIndex(v => v.kind === 'rf');
  /* 再循環能否在此處使用：回傳 { Q, c, r0, cost } 或 { reason }。trapped 為 true 表示「物理上不可能」（所在處 Λ ≤ 0） */
  function recycleAt(P, t){
    const c = U.circleAt(P, t), Q = regionOf(P, t, c);
    if(!Q) return { reason: '你在假真空中，這裡仍在暴脹，不需要再循環' };
    const V = VAC[Q.vac];
    if(V.kind === 'rf') return { reason: '這裡已經是再循環的假真空' };
    if(V.kind === 'up') return { reason: '激發態區域比假真空還高，不需要再循環' };
    if(!(V.eps > 0) || U.crunchedAt(Q, c.cx, c.cy, t)) return { reason: '所在的宇宙 Λ ≤ 0：反德西特會塌縮、閔考斯基無法向上穿隧，無法再循環', trapped: true };
    if(V.eps < VAC[P.vac].eps) return { reason: '所在的宇宙真空能比你低（正在吞沒你），無法在這裡再循環' };
    const r0 = PLAYER.recycle.margin*W.regionSpace(Q).hubble;
    return { Q, c, r0, cost: (FALSE_EPS - V.eps)*Math.PI*r0*r0/(p.RH*p.RH) };
  }
  W.onAction('recycle', (a, t, k) => {
    const P = U.player; if(!P) return { ok: false, reason: '沒有玩家宇宙' };
    const R = recycleAt(P, t); if(R.reason) return { ok: false, reason: R.reason };
    const { Q, c, r0, cost } = R, F = U.frame(t), circles = W.liveCircles(t, P);
    // 整個區域必須在這個口袋宇宙的地盤內（不跨越其他宇宙）
    const qc = circles.find(o => o.b === Q);
    if(Territory.arrival(qc, c.cx, c.cy) > -(r0 + 2)) return { ok: false, reason: `口袋宇宙不夠大（需要半徑 ${(r0/p.RH).toFixed(2)} RH 的空間）` };
    for(let j=0;j<24;j++){
      const th = TAU*j/24, o = Territory.ownerAt(F, circles, c.cx + Math.cos(th)*(r0 + 2), c.cy + Math.sin(th)*(r0 + 2));
      if(!o || o.b !== Q) return { ok: false, reason: '範圍跨越了其他宇宙的地盤' };
    }
    if(P.ctl.E < cost) return { ok: false, reason: `能量不足（需要 ${cost.toFixed(2)}）` };
    const b = W.addBubble(c.cx, c.cy, Math.hypot(c.cx, c.cy), t, Q, { vac: rfVac, s: -1, r0, seed: hash(p.seed, a.step, k) });
    P.ctl.E -= cost; P.ctl.loss += cost;
    return { ok: true, id: b.id, cost, r0 };
  }, true);
  U.recycleCheck = () => U.player ? recycleAt(U.player, U.tSim) : null;     // 介面用：此刻能否再循環（不改變狀態）

  /* 放手：玩家宇宙變回一般的泡泡（泡壁以光速擴張、不再移動），之後依一般規則流出模擬範圍 */
  function release(b, t){
    b.player = false; if(U.player === b) U.player = null;
    const c = U.circleAt(b, t), C = b.ctl;
    C.warp = null; C.repay = null;
    pushSeg(b, t, c.cx, c.cy, c.r, 0, 0, cLight, C.reg[W.segIndex(C, t)]);
    C.free = true; C.releasedAt = t;
    if(W.regionSpace(C.reg[C.reg.length - 1]).region){ b.texit = Infinity; b.dyn = true; }   // 在區域空間內：由掃描判斷流出
    else b.texit = W.exitTime(1, Math.hypot(c.cx, c.cy), c.r, t);
  }

  /* 決定下一步 [t, t+STEP] 的控制：以 w 把半徑拉向目標（維持大小需 w = −h·r，h 為所在空間的膨脹率），剩下的光速額度給前進：|u| ≤ c − |w|。
     力竭時泡壁回到自然狀態：以光速擴張（w = c、u = 0），吞入假真空會補回能量。半徑 ≥ 當地的哈伯半徑時連維持大小都做不到（D4） */
  function decide(b, t){
    const C = b.ctl, c = cLight, cur = U.circleAt(b, t);
    const reg = LH ? regionOf(b, t, cur) : null, h = W.regionSpace(reg).h;
    let w, ux = 0, uy = 0;
    // 力竭期間目標半徑跟著實際半徑：恢復控制時維持當下的大小，而不是立刻花大量能量縮回去（縮小由玩家自己決定）。
    // 大於（當地的）哈伯半徑時連大小都維持不住（需要 w < −c）：失控，泡壁回到自然狀態
    if(C.warp && (C.exhausted || h*cur.r >= c)) endWarp(b, t, C.exhausted ? '力竭' : '失控');
    let vx = 0, vy = 0;
    if(C.exhausted || h*cur.r >= c){ w = c; C.in.rT = Math.max(2*p.R0, Math.min(.95*p.RH, cur.r)); }
    else {
      w = Math.max(-c, Math.min(c, -h*cur.r + PLAYER.k*(C.in.rT - cur.r)));
      if(C.warp){
        // 曲速：方向跟著輸入（放開則維持），玩家自己的前進速度 u 不用（移動全靠搬動空間）
        const m = Math.hypot(C.in.dx, C.in.dy); if(m > 0){ C.warp.dx = C.in.dx/m; C.warp.dy = C.in.dy/m; }
        vx = C.warp.dx*C.warp.k*c; vy = C.warp.dy*C.warp.k*c;
      }
      else {
        const um = c - Math.abs(w), m = Math.hypot(C.in.dx, C.in.dy);
        if(m > 0){ const f = Math.min(1, m)*um/m; ux = C.in.dx*f; uy = C.in.dy*f; }
      }
    }
    pushSeg(b, t, cur.cx, cur.cy, cur.r, ux, uy, w, reg, vx, vy);
  }

  /* 能量帳（D3）：在 [t−STEP, t] 期間，玩家宇宙與其他宇宙（或假真空）之間轉手的地盤 × 真空能差。
     以隨所在空間流動的格點取樣（背景膨脹本身不算），歸屬一律由 Territory.ownerAt 判斷。
     曲速時空間連同玩家一起被搬動（V），格點也跟著搬：搬動本身不轉手地盤，只有泡壁相對空間的運動（u、w）才算。
     · 吞入真空能較高的地盤：得到 Δε × 面積 × η
     · 退回給真空能較高者（收縮、移動時的後方）：付出 Δε × 面積 ÷ η
     · 被真空能較低者奪走：被奪走 Δε × 面積
     · 硬擠進真空能較低者：付出 Δε × 面積 ÷ η */
  function ledger(b, t){
    const t0 = t - STEP; if(b.tn > t0 + 1e-9) return;
    const C = b.ctl, c0 = U.circleAt(b, t0), c1 = U.circleAt(b, t);
    const si = W.segIndex(C, t0 + STEP/2), hr = C.h[si], e = Math.exp(hr*STEP);   // 取這一步中點所在的段（t − STEP 的浮點誤差可能落到前一段）
    const g = hr > 1e-9 ? (e - 1)/hr : STEP, Vx = C.vx[si]*g, Vy = C.vy[si]*g;
    const adv = W.regionSpace(C.reg[si]).advector(t0, t, e, Vx, Vy);
    const Rs = Math.max(c0.r, c1.r) + 6, n = Math.max(4, Math.min(PLAYER.latticeMax, Math.ceil(Rs/PLAYER.cell))), sp = Rs/n;
    const near = (tt, cx, cy, R) => { const out = []; for(const o of U.live) if(o.tn <= tt && o.texit > tt){ const c = U.circleAt(o, tt); if(Math.hypot(c.cx - cx, c.cy - cy) < c.r + R) out.push(c); } return out; };
    const [a1x, a1y] = adv(c0.cx, c0.cy);
    const own0 = Territory.locator(U.frame(t0), near(t0, c0.cx, c0.cy, Rs + 2)), own1 = Territory.locator(U.frame(t), near(t, a1x, a1y, Rs*e + 2));
    // 格點偏移以黃金比例逐步變化：長時間平均不偏
    const ox = ((U.stepN*.6180339887) % 1)*sp, oy = ((U.stepN*.7548776662) % 1)*sp, wA = sp*sp*e*e/(p.RH*p.RH);
    const eP = VAC[b.vac].eps, eOf = o => o ? VAC[o.b.vac].eps : FALSE_EPS;
    let own = 0;
    for(let i=-n-1;i<=n;i++) for(let j=-n-1;j<=n;j++){
      const dx = i*sp + ox, dy = j*sp + oy; if(dx*dx + dy*dy > Rs*Rs) continue;
      const x = c0.cx + dx, y = c0.cy + dy;
      const [x1, y1] = adv(x, y), o0 = own0(x, y), o1 = own1(x1, y1);
      const a0 = o0 ? o0.b : null, a1 = o1 ? o1.b : null;
      if(a1 === b) own++;
      if(a0 === a1 || (a0 !== b && a1 !== b)) continue;
      let dE;
      if(a1 === b){ const d = (eOf(o0) - eP)*wA; dE = d > 0 ? d*C.eta : d/C.eta; }
      else { const d = (eOf(o1) - eP)*wA; dE = d > 0 ? -d/C.eta : d; }
      C.E += dE; if(dE > 0) C.gain += dE; else C.loss -= dE;
    }
    if(C.mode === 'survival'){
      if(C.E <= 0) C.exhausted = true;
      else if(C.E >= PLAYER.minE) C.exhausted = false;
    }
    // 地盤全部被奪走（連續 0.5 秒取樣不到自己）：玩家宇宙被吞沒，放手
    C.gone = own ? 0 : (C.gone || 0) + STEP;
    if(C.gone >= .5){ C.fate = 'eaten'; release(b, t); b.texit = t + STEP/2; }   // 已經沒有地盤：從下一步起移除（不會再「復活」）
  }

  /* 接觸紀錄：可控制的泡泡與其他泡泡的接觸區間 [開始, 結束]（疇壁位移從每段接觸的開始算起） */
  function contacts(b, t){
    const C = b.ctl, cb = U.circleAt(b, t), t0 = t - STEP;
    for(const o of U.live){
      if(o === b || o.tn > t || o.texit <= t) continue;
      const co = U.circleAt(o, t), ov = Math.hypot(cb.cx - co.cx, cb.cy - co.cy) < cb.r + co.r;
      let arr = C.contacts.get(o.id); const open = arr && arr[arr.length - 1][1] === Infinity;
      if(ov === !!open) continue;
      const f = tt => { const A = U.circleAt(b, tt), B = U.circleAt(o, tt); return Math.hypot(A.cx - B.cx, A.cy - B.cy) - A.r - B.r; };
      let lo = Math.max(t0, b.tn, o.tn), hi = t;
      if(ov){
        if(f(lo) <= 0) hi = lo;
        else for(let i=0;i<30;i++){ const m = (lo + hi)/2; if(f(m) > 0) lo = m; else hi = m; }
        if(!arr) C.contacts.set(o.id, arr = []);
        arr.push([hi, Infinity]);
      } else {
        for(let i=0;i<30;i++){ const m = (lo + hi)/2; if(f(m) <= 0) lo = m; else hi = m; }
        arr[arr.length - 1][1] = lo;
      }
    }
  }

  /* 每一步：更新所有可控制泡泡的接觸；玩家宇宙結算能量帳、曲速的借貸與量子利息、困住的倒數，並決定下一步的控制 */
  W.playerStep = t => {
    for(const b of U.live) if(b.ctl && b.texit > t) contacts(b, t);
    const P = U.player;
    if(!P) return;
    const C = P.ctl;
    if(C.warp){
      // 累計借貸，到了量子不等式的上限（借貸速率 × 持續時間² ≤ Q）就結束
      const r = U.circleAt(P, t).r; accrue(C, t, r); const tau = t - C.warp.t0;
      if(warpRate(C.warp.k, r)*tau*tau >= PLAYER.warp.Q) endWarp(P, t, '量子不等式的上限');
    }
    // 困住（D13）：所在處 Λ ≤ 0、物理上無法再循環，持續 trapT 秒就遊戲結束（期間可用曲速逃出）
    C.trap = recycleAt(P, t).trapped ? (C.trap || 0) + STEP : 0;
    if(C.trap >= PLAYER.recycle.trapT){ C.fate = 'trapped'; release(P, t); return; }
    ledger(P, t);
    if(C.repay && U.player === P){
      // 償還量子利息（正能量脈衝）：在 repayT 秒內平均扣除
      const pay = Math.min(C.repay.left, C.repay.rate*STEP);
      C.E -= pay; C.loss += pay; C.repay.left -= pay;
      if(C.repay.left <= 1e-12) C.repay = null;
      if(C.mode === 'survival' && C.E <= 0) C.exhausted = true;
    }
    if(U.player === P) decide(P, t);
  };
}
