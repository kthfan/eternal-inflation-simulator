/* 控制版外掛：使用者介入演化 —— 在畫面上點擊放下指定真空的泡泡（向下穿隧），或比所在處更高的真空區域（向上穿隧，會收縮消失）。
   · 所有介入都經由核心的動作紀錄（api.act），所以相同種子 + 相同動作紀錄可以完整重播
   · 只能在直播時操作（回看過去時停用）；可以暫停演化，暫停中放下的動作會在繼續後的第一步套用
   · 動作紀錄可以複製、貼上匯入，並以相同種子重播
   物理說明見 docs/ROADMAP.md D5、D6。 */
export function control(){
  let api, panel, placing = false, mx = -1, my = -1, down = null;
  const flashes = [];      // 最近套用的動作結果（在畫面上短暫顯示）

  const $p = id => panel.querySelector('#' + id);
  const say = (msg, bad) => { const el = $p('ctlMsg'); el.textContent = msg; el.classList.toggle('bad', !!bad); };
  const vacSel = () => +$p('ctlVac').value;
  const upR = () => +$p('ctlR').value*api.S.RH;

  /* 預覽：在 (px, py) 放下真空 vac 會是向上還是向下穿隧（擁有者由核心決定，與實際套用時相同） */
  function preview(px, py, vac = vacSel()){
    const U = api.U, V = U.VAC[vac], own = U.ownerAt(px, py, api.tView), pe = own ? U.VAC[own.b.vac].eps : 1;
    return { V, own, same: V.eps === pe, up: V.eps > pe };
  }

  /* 放置：回傳排入的動作，或拒絕原因（字串） */
  function place(sx, sy){
    if(!api.S.isLive) return '回看中無法操作：請先回到直播';
    const [x, y] = api.camera.toPhysical(sx, sy);
    const a = api.act({ type: 'nucleate', x, y, vac: vacSel(), r: upR() });
    say(api.sim.paused ? '已排入：繼續演化後套用' : '已排入，下一步套用');
    return a;
  }

  function setPlacing(v){ placing = v; $p('ctlPlace').checked = v; api.camera.cv.style.cursor = v ? 'crosshair' : ''; }
  function setPaused(v){ api.sim.setPaused(v); $p('ctlPause').textContent = v ? '繼續演化（K）' : '暫停演化（K）'; }
  function refreshLog(){
    const acts = api.actions, ok = acts.filter(a => a.result && a.result.ok).length, pend = acts.filter(a => !a.result).length;
    $p('ctlCount').textContent = `${acts.length} 個（成功 ${ok}${pend ? `、待套用 ${pend}` : ''}）`;
  }
  function fillVacuums(U){
    $p('ctlVac').innerHTML = U.VAC.map(V => `<option value="${V.i}">${V.name}（${V.kind === 'up' ? '比假真空高' : V.kind === 'rf' ? '假真空等級' : V.kind === 'ads' ? 'Λ<0' : V.kind === 'tiny' ? 'Λ≈0' : 'Λ>0'}）</option>`).join('');
  }

  return {
    name: 'control',
    setup(a){
      api = a;
      panel = api.addPanel({ title: '控制（介入演化）', open: true, html: `
        <label class="tog"><input type="checkbox" id="ctlPlace"><span>放置模式（P）：點擊畫面放下泡泡</span></label>
        <div class="sl"><label for="ctlVac"><span>真空</span></label><select id="ctlVac"></select></div>
        <div class="sl"><label for="ctlR"><span>向上穿隧區域半徑</span><output id="ctlRo"></output></label>
          <input type="range" id="ctlR" min=".1" max="1.5" step=".05" value=".4">
          <p class="note">比所在處低的真空是一般的泡泡（向下穿隧）。比所在處高的真空（向上穿隧）會被周圍往內推而收縮；小於哈伯半徑時會縮成一點消失，大於哈伯半徑則永遠縮不掉。</p></div>
        <div class="btns"><button id="ctlPause">暫停演化（K）</button></div>
        <p class="note ctl-msg" id="ctlMsg">只能在直播時操作。</p>
        <p class="note">動作紀錄：<b id="ctlCount">0 個</b></p>
        <div class="btns"><button id="ctlReplay">以相同種子重播</button><button id="ctlCopy">複製</button></div>
        <textarea id="ctlLog" rows="3" placeholder="貼上動作紀錄（JSON）後按「匯入並重播」"></textarea>
        <div class="btns"><button id="ctlImport">匯入並重播</button></div>` });
      $p('ctlPlace').addEventListener('change', e => setPlacing(e.target.checked));
      $p('ctlPause').addEventListener('click', () => setPaused(!api.sim.paused));
      const rOut = () => { $p('ctlRo').textContent = `${(+$p('ctlR').value).toFixed(2)} R_H`; };
      $p('ctlR').addEventListener('input', rOut); rOut();
      $p('ctlReplay').addEventListener('click', () => { const log = api.U.actionLog(); api.restart({ actions: log }); say(`已用相同種子重播 ${log.length} 個動作`); });
      $p('ctlCopy').addEventListener('click', () => {
        const txt = JSON.stringify(api.U.actionLog()); $p('ctlLog').value = txt;
        try { navigator.clipboard.writeText(txt).then(() => say('已複製到剪貼簿'), () => say('已放到下方文字框')); } catch(e){ say('已放到下方文字框'); }
      });
      $p('ctlImport').addEventListener('click', () => {
        let log; try { log = JSON.parse($p('ctlLog').value); } catch(e){ say('動作紀錄格式錯誤', true); return; }
        if(!Array.isArray(log) || log.some(a => !a || typeof a.step !== 'number' || typeof a.type !== 'string')){ say('動作紀錄格式錯誤', true); return; }
        api.restart({ actions: log }); say(`已匯入並重播 ${log.length} 個動作（使用目前的種子與參數）`);
      });

      api.on('universe', U => {
        fillVacuums(U); refreshLog(); flashes.length = 0;
        U.on('act', a => { flashes.push({ a, until: performance.now() + 1800 }); refreshLog();
          if(a.result.ok) say(`✓ #${a.result.id}：${a.result.up ? '向上穿隧，區域會收縮' : '向下穿隧，新的口袋宇宙'}`);
          else say(`✗ ${a.result.reason}`, true); });
      });
      api.camera.cv.addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; });
      api.camera.cv.addEventListener('pointerleave', () => { mx = -1; });

      // 放置模式：攔截點擊（短按放置）；拖曳仍可平移畫面
      api.on('pointerdown', e => {
        if(!placing || e.button !== 0) return false;
        down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, id: e.pointerId };
        api.camera.cv.setPointerCapture(e.pointerId);
        return true;
      });
      api.on('pointermove', e => {
        if(!down || e.pointerId !== down.id) return false;
        if(Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) down.moved = true;
        if(down.moved){ const P = api.camera.P, Z = api.camera.Z; api.camera.set(P.x - (e.clientX - down.lx)/Z, P.y - (e.clientY - down.ly)/Z); }
        down.lx = e.clientX; down.ly = e.clientY;
        return true;
      });
      api.on('pointerup', e => {
        if(!down || e.pointerId !== down.id) return false;
        const d = down; down = null;
        if(!d.moved){ const r = place(e.clientX, e.clientY); if(typeof r === 'string') say(r, true); }
        return true;
      });
      api.on('keydown', e => {
        if(e.key === 'p' || e.key === 'P'){ setPlacing(!placing); return true; }
        if(e.key === 'k' || e.key === 'K'){ setPaused(!api.sim.paused); return true; }
        return false;
      });
      api.on('frame', () => { if(api.actions.some(a => !a.result)) refreshLog(); });

      api.on('render:overlay', ({ ctx }) => {
        const now = performance.now(), S = api.S, Z = api.camera.Z;
        ctx.save();
        // 待套用的動作
        for(const a of api.U.pendingActions()){
          const [sx, sy] = api.camera.toScreen(a.x, a.y);
          ctx.setLineDash([4, 5]); ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(255,240,200,.85)';
          const rr = preview(a.x, a.y, a.vac).up ? Math.max(6, (a.r || 0)*Z) : 6;
          ctx.beginPath(); ctx.arc(sx, sy, rr, 0, Math.PI*2); ctx.stroke();
        }
        ctx.setLineDash([]);
        // 最近的結果
        ctx.font = '12px "Noto Sans TC", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        for(let i = flashes.length - 1; i >= 0; i--){
          const f = flashes[i]; if(now > f.until){ flashes.splice(i, 1); continue; }
          const al = Math.min(1, (f.until - now)/600), [sx, sy] = api.camera.toScreen(f.a.x, f.a.y), ok = f.a.result.ok;
          const txt = ok ? `#${f.a.result.id}` : f.a.result.reason;
          ctx.fillStyle = ok ? `rgba(190,255,210,${al})` : `rgba(255,150,160,${al})`;
          ctx.fillText((ok ? '✓ ' : '✗ ') + txt, sx + 12, sy - 12);
        }
        // 游標預覽：選擇的真空、向上或向下、向上時的區域大小
        if(placing && mx >= 0 && !down){
          const [px, py] = api.camera.toPhysical(mx, my), pv = preview(px, py);
          const live = S.isLive, col = pv.same || !live ? '255,150,160' : pv.up ? '255,214,120' : '170,220,255';
          ctx.strokeStyle = `rgba(${col},.9)`; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(mx, my, pv.up ? Math.max(4, upR()*Z) : 5, 0, Math.PI*2); ctx.stroke();
          const tip = !live ? '回看中無法操作' : pv.same ? '這裡已經是這種真空' : `${pv.V.name}：${pv.up ? '向上穿隧（會收縮）' : '向下穿隧'}`;
          const w = ctx.measureText(tip).width + 12;
          ctx.fillStyle = 'rgba(10,6,24,.75)'; ctx.fillRect(mx + 14, my + 10, w, 22);
          ctx.fillStyle = `rgba(${col},1)`; ctx.fillText(tip, mx + 20, my + 21);
        }
        ctx.restore();
      });

      api.addCheck({ name: '外掛：控制版', desc: '回看時不能放置；直播時放置會排入動作紀錄並在下一步套用；相同種子與動作紀錄重播後結果相同', run(){
        const S = api.S, keepLive = S.isLive;
        S.isLive = false; const r1 = place(S.vw/2, S.vh/2); S.isLive = keepLive;
        // 用全新的宇宙實例驗證「放置 → 套用 → 重播」，不影響正在播放的模擬
        const p = { ...api.U.p }, T = api.createUniverse(p, { ...api.tune });
        T.presim(5);
        const a = T.act({ type: 'nucleate', x: 900, y: 300, vac: T.VAC.length - 1, r: 60 });
        T.advance(api.STEP*2);
        const R = api.createUniverse(p, { ...api.tune }, { actions: T.actionLog() }); R.presim(5 + api.STEP*2);
        const same = !!a.result && JSON.stringify(R.actions[0].result) === JSON.stringify(a.result) && R.fingerprint(T.tSim) === T.fingerprint(T.tSim);
        return { pass: typeof r1 === 'string' && same, detail: `回看時放置：${typeof r1 === 'string' ? '已拒絕' : '未拒絕'}；新動作結果：${a.result ? (a.result.ok ? '成功' : a.result.reason) : '未套用'}；重播${same ? '一致' : '不一致'}` };
      }});
    },
  };
}
