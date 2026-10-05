/* 音樂〈第一秒的永恆〉：以 Web Audio 即時生成，並把泡泡誕生、碰撞、大擠壓轉成聲音事件。 */
import { S } from '../app/state.js';
import { isHab } from '../app/config.js';
import { buildSliders } from '../ui/controls.js';
import { $, store } from '../ui/dom.js';

/* ---------- 音樂〈第一秒的永恆〉：以 Web Audio 即時生成 ---------- */
export let Music;

export let musicBtn, optMusic;

export async function setMusic(v){
  const ok = await Music.setOn(v);
  musicBtn.setAttribute('aria-pressed', ok && v);
  $('musicTxt').textContent = ok && v ? '音樂開' : '音樂';
  optMusic.checked = !!(ok && v);
  store.set('music', ok && v ? '1' : '0');
}

export function musicEvents(t0, t1){
  for(const v of S.vis){
    const b = v.b, onScr = v.sx > -30 && v.sy > -30 && v.sx < S.vw+30 && v.sy < S.vh+30, pan = v.sx/S.vw*2 - 1;
    if(b.tn > t0 && b.tn <= t1 && onScr){
      const near = Math.max(0, Math.min(1, 1 - (b.d/S.RH - 1)/8));
      Music.birth(b, pan, near);
    }
    if(b.crunch){ const tc = b.tn + b.crunchT; if(tc > t0 && tc <= t1 && v.sr > 8) Music.crunch(Math.max(-1, Math.min(1, pan))); }
  }
  if(S.pendingCol.length) Music.collide(S.pendingCol[0]);
}

