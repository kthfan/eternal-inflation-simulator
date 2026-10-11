/* 核心｜自我檢查：動作紀錄與使用者介入（重播、手動成核、向上穿隧） */
import { TAU, mulberry32 } from '../math.js';
import { Territory } from '../territory.js';
import { STEP, createUniverse } from '../universe.js';

export default h => {
  const { baseP, baseT, buildRules, ownerMismatch, rayMismatch, actionUniverse } = h;
  return [
    { name: '動作紀錄可重現', desc: '同一個種子加上同一份動作紀錄（以不同的時間切分重播）必須得到完全相同的歷史與動作結果；動作之前的歷史與沒有動作時完全相同（動作不消耗主亂數）', run(){
      const A = actionUniverse(4242), T = A.tSim;
      const B = createUniverse(baseP, baseT(), { actions: A.actionLog() });
      while(B.tSim < T - 1e-9) B.advance(Math.min(.3711, T - B.tSim + 1e-9));
      const res = U => U.actions.map(a => a.result ? (a.result.ok ? 'ok' + a.result.id : a.result.reason) : '-').join(',');
      const same = A.fingerprint(T) === B.fingerprint(T) && res(A) === res(B);
      const P0 = createUniverse(baseP, baseT()); P0.presim(25);
      const t1 = A.actions[0].t - STEP/2, pre = A.fingerprint(t1) === P0.fingerprint(t1) && A.fingerprint(t1).length > 0;
      const ok = A.actions.filter(a => a.result && a.result.ok).length;
      return { pass: same && pre && ok > 20, detail: `${A.actions.length} 個動作（成功 ${ok}）重播${same ? '完全一致' : '不一致'}；第一個動作之前的歷史${pre ? '與無動作時相同' : '不同'}` };
    }},
    { name: '手動成核合法性', desc: '使用者放的泡泡：母宇宙必須是放置處的擁有者；比母宇宙高的真空必定是收縮泡泡，並在預期時刻縮成一點後消失；自然成核不會發生在向上穿隧的區域內', run(){
      let bad = 0, upBad = 0, gone = 0, natUp = 0, crunchBad = 0, n = 0, nUp = 0, hidden = 0;
      for(const seed of [4242, 99]){
        const U = actionUniverse(seed);
        for(const b of U.hist){
          if(b.parent && U.VAC[b.parent.vac].kind === 'up' && !b.act) natUp++;
          if(!b.act) continue;
          const t = b.tn, F = U.frame(t), cs = U.aliveAt(t).filter(o => o.id < b.id).map(o => U.circleAt(o, t));
          const own = Territory.ownerAt(F, cs, b.x, b.y); n++;
          if((own ? own.b : null) !== b.parent) bad++;
          // 剛誕生時，新泡泡必須真的顯示在最上層（向上穿隧的子泡泡比母宇宙高，不能被畫在母宇宙底下）
          const c1 = U.circleAt(b, b.tn + STEP), o1 = U.ownerAt(c1.cx, c1.cy, b.tn + STEP);   // 中心會隨哈伯流移動
          if(b.texit > b.tn + STEP && !(o1 && (o1.b === b || Territory.isAncestor(b, o1.b)))) hidden++;
          const pe = b.parent ? U.VAC[b.parent.vac].eps : 1, up = U.VAC[b.vac].eps > pe;
          if(up !== (b.s < 0)) upBad++;
          if(b.s < 0 && b.r0 < U.p.RH){
            nUp++;
            // 預期在 tc 縮成一點；若先流出模擬範圍，texit 會更早
            const tc = b.tn + Math.log(U.p.RH/(U.p.RH - b.r0))/U.p.H;
            if(b.texit > tc + 1e-9 || U.circleAt(b, tc).r > 1e-6*U.p.RH || U.aliveAt(b.texit + STEP).includes(b)) gone++;
          }
        }
        for(const a of U.actions){
          if(!a.result || a.result.ok || !/大擠壓/.test(a.result.reason)) continue;
          const o = U.ownerAt(a.x, a.y, a.t);
          if(!o || !U.crunchedAt(o.b, a.x, a.y, a.t)) crunchBad++;
        }
      }
      return { pass: n > 50 && nUp > 20 && !bad && !upBad && !gone && !natUp && !crunchBad && !hidden,
        detail: `檢查 ${n} 個使用者泡泡（收縮 ${nUp}）：歸屬不符 ${bad}、誕生後被蓋住 ${hidden}、收縮方向錯誤 ${upBad}、未如期消失 ${gone}、向上穿隧區內自然成核 ${natUp}、大擠壓判斷錯誤 ${crunchBad}` };
    }},
    { name: '向上穿隧的歸屬一致', desc: '有向上穿隧（子泡泡比母宇宙高、輸家畫在贏家之後）時：物理與畫面歸屬一致、射線邊界與逐點判斷吻合，且這種情況確實有被測到', run(){
      let mis = 0, n = 0, bad = 0, rays = 0, lyN = 0, sides = 0, sideBad = 0;
      for(const seed of [4242, 99]){
        const U = actionUniverse(seed), r = mulberry32(seed + 3);
        for(let t = 30; t <= U.tSim; t += 2){
          const { cs } = buildRules(U, t);
          const ly = new Set(), lyR = new Set(); for(const c of cs) for(const R of c.rules) if(R.lYield){ ly.add(R.L); lyR.add(R); }
          lyN += ly.size;
          // 輸家後畫時，疇壁兩側仍須各歸其主：只有這兩個宇宙（與祖先）涵蓋的點，贏家側不能顯示輸家，輸家側必須顯示輸家
          for(const R of lyR){
            const { W, L } = R, kin = c => c === W || c === L || Territory.isAncestor(c.b, W.b) || Territory.isAncestor(c.b, L.b);
            for(let k=0;k<60;k++){
              const a = r()*TAU, rr = L.r*Math.sqrt(r()), x = L.cx + Math.cos(a)*rr, y = L.cy + Math.sin(a)*rr;
              if(Territory.arrival(W, x, y) >= 0 || cs.some(c => !kin(c) && Territory.arrival(c, x, y) < 0)) continue;
              const o = U.ownerAt(x, y, t), wantL = !R.cE && R.g.lSide(x, y);
              sides++; if(((o && o.b) === L.b) !== wantL) sideBad++;
            }
          }
          mis += ownerMismatch(U, t, r, 600); n += 600;
          // 射線檢查只針對向上穿隧的家族（含其輸家）
          const upLine = c => ly.has(c) || c.b.s < 0 || (c.b.parent && U.VAC[c.b.vac].eps > U.VAC[c.b.parent.vac].eps);
          const m = rayMismatch(cs, r, upLine, 16); bad += m.bad; rays += m.n;
        }
      }
      return { pass: lyN > 0 && rays > 100 && sides > 50 && mis/n < .002 && bad/rays < .01 && !sideBad,
        detail: `輸家後畫的情況 ${lyN} 次（疇壁兩側取樣 ${sides} 點，歸屬錯誤 ${sideBad}）；${n} 個取樣點中 ${mis} 個不一致；${rays} 條射線中 ${bad} 條不吻合（${(bad/Math.max(1,rays)*100).toFixed(2)}%）` };
    }},
  ];
};
