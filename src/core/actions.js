/* 核心｜動作紀錄（使用者介入）：
   U.act(a) 把動作排進「下一步」的開頭套用（固定步長邊界），並記錄在 U.actions。
   動作本身不消耗主亂數序列（需要亂數時用 hash(種子, 步數, 序號)），所以沒有動作時的歷史與原本逐位元相同；
   相同種子 + 相同動作紀錄（含步數）→ 相同歷史。被拒絕的動作也留在紀錄裡，重播時會得到相同的拒絕結果。
   各模組以 W.onAction(type, fn, seeded) 註冊自己的動作；seeded 為 true 的動作會拿到同一步內的序號 k（用來產生亂數種子）。
   這裡註冊的動作：
   · nucleate { x, y, vac, r, by }：在物理座標 (x, y) 穿隧成真空 vac。擁有者一律由 Territory.ownerAt 決定。
     目標真空比所在處低 → 一般泡泡（初始半徑 R0）；比所在處高 → 向上穿隧的收縮泡泡（初始半徑 r）。by: 'player' 為玩家技能（扣能量）。
   玩家的動作（spawn、steer、warp、recycle）見 player.js。 */
import { TAU, hash } from './math.js';
import { Territory } from './territory.js';
import { FALSE_EPS } from './constants.js';
import { PLAYER } from './player.js';

export function installActions(W, replay){
  const { U, p, VAC } = W;
  const handlers = new Map();
  W.onAction = (type, fn, seeded = false) => handlers.set(type, { fn, seeded });

  U.actions = [];
  let pendingAct = 0, actSeq = 0;
  const queueAct = a => {
    a.seq = actSeq++;
    let i = U.actions.length; while(i > pendingAct && U.actions[i-1].step > a.step) i--;
    U.actions.splice(i, 0, a);
    return a;
  };
  U.act = a => queueAct({ ...a, step: U.stepN + 1, t: undefined, result: undefined });
  /* 可序列化的動作紀錄（重播、匯出用） */
  U.actionLog = () => U.actions.map(({ t, result, seq, ...rest }) => rest);
  for(const a of (replay || []).slice().sort((p1, p2) => p1.step - p2.step)) queueAct({ ...a, t: undefined, result: undefined });
  U.pendingActions = () => U.actions.slice(pendingAct);
  W.hasPending = () => pendingAct < U.actions.length;

  /* 在步進的開頭套用這一步的動作 */
  W.applyActions = step => {
    let k = 0;
    while(pendingAct < U.actions.length && U.actions[pendingAct].step <= step){
      const a = U.actions[pendingAct++], h = handlers.get(a.type);
      a.t = U.tSim;
      a.result = !h ? { ok: false, reason: '未知的動作' } : h.seeded ? h.fn(a, U.tSim, k++) : h.fn(a, U.tSim);
      W.notify('act', a);
    }
  };

  W.onAction('nucleate', (a, t, k) => {
    const V = VAC[a.vac];
    if(!V || !isFinite(a.x) || !isFinite(a.y)) return { ok: false, reason: '參數錯誤' };
    const F = U.frame(t), circles = W.liveCircles(t);
    const own = Territory.ownerAt(F, circles, a.x, a.y), pe = own ? VAC[own.b.vac].eps : FALSE_EPS;
    if(own && own.b.player) return { ok: false, reason: '不能放在玩家宇宙裡' };
    if(own && U.crunchedAt(own.b, a.x, a.y, t)) return { ok: false, reason: '這裡已走到大擠壓，時空已經結束' };
    const P = a.by === 'player' ? U.player : null;
    if(a.by === 'player'){
      if(!P) return { ok: false, reason: '沒有玩家宇宙' };
      if(P.ctl.exhausted) return { ok: false, reason: '力竭中，無法施放' };
      const pc = U.circleAt(P, t);
      if(Math.hypot(a.x - pc.cx, a.y - pc.cy) - pc.r > PLAYER.range*p.RH) return { ok: false, reason: '超出影響範圍（泡壁外一個哈伯半徑）' };
    }
    if(V.eps === pe) return { ok: false, reason: '這裡已經是這種真空' };
    const up = V.eps > pe;
    let r0 = p.R0;
    if(up){
      r0 = a.r === undefined ? .4*p.RH : +a.r;
      if(!(r0 >= 2*p.R0 && r0 <= 3*p.RH)) return { ok: false, reason: '向上穿隧區域的大小不合理' };
    }
    // 整個新泡泡必須落在同一個宇宙的地盤內（向上穿隧區域較大，要檢查一圈）；一般泡泡則與自然成核相同：不能太貼近泡壁
    if(own && Territory.arrival(own, a.x, a.y) > -(up ? r0 + 2 : p.R0*2)) return { ok: false, reason: '太靠近泡壁' };
    if(up){
      for(let j=0;j<24;j++){
        const th = TAU*j/24, o = Territory.ownerAt(F, circles, a.x + Math.cos(th)*(r0 + 2), a.y + Math.sin(th)*(r0 + 2));
        if((o ? o.b : null) !== (own ? own.b : null)) return { ok: false, reason: '範圍跨越了其他宇宙的地盤' };
      }
    }
    // 玩家技能的成本：向上穿隧 = 把該區域推高所需的能量 Δε × 面積；向下穿隧 = 固定的活化成本
    const cost = P ? (up ? (V.eps - pe)*Math.PI*r0*r0/(p.RH*p.RH) : PLAYER.downCost) : 0;
    if(P && P.ctl.E < cost) return { ok: false, reason: `能量不足（需要 ${cost.toFixed(2)}）` };
    const b = W.addBubble(a.x, a.y, Math.hypot(a.x, a.y), t, own ? own.b : null, { vac: a.vac, s: up ? -1 : 1, r0, seed: hash(p.seed, a.step, k) });
    if(P){ P.ctl.E -= cost; P.ctl.loss += cost; }
    return { ok: true, id: b.id, up, cost };
  }, true);
}