/* 模組初始化：依原本的執行順序，由 app/main.js 統一呼叫 */
export function init(){
  Music = (() => {
  let ac = null, on = false;
  let mix, comp, master, reverb, wet, padBus, shepBus, fxBus, noiseBuf;
  const vol = { master:.7, pad:.8, shep:.8, fx:.2 };
  const shepWaves = []; let shepStep = null, shepVoices = 0;
  // 謝帕德音階的七個音級（D 利底亞，與和聲同調）：D E F# G# A B C#
  const SHEP_PC = [38,40,42,44,45,47,49];
  let chordT = 0, chordI = 0, voices = 0, nextBell = 0, nextCol = 0, nextCrunch = 0;
  const hz = m => 440*Math.pow(2, (m-69)/12);
  // D 利底亞：Dmaj9 → E/D → Bm7 → F#m7 → Dmaj7(#11) → E/D → C#m7 → A(add9)
  const CHORDS = [[50,57,61,64,69],[50,52,56,59,66],[47,54,57,62,66],[42,57,61,64,68],[50,57,61,64,68],[50,52,56,59,64],[49,56,59,64,68],[45,52,59,61,64]];
  const CH_DUR = 11, MAXV = 16;
  const BELL = [62,66,69,73,64,71];   // 每種色系對應的音：D F# A C# E B

  function panner(p){ if(!ac.createStereoPanner) return ac.createGain(); const n = ac.createStereoPanner(); n.pan.value = Math.max(-1, Math.min(1, p)); return n; }
  function makeIR(sec){
    const sr = ac.sampleRate, len = Math.floor(sr*sec), buf = ac.createBuffer(2, len, sr);
    for(let c=0;c<2;c++){ const d = buf.getChannelData(c); for(let i=0;i<len;i++){ const t = i/len; d[i] = (Math.random()*2-1)*Math.pow(1-t, 3.2)*Math.min(1, i/(sr*.012)); } }
    return buf;
  }
  function init(){
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return false;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0;
    comp = ac.createDynamicsCompressor(); comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 3; comp.attack.value = .02; comp.release.value = .4;
    mix = ac.createGain(); mix.connect(comp); comp.connect(master); master.connect(ac.destination);
    reverb = ac.createConvolver(); reverb.buffer = makeIR(4.5);
    wet = ac.createGain(); wet.gain.value = .6; reverb.connect(wet); wet.connect(mix);
    padBus = ac.createGain(); shepBus = ac.createGain(); fxBus = ac.createGain();
    for(const b of [padBus, shepBus, fxBus]){ b.connect(mix); b.connect(reverb); }
    noiseBuf = ac.createBuffer(1, ac.sampleRate*2, ac.sampleRate);
    const nd = noiseBuf.getChannelData(0); for(let i=0;i<nd.length;i++) nd[i] = Math.random()*2-1;
    // 假真空的持續低鳴
    const dF = ac.createBiquadFilter(); dF.type = 'lowpass'; dF.frequency.value = 280; dF.Q.value = .8; dF.connect(padBus);
    const lfo = ac.createOscillator(); lfo.frequency.value = .045;
    const lg = ac.createGain(); lg.gain.value = 140; lfo.connect(lg); lg.connect(dF.frequency); lfo.start();
    for(const [m,type,det,g] of [[38,'sawtooth',-7,.045],[38,'sawtooth',7,.045],[45,'triangle',0,.05],[26,'sine',0,.13]]){
      const o = ac.createOscillator(); o.type = type; o.frequency.value = hz(m); o.detune.value = det;
      const gn = ac.createGain(); gn.gain.value = g; o.connect(gn); gn.connect(dF); o.start();
    }
    // 謝帕德音階：每個音由相隔八度的泛音組成，音量以固定的鐘形包絡分布在頻譜中央。
    // 沿著音階一級一級往上走，最高的八度淡出、最低的八度淡入，聽起來便永遠在上升。
    for(const m of SHEP_PC){
      const f0 = hz(m) / 2, n = 64, re = new Float32Array(n), im = new Float32Array(n);
      for(let h=1; h<n; h*=2){ const l = Math.log2(f0*h/330); im[h] = Math.exp(-l*l/(2*.85*.85)); }
      shepWaves.push({ f0, wave: ac.createPeriodicWave(re, im) });
    }
    shepBus.disconnect();
    const sf = ac.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 1100; sf.Q.value = .3;
    shepBus.connect(sf); sf.connect(mix);
    const sendRev = ac.createGain(); sendRev.gain.value = 1.4; sf.connect(sendRev); sendRev.connect(reverb);
    applyVol();
    return true;
  }
  function applyVol(){
    if(!ac) return; const t = ac.currentTime;
    padBus.gain.setTargetAtTime(vol.pad, t, .2);
    shepBus.gain.setTargetAtTime(vol.shep, t, .2);
    fxBus.gain.setTargetAtTime(vol.fx, t, .2);
    master.gain.setTargetAtTime(on ? vol.master*.9 : 0, t, on ? .5 : .15);
  }
  function playChord(notes){
    const t = ac.currentTime + .02, dur = CH_DUR, att = 3.5, rel = 6;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = .5;
    f.frequency.setValueAtTime(480, t); f.frequency.linearRampToValueAtTime(1500, t + dur*.6); f.frequency.linearRampToValueAtTime(650, t + dur + rel);
    f.connect(padBus);
    const lvl = .11/notes.length;
    for(const m of notes){
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lvl, t + att); g.gain.setValueAtTime(lvl, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + rel);
      const p = panner((Math.random()*2-1)*.5); g.connect(p); p.connect(f);
      for(const det of [-8, 8]){ const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = hz(m); o.detune.value = det; o.connect(g); o.start(t); o.stop(t + dur + rel + .1); }
    }
  }
  function shepNote(deg){
    if(shepVoices >= 4) return;
    const t = ac.currentTime + .02, w = shepWaves[deg], dur = 4.2;
    const o = ac.createOscillator(); o.setPeriodicWave(w.wave); o.frequency.value = w.f0;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.022, t + .7);
    g.gain.setTargetAtTime(.0001, t + 1.4, .9);
    o.connect(g); g.connect(shepBus);
    o.start(t); o.stop(t + dur);
    shepVoices++; voices++; o.onended = () => { shepVoices--; voices--; };
  }
  function bell(m, pan=0, vel=.6, ratio=3.5, decay=3.2, delay=0){
    if(!on || voices >= MAXV) return;
    const t = ac.currentTime + .01 + delay, f = hz(m);
    const car = ac.createOscillator(); car.frequency.value = f;
    const mod = ac.createOscillator(); mod.frequency.value = f*ratio;
    const mg = ac.createGain(); mg.gain.setValueAtTime(f*1.6*vel, t); mg.gain.exponentialRampToValueAtTime(f*.02, t + decay*.5);
    mod.connect(mg); mg.connect(car.frequency);
    const env = ac.createGain(); env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(.16*vel, t + .006); env.gain.exponentialRampToValueAtTime(.0001, t + decay);
    const p = panner(pan); car.connect(env); env.connect(p); p.connect(fxBus);
    car.start(t); mod.start(t); car.stop(t + decay + .05); mod.stop(t + decay + .05);
    voices++; car.onended = () => { voices--; };
  }
  function rumble(pan){
    if(!on || voices >= MAXV - 1) return;
    const t = ac.currentTime + .01;
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(220, t); f.frequency.exponentialRampToValueAtTime(50, t + 4.5);
    const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.3, t + 1.2); g.gain.exponentialRampToValueAtTime(.0001, t + 5);
    const o = ac.createOscillator(); o.frequency.setValueAtTime(hz(38), t); o.frequency.exponentialRampToValueAtTime(hz(26), t + 4.5);
    const og = ac.createGain(); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(.16, t + 1); og.gain.exponentialRampToValueAtTime(.0001, t + 5);
    const p = panner(pan*.6);
    src.connect(f); f.connect(g); g.connect(p); o.connect(og); og.connect(p); p.connect(fxBus);
    src.start(t); o.start(t); src.stop(t + 5.1); o.stop(t + 5.1);
    voices += 2; src.onended = () => { voices--; }; o.onended = () => { voices--; };
  }
  return {
    vol,
    get on(){ return on; },
    get voices(){ return voices; },
    get state(){ return ac ? ac.state : '未啟動'; },
    async setOn(v){
      if(v){
        if(!ac && !init()) return false;
        try { if(ac.state !== 'running') await ac.resume(); } catch(e){}
        on = true; chordT = 0; applyVol();
      } else if(ac){
        on = false; applyVol();
        const my = ac; setTimeout(() => { if(!on && my.state === 'running') my.suspend(); }, 900);   // 關閉時暫停音訊引擎，不佔 CPU
      }
      return on;
    },
    setVol(k, v){ vol[k] = v; applyVol(); },
    suspend(){ if(ac && ac.state === 'running') ac.suspend(); },
    resume(){ if(ac && on && ac.state !== 'running') ac.resume(); },
    tick(dtR, phaseTotal){
      if(!on || !ac || ac.state !== 'running') return;
      chordT -= dtR;
      if(chordT <= 0){ playChord(CHORDS[chordI % CHORDS.length]); chordI++; chordT = CH_DUR; }
      // 每走完一個音級敲出一個柔和的長音；拖曳時間軸造成的大跳躍只同步、不發聲
      const step = Math.floor(phaseTotal*7);
      if(shepStep === null || step < shepStep || step - shepStep > 2) shepStep = step;
      else if(step > shepStep){ shepStep = step; shepNote(((step % 7) + 7) % 7); }
    },
    birth(b, pan, near){
      if(!on || !ac) return;
      const now = ac.currentTime;
      if(isHab(b)){ [74,81,88].forEach((m,i) => bell(m, pan, .55, 2, 4.2, i*.17)); return; }
      if(now < nextBell) return; nextBell = now + .26;
      bell(BELL[b.vac % BELL.length] + (near > .55 ? 0 : 12), pan, .3 + .5*near, 3.5, 2.6 + near*1.8);
    },
    collide(pan){
      if(!on || !ac) return; const now = ac.currentTime;
      if(now < nextCol) return; nextCol = now + .45;
      bell([80,85,88,92][(Math.random()*4)|0], pan, .2, 5.02, 1.4);
    },
    crunch(pan){
      if(!on || !ac) return; const now = ac.currentTime;
      if(now < nextCrunch) return; nextCrunch = now + 3;
      rumble(pan);
    },
  };
})();
  musicBtn = $('musicBtn');
  optMusic = $('optMusic');
  musicBtn.addEventListener('click', () => setMusic(!Music.on));
  optMusic.addEventListener('change', e => setMusic(e.target.checked));
  buildSliders($('musicSliders'), [
    { id:'mMaster', label:'總音量', min:0, max:1, step:.01, def:.7, fmt:v => `${Math.round(v*100)}%`, note:'' },
    { id:'mPad', label:'和聲鋪底', min:0, max:1.5, step:.01, def:.8, fmt:v => `${Math.round(v*100)}%`, note:'持續的低鳴與緩慢輪轉的和弦。' },
    { id:'mShep', label:'無盡上升音', min:0, max:1.5, step:.01, def:.8, fmt:v => `${Math.round(v*100)}%`, note:'沿 D 利底亞音階逐級上升的謝帕德音階，每四次空間翻倍爬完一個八度。' },
    { id:'mFx', label:'事件鐘聲', min:0, max:1.5, step:.01, def:.2, fmt:v => `${Math.round(v*100)}%`, note:'泡泡誕生、碰撞與大擠壓的聲音。' },
  ], (p, v) => Music.setVol({ mMaster:'master', mPad:'pad', mShep:'shep', mFx:'fx' }[p.id], v));
  // 瀏覽器不允許自動播放；若上次開著音樂，就在第一次互動時接續
  if(store.get('music') === '1'){
    const resumeOnce = () => { setMusic(true); removeEventListener('pointerdown', resumeOnce, true); removeEventListener('keydown', resumeOnce, true); };
    addEventListener('pointerdown', resumeOnce, true); addEventListener('keydown', resumeOnce, true);
    $('musicTxt').textContent = '音樂（點一下畫面）';
  }
}
