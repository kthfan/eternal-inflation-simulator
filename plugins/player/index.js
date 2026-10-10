/* 玩家宇宙外掛（遊戲版雛形，docs/ROADMAP.md D 節 M3）：玩家是一個有自我意識的口袋宇宙。
   · 挑選真空後「誕生」；WASD／方向鍵控制膨脹方向（前脹後縮 → 前進），Q／E 縮小／放大目標半徑
   · 能量來自吞入真空能較高的地盤；維持大小、移動、技能都要花能量；力竭時泡壁回到以光速自由膨脹
   · 技能（在游標處）：1 = 向下穿隧（放下較低真空的泡泡）、2 = 向上穿隧（激發態區域，會收縮消失）
   · 3 = 曲速（D12）：搬動空間本身，可超過光速；向真空借貸負能量，結束後連同量子利息償還；方向跟著輸入改變
   · 4 = 再循環（D13）：在 Λ > 0 的口袋宇宙中，以自己為中心向上穿隧回假真空，重新開始永恆暴脹。
     困在 Λ ≤ 0 的宇宙（無法再循環）超過一段時間就遊戲結束
   · 按住滑鼠右鍵：朝游標方向前進（與方向鍵相同，也能改變曲速的方向）
   · 空白鍵暫停／繼續演化；遊戲進行中不能回看（只能在直播時操作）
   所有操作都經由核心的動作紀錄（api.act），物理與能量帳都在核心計算，相同種子 + 相同動作紀錄可完整重播。 */
export function player(){
  let api, panel, mx = -1, my = -1, follow = true, seenWarp = null, mouseSteer = null;   // mouseSteer：按住右鍵時的 pointerId
  const keys = new Set();
  let sent = { dx: 0, dy: 0, rT: 0 }, rT = 0, rTdir = 0, msg = '', msgUntil = 0;   // rT 只在按住 Q／E 調整時使用，其餘時候沿用核心目前的目標半徑

  const $p = id => panel.querySelector('#' + id);
  const P = () => api.U.player;
  const say = (m, ms = 2200) => { msg = m; msgUntil = performance.now() + ms; };

  /* 在 (x0, y0) 附近找一個能誕生的位置（假真空、範圍內沒有其他宇宙）；核心套用時會再檢查一次 */
  function findSpawn(U, x0, y0, r, t){
    for(let k=0;k<600;k++){
      const a = k*2.399, rr = k*5, x = x0 + Math.cos(a)*rr, y = y0 + Math.sin(a)*rr;
      if(U.ownerAt(x, y, t)) continue;
      let ok = true;
      for(let j=0;j<16 && ok;j++){ const th = Math.PI*2*j/16; if(U.ownerAt(x + Math.cos(th)*(r + 6), y + Math.sin(th)*(r + 6), t)) ok = false; }
      if(ok) return [x, y];
    }
    return null;
  }
  function spawn(){
    if(!api.S.isLive) api.time.goLive();
    const U = api.U, r = +$p('plR').value*api.S.RH, vac = +$p('plVac').value;
    const pos = findSpawn(U, api.camera.P.x, api.camera.P.y, r, api.tView);
    if(!pos){ say('附近找不到可以誕生的假真空'); return; }
    rT = r; sent = { dx: 0, dy: 0, rT: r };
    api.act({ type: 'spawn', x: pos[0], y: pos[1], vac, r, mode: $p('plMode').value });
    follow = true;
  }
  /* 輸入有變化才送出 steer 動作（動作紀錄只記錄變化） */
  function steer(){
    if(!P()) return;
    let dx = 0, dy = 0;
    if(mouseSteer !== null && mx >= 0){
      // 按住右鍵：朝游標方向（方向改變超過約 1.5° 才送出，動作紀錄不會爆量）
      const c = api.U.circleAt(P(), api.tView), [x, y] = api.camera.toPhysical(mx, my), m = Math.hypot(x - c.cx, y - c.cy);
      if(m > 1){ dx = (x - c.cx)/m; dy = (y - c.cy)/m; if(Math.abs(dx - sent.dx) + Math.abs(dy - sent.dy) < .025){ dx = sent.dx; dy = sent.dy; } }
    } else {
      if(keys.has('a') || keys.has('arrowleft')) dx--;
      if(keys.has('d') || keys.has('arrowright')) dx++;
      if(keys.has('w') || keys.has('arrowup')) dy--;
      if(keys.has('s') || keys.has('arrowdown')) dy++;
      const m = Math.hypot(dx, dy); if(m){ dx /= m; dy /= m; }
    }
    if(!rTdir) rT = P().ctl.in.rT;
    if(dx !== sent.dx || dy !== sent.dy || Math.abs(rT - sent.rT) > .02*sent.rT){
      sent = { dx, dy, rT }; api.act({ type: 'steer', dx, dy, rT });
    }
  }
  function cast(kind){
    const B = P(); if(!B || mx < 0){ say('先誕生玩家宇宙，並把游標移到要施放的位置'); return; }
    const U = api.U, [x, y] = api.camera.toPhysical(mx, my), own = U.ownerAt(x, y, api.tView), pe = own ? U.VAC[own.b.vac].eps : 1;
    let vac;
    if(kind === 'down'){ vac = +$p('plDown').value; if(!(U.VAC[vac].eps < pe)){ say('技能 1 的真空必須比該處低'); return; } }
    else { const ups = U.VAC.filter(v => v.eps > pe).sort((a, b) => a.eps - b.eps); if(!ups.length){ say('該處沒有更高的真空可以穿隧'); return; } vac = ups[ups.length - 1].i; }
    api.act({ type: 'nucleate', by: 'player', x, y, vac, r: .3*api.S.RH });
  }
  /* 曲速：按 3 啟動或停下。方向 = 正按著的方向鍵；沒有按就朝游標 */
  function warp(){
    const B = P(); if(!B){ say('先誕生玩家宇宙'); return; }
    if(B.ctl.warp){ api.act({ type: 'warp', on: false }); return; }
    let dx = sent.dx, dy = sent.dy;
    if(!dx && !dy){
      if(mx < 0){ say('按住方向鍵，或把游標移到要前往的方向'); return; }
      const c = api.U.circleAt(B, api.tView), [x, y] = api.camera.toPhysical(mx, my); dx = x - c.cx; dy = y - c.cy;
    }
    api.act({ type: 'warp', on: true, dx, dy, k: +$p('plWarp').value });
  }
  function fillVacuums(U){
    const opts = U.VAC.filter(V => V.eps < 1).sort((a, b) => a.eps - b.eps).map(V => {
      const tag = V.kind === 'ads' ? 'Λ<0，最強' : V.kind === 'tiny' ? 'Λ≈0' : 'Λ>0';
      return `<option value="${V.i}">${V.name}（${tag}，ε = ${V.eps.toFixed(2)}）</option>`;
    }).join('');
    $p('plVac').innerHTML = opts; $p('plDown').innerHTML = opts;
    // 預設挑中間的真空：最低的真空最強，但維持大小的花費也最高（∝ Δε）
    const n = $p('plVac').options.length; $p('plVac').selectedIndex = Math.floor(n/2); $p('plDown').selectedIndex = Math.floor(n/2);
  }

  return {
    name: 'player',
    setup(a){
      api = a;
      panel = api.addPanel({ title: '玩家宇宙', open: true, html: `
        <div class="sl"><label for="plVac"><span>你的真空</span></label><select id="plVac"></select>
          <p class="note">真空能越低越強：能吞掉比你高的宇宙並得到能量；碰上比你低的宇宙會被奪走地盤與能量。</p></div>
        <div class="sl"><label for="plR"><span>誕生半徑</span><output id="plRo"></output></label>
          <input type="range" id="plR" min=".1" max=".6" step=".05" value=".2"></div>
        <div class="sl"><label for="plMode"><span>模式</span></label><select id="plMode">
          <option value="relaxed" selected>輕鬆：能量可以透支，只限制技能</option>
          <option value="survival">生存：能量耗盡就力竭，泡壁以光速自由膨脹</option></select></div>
        <div class="btns"><button id="plSpawn">誕生（N）</button></div>
        <div class="sl"><label for="plDown"><span>技能 1（向下穿隧）的真空</span></label><select id="plDown"></select></div>
        <div class="sl"><label for="plWarp"><span>曲速倍率（技能 3）</span><output id="plWarpo"></output></label>
          <input type="range" id="plWarp" min="2" max="${api.PLAYER.warp.kMax}" step="1" value="${api.PLAYER.warp.k}">
          <p class="note">曲速搬動的是空間本身（前方收縮、後方膨脹），所以可以超過光速；泡壁相對被搬動的空間仍不超光速。
            代價是負能量：向真空借貸，越快、泡泡越大借得越多，能撐的時間越短（量子不等式）；結束後要在 ${api.PLAYER.warp.repayT} 秒內連本帶利償還，借越久利息越高（量子利息）。
            方向跟著方向鍵或滑鼠改變；碰到其他泡泡不會停下（搬動的是空間本身），進入別的宇宙後照一般規則吞食或被吞食。</p></div>
        <p class="note"><b>再循環（4）</b>：在 Λ > 0 的口袋宇宙中，以自己為中心向上穿隧回假真空（半徑略大於當地的哈伯半徑，永遠縮不掉），重新開始永恆暴脹。
          成本 = Δε × 面積。Λ ≤ 0 的宇宙無法再循環（反德西特會塌縮、閔考斯基無法向上穿隧）：困在那裡 ${api.PLAYER.recycle.trapT} 秒就<b>遊戲結束</b>，要及時用曲速逃出。</p>
        <p class="note">WASD／方向鍵：控制膨脹方向（前脹後縮 → 前進）　Q／E：縮小／放大　滑鼠右鍵（按住）：朝游標方向前進　1、2：在游標處施放技能　3：曲速（朝前進的方向，沒有則朝游標；再按一次停下）　4：再循環　空白鍵：暫停演化　F：鏡頭跟隨<br>
          越大越慢：最高速度 = c·(1 − r/R<sub>H</sub>)；超過哈伯半徑就無法控制。維持大小要持續花能量。</p>` });
      const wOut = () => { $p('plWarpo').textContent = `${$p('plWarp').value} c`; };
      $p('plWarp').addEventListener('input', wOut); wOut();
      const rOut = () => { $p('plRo').textContent = `${(+$p('plR').value).toFixed(2)} R_H`; };
      $p('plR').addEventListener('input', rOut); rOut();
      $p('plSpawn').addEventListener('click', spawn);

      api.on('universe', U => {
        fillVacuums(U); keys.clear(); sent = { dx: 0, dy: 0, rT: 0 };
        U.on('act', a => {
          if(a.type === 'spawn') say(a.result.ok ? `你誕生了：#${a.result.id}（${U.VAC[a.vac].name}）` : `無法誕生：${a.result.reason}`);
          if(a.type === 'nucleate' && a.by === 'player') say(a.result.ok ? `施放成功（花費 ${a.result.cost.toFixed(2)}）` : `無法施放：${a.result.reason}`);
          if(a.type === 'warp' && a.on) say(a.result.ok ? `曲速 ${a.result.k} c：向真空借貸負能量` : `無法啟動曲速：${a.result.reason}`);
          if(a.type === 'recycle') say(a.result.ok ? `再循環：重新開始永恆暴脹（半徑 ${(a.result.r0/api.S.RH).toFixed(2)} R_H，花費 ${a.result.cost.toFixed(2)}）` : `無法再循環：${a.result.reason}`, 3500);
        });
      });
      api.camera.cv.addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; });
      api.camera.cv.addEventListener('pointerleave', () => { mx = -1; });
      // 按住右鍵：朝游標方向前進（攔截，不拖曳畫面）；其他按鍵拖曳畫面時暫停跟隨（按 F 恢復）
      api.camera.cv.addEventListener('contextmenu', e => e.preventDefault());
      api.on('pointerdown', e => {
        if(e.button === 2){ mouseSteer = e.pointerId; mx = e.clientX; my = e.clientY; api.camera.cv.setPointerCapture(e.pointerId); follow = true; steer(); return true; }
        follow = false; return false;
      });
      api.on('pointerup', e => {
        if(e.button === 2 && mouseSteer !== null){ mouseSteer = null; steer(); return true; }
        return false;
      });

      const MOVE = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
      api.on('keydown', e => {
        const k = e.key.toLowerCase();
        if(MOVE.includes(k)){ keys.add(k); steer(); e.preventDefault(); return true; }
        if(k === 'q' || k === 'e'){ if(!rTdir && P()) rT = P().ctl.in.rT; rTdir = k === 'q' ? -1 : 1; return true; }
        if(k === ' '){ api.sim.setPaused(!api.sim.paused); say(api.sim.paused ? '已暫停演化' : '繼續演化'); e.preventDefault(); return true; }
        if(k === 'n'){ spawn(); return true; }
        if(k === 'f'){ follow = !follow; return true; }
        if(k === '1'){ cast('down'); return true; }
        if(k === '2'){ cast('up'); return true; }
        if(k === '3'){ warp(); return true; }
        if(k === '4'){ if(P()) api.act({ type: 'recycle' }); else say('先誕生玩家宇宙'); return true; }
        return false;
      });
      addEventListener('keyup', e => {
        const k = e.key.toLowerCase();
        if(keys.delete(k)) steer();
        if(k === 'q' || k === 'e') rTdir = 0;
      });
      addEventListener('blur', () => { keys.clear(); rTdir = 0; mouseSteer = null; steer(); });

      api.on('frame', ({ dtR }) => {
        if(!api.S.isLive) api.time.goLive();          // 遊戲進行中不能回看
        const B = P();
        if(B && rTdir){ rT = Math.max(2*api.S.R0, Math.min(.95*api.S.RH, rT*Math.exp(rTdir*.7*dtR))); steer(); }
        else if(B && mouseSteer !== null) steer();          // 按住右鍵時，玩家或游標移動都會改變方向
        // 曲速結束：顯示借貸與應還的量子利息
        const lw = B && B.ctl.lastWarp;
        if(lw && lw !== seenWarp){ seenWarp = lw; say(`曲速結束（${lw.why}）：${lw.tau.toFixed(1)} 秒，借 ${lw.borrowed.toFixed(2)}，連本帶利償還 ${lw.due.toFixed(2)}`, 3500); }
        if(B && follow){
          const c = api.U.circleAt(B, api.tView), Pc = api.camera.P, k = Math.min(1, dtR*(B.ctl.warp ? 12 : 4));   // 曲速時鏡頭跟得更緊
          api.camera.set(Pc.x + (c.cx - Pc.x)*k, Pc.y + (c.cy - Pc.y)*k);
        }
      });

      api.on('render:world', ({ ctx, t }) => {
        const B = P(); if(!B) return;
        const c = api.U.circleAt(B, t), [sx, sy] = api.camera.toScreen(c.cx, c.cy), Z = api.camera.Z, sr = c.r*Z;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,240,200,.55)';
        ctx.beginPath(); ctx.arc(sx, sy, sr + 3, 0, Math.PI*2); ctx.stroke();
        // 目標半徑
        ctx.setLineDash([3, 6]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,240,200,.45)';
        ctx.beginPath(); ctx.arc(sx, sy, B.ctl.in.rT*Z, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
        const C = B.ctl, n = C.t.length - 1;
        // 曲速：後方拉長的光痕（空間在身後膨脹）、前方被壓縮的弧（空間在前方收縮）
        if(C.warp){
          const ex = C.warp.dx, ey = C.warp.dy, k = C.warp.k, L = (40 + 10*k)*Math.min(2, Math.max(.6, Z)), ph = (t*3) % 1;
          ctx.lineWidth = 1.4;
          for(let i=0;i<14;i++){
            const off = (i/13 - .5)*1.8*sr, len = L*(.55 + .45*Math.abs(Math.sin(i*2.3 + t*7))), st = sr*.6 + ((ph + i*.37) % 1)*8;
            const bx = sx - ex*st - ey*off, by = sy - ey*st + ex*off;
            const g = ctx.createLinearGradient(bx, by, bx - ex*len, by - ey*len); g.addColorStop(0, 'rgba(190,230,255,.55)'); g.addColorStop(1, 'rgba(190,230,255,0)');
            ctx.strokeStyle = g; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - ex*len, by - ey*len); ctx.stroke();
          }
          const a0 = Math.atan2(ey, ex);
          for(let j=0;j<3;j++){ ctx.strokeStyle = `rgba(200,235,255,${.5 - j*.14})`; ctx.lineWidth = 2.2 - j*.5; ctx.beginPath(); ctx.arc(sx, sy, sr + 6 + j*5, a0 - .9 + j*.15, a0 + .9 - j*.15); ctx.stroke(); }
        }
        // 償還量子利息：正能量脈衝（向外擴散的紅色環）
        if(C.repay){
          const ph = (t*1.6) % 1;
          ctx.strokeStyle = `rgba(255,140,120,${.55*(1 - ph)})`; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(sx, sy, sr + 4 + ph*26, 0, Math.PI*2); ctx.stroke();
        }
        // 前進方向（曲速時是曲速方向）
        const wv = C.warp ? 1 : 0, ux = wv ? C.vx[n] : C.ux[n], uy = wv ? C.vy[n] : C.uy[n], u = Math.hypot(ux, uy);
        if(u > .5){
          const L = sr + 10 + Math.min(u, 60)*.8, ex = ux/u, ey = uy/u;
          ctx.strokeStyle = 'rgba(255,240,200,.85)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(sx + ex*(sr + 6), sy + ey*(sr + 6)); ctx.lineTo(sx + ex*L, sy + ey*L);
          ctx.lineTo(sx + ex*(L - 7) - ey*5, sy + ey*(L - 7) + ex*5); ctx.moveTo(sx + ex*L, sy + ey*L); ctx.lineTo(sx + ex*(L - 7) + ey*5, sy + ey*(L - 7) - ex*5); ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.font = '600 13px "Noto Sans TC", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(255,244,214,.95)'; ctx.fillText('你', sx, sy - sr - 8);
        ctx.restore();
      });

      // 能量與狀態（畫面上方中央）
      api.on('render:overlay', ({ ctx, t }) => {
        const B = P(), S = api.S, now = performance.now();
        ctx.save();
        ctx.font = '13px "Noto Sans TC", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const x = S.vw/2, y = 26;
        if(B){
          // 方案 B：所在區域的膨脹率 h 決定當地的哈伯半徑 c/h（最高速度 = c·(1 − r·h/c)）
          const C = B.ctl, c = api.U.circleAt(B, t), rr = c.r/S.RH, hl = C.h && C.h.length ? C.h[C.h.length - 1] : S.HUB, rl = rr*hl/S.HUB, um = Math.max(0, 1 - rl), w = 220;
          const state = C.trap > 0 ? `困在 Λ ≤ 0 的宇宙，無法再循環：${Math.max(0, api.PLAYER.recycle.trapT - C.trap).toFixed(1)} 秒後遊戲結束（用曲速逃出！）`
            : rl >= 1 ? '失控：大於哈伯半徑，連大小都維持不住（按 N 重新誕生）' : C.exhausted ? '力竭：泡壁以光速自由膨脹（吞入假真空可回復）'
            : C.E < 0 ? '能量透支：技能無法使用（吞食真空能比你高的宇宙來補充）' : '';
          ctx.fillStyle = 'rgba(10,6,24,.7)'; ctx.fillRect(x - w/2 - 12, y - 16, w + 24, state ? 62 : 46);
          ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(x - w/2, y - 6, w, 10);
          const f = Math.max(0, Math.min(1, C.E/(api.PLAYER.E0*2)));
          ctx.fillStyle = C.exhausted ? '#ff8a9a' : '#ffd27a'; ctx.fillRect(x - w/2, y - 6, w*f, 10);
          ctx.fillStyle = '#f4ecff';
          ctx.fillText(`能量 ${C.E.toFixed(2)}　半徑 ${rr.toFixed(2)} R_H　最高速度 ${(um*100).toFixed(0)}% c`, x, y + 18);
          if(state){ ctx.fillStyle = '#ff9aa6'; ctx.fillText(state, x, y + 36); }
          // 曲速與量子利息
          const W = api.PLAYER.warp, wy = y + (state ? 54 : 36);
          let wl = '';
          if(C.warp){
            const rate = W.kappa*C.warp.k**2*rr*rr, tau = t - C.warp.t0, tmax = Math.sqrt(W.Q/rate);
            wl = `曲速 ${C.warp.k} c｜已借 ${C.warp.B.toFixed(2)}｜還能撐 ${Math.max(0, tmax - tau).toFixed(1)} 秒｜需還約 ${(C.warp.B*(1 + tau/W.TI)).toFixed(2)}`;
          } else if(C.repay) wl = `償還量子利息：剩 ${C.repay.left.toFixed(2)}（還完才能再啟動曲速）`;
          if(wl){ const tw = ctx.measureText(wl).width + 20; ctx.fillStyle = 'rgba(10,6,24,.7)'; ctx.fillRect(x - tw/2, wy - 11, tw, 22); ctx.fillStyle = C.warp ? '#bfe6ff' : '#ffb4a6'; ctx.fillText(wl, x, wy); }
        } else {
          const last = api.U.hist.concat(api.U.longs).filter(b => b.ctl && b.ctl.fate).sort((a, b) => b.ctl.t[b.ctl.t.length - 1] - a.ctl.t[a.ctl.t.length - 1])[0];
          const fate = last && last.ctl.fate;
          if(fate === 'trapped'){
            // 遊戲結束：困在不再暴脹、也無法再循環的宇宙
            ctx.fillStyle = 'rgba(10,6,24,.82)'; ctx.fillRect(x - 250, S.vh/2 - 70, 500, 120);
            ctx.font = '600 26px "Noto Serif TC", serif'; ctx.fillStyle = '#ffd6a0'; ctx.fillText('遊戲結束', x, S.vh/2 - 36);
            ctx.font = '13px "Noto Sans TC", sans-serif'; ctx.fillStyle = '#f4ecff';
            ctx.fillText('你困在 Λ ≤ 0 的宇宙裡：它不再暴脹，也無法向上穿隧再循環。', x, S.vh/2 - 4);
            ctx.fillText('你的自我意識隨著這個宇宙走向終結。挑選真空後按 N 重新開始', x, S.vh/2 + 20);
          } else {
            ctx.fillStyle = 'rgba(10,6,24,.7)'; ctx.fillRect(x - 190, y - 14, 380, 28);
            ctx.fillStyle = '#f4ecff'; ctx.fillText(fate === 'eaten' ? '你的宇宙被吞沒了。挑選真空後按 N 重新誕生' : '挑選真空後按 N（或「誕生」）成為一個有自我意識的宇宙', x, y);
          }
        }
        if(now < msgUntil){ ctx.fillStyle = 'rgba(255,236,190,.95)'; ctx.fillText(msg, x, S.vh - 140); }
        ctx.restore();
      });

      api.addCheck({ name: '外掛：玩家宇宙', desc: '在全新的宇宙實例中找位置誕生玩家、操控移動：玩家存活、能量為有限數值、確實朝輸入方向前進', run(){
        const p = { ...api.U.p }, T = api.createUniverse(p, { ...api.tune });
        T.presim(5);
        const pos = findSpawn(T, 0, 0, 30, T.tSim);
        if(!pos) return { pass: false, detail: '找不到誕生位置' };
        T.act({ type: 'spawn', x: pos[0], y: pos[1], vac: T.VAC.findIndex(v => v.eps < 1), r: 30 }); T.advance(api.STEP);
        const B = T.player; if(!B) return { pass: false, detail: '誕生失敗' };
        T.act({ type: 'steer', dx: 1, dy: 0, rT: 30 }); T.presim(2);
        // 扣掉哈伯流：前進量 = 現在的中心 − 誕生點隨哈伯流移動後的位置
        const c = T.circleAt(B, T.tSim), e = Math.exp(p.H*(T.tSim - B.tn)), fwd = c.cx - pos[0]*e, side = Math.abs(c.cy - pos[1]*e);
        // 曲速 5c 往上 0.5 秒：中心相對當地空間的位移約 5c × 0.5（期間若重新置中，座標會整體平移，要加回來）。
        // 曲速的方向會跟著輸入，所以先放開方向（否則會被「往右」的輸入轉向）
        T.act({ type: 'steer', dx: 0, dy: 0, rT: 30 }); T.advance(api.STEP);
        const t0 = T.tSim, c0 = T.circleAt(B, t0), shifts = []; T.on('rebase', e => shifts.push(e));
        const wa = T.act({ type: 'warp', on: true, dx: 0, dy: -1, k: 5 }); T.advance(api.STEP);
        T.presim(.5); T.act({ type: 'warp', on: false }); T.advance(api.STEP);
        const t1 = T.tSim, c1 = T.circleAt(B, t1), back = shifts.reduce((s, e) => s + e.y*Math.exp(p.H*(t1 - e.t)), 0);
        const jump = -(c1.cy + back - c0.cy*Math.exp(p.H*(t1 - t0)));
        const want = 5*p.H*p.RH*(.5 + api.STEP), okW = !!wa.result && wa.result.ok && Math.abs(jump - want) < .15*want && !!B.ctl.repay;
        const ok = !!T.player && isFinite(B.ctl.E) && fwd > 10 && side < fwd*.2 && okW;
        return { pass: ok, detail: `能量 ${B.ctl.E.toFixed(2)}；相對哈伯流前進 ${fwd.toFixed(1)}、側移 ${side.toFixed(1)}；曲速 0.5 秒位移 ${jump.toFixed(0)}（約 ${want.toFixed(0)}），${B.ctl.repay ? '開始償還量子利息' : '沒有償還'}` };
      }});
    },
  };
}
