/* 繪製｜程序生成的紋理：假真空能量雲、泡內星空。 */
import { TAU, hash } from '../core/math.js';

/* ---------- 雜湊與紋理 ---------- */
export function makeNebula(){
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N,N), d = img.data;
  function vn(x,y,cells,seed){
    const fx = x*cells, fy = y*cells, ix = Math.floor(fx), iy = Math.floor(fy);
    let tx = fx-ix, ty = fy-iy; tx = tx*tx*(3-2*tx); ty = ty*ty*(3-2*ty);
    const i0 = ((ix%cells)+cells)%cells, j0 = ((iy%cells)+cells)%cells, i1 = (i0+1)%cells, j1 = (j0+1)%cells;
    const a = hash(i0,j0,seed), b = hash(i1,j0,seed), cc = hash(i0,j1,seed), dd = hash(i1,j1,seed);
    return a + (b-a)*tx + (cc-a)*ty + (a-b-cc+dd)*tx*ty;
  }
  function fbm(x,y,seed){ let s=0, amp=1, n=0; for(let o=0;o<5;o++){ s += amp*vn(x,y,3<<o,seed*17+o); n += amp; amp *= .5; } return s/n; }
  for(let y=0;y<N;y++) for(let x=0;x<N;x++){
    const u = x/N, v = y/N;
    const wx = fbm(u,v,5), wy = fbm(u,v,6);
    const n1 = fbm(u+.35*wx, v+.35*wy, 1);
    const n2 = fbm(u+.25*wy, v+.25*wx, 2);
    const n3 = fbm(u+.2*wx, v, 3);
    let dens = Math.min(1, Math.max(0, (n1-.36)/.36)); dens = dens*dens*(3-2*dens);
    let ridge = Math.pow(1 - Math.abs(n3*2-1), 9);
    const m = Math.min(1, Math.max(0, (n2-.32)/.36));
    const i = (y*N+x)*4;
    d[i]   = Math.min(255, 10 + dens*(196*(1-m)+40*m)*.72 + ridge*70);
    d[i+1] = Math.min(255,  6 + dens*(52*(1-m)+150*m)*.72 + ridge*44);
    d[i+2] = Math.min(255, 26 + dens*(172*(1-m)+236*m)*.72 + ridge*120);
    d[i+3] = 255;
  }
  g.putImageData(img,0,0);
  return c;
}

export function makeStars(){
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  const cols = ['255,255,255','255,236,210','205,222,255','255,214,232'];
  const wrap = (x,y,r,fn) => { for(const dx of [-N,0,N]) for(const dy of [-N,0,N]){ const X=x+dx, Y=y+dy; if(X>-r&&X<N+r&&Y>-r&&Y<N+r) fn(X,Y); } };
  for(let i=0;i<9;i++){
    const x = Math.random()*N, y = Math.random()*N, s = 6+Math.random()*12, ang = Math.random()*Math.PI;
    wrap(x,y,s*1.2,(X,Y)=>{
      g.save(); g.translate(X,Y); g.rotate(ang); g.scale(1,.36);
      const gr = g.createRadialGradient(0,0,0,0,0,s);
      gr.addColorStop(0,'rgba(255,246,228,.85)'); gr.addColorStop(.25,'rgba(225,205,255,.35)'); gr.addColorStop(1,'rgba(200,180,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0,0,s,0,TAU); g.fill(); g.restore();
    });
  }
  for(let i=0;i<560;i++){
    const x = Math.random()*N, y = Math.random()*N, s = Math.pow(Math.random(),7);
    const r = .35 + s*1.9, a = .3 + Math.random()*.7, col = cols[(Math.random()*cols.length)|0];
    wrap(x,y,r*5,(X,Y)=>{
      if(r>1.1){ const gr = g.createRadialGradient(X,Y,0,X,Y,r*4.5); gr.addColorStop(0,`rgba(${col},${a*.4})`); gr.addColorStop(1,`rgba(${col},0)`); g.fillStyle = gr; g.beginPath(); g.arc(X,Y,r*4.5,0,TAU); g.fill(); }
      g.fillStyle = `rgba(${col},${a})`; g.beginPath(); g.arc(X,Y,r,0,TAU); g.fill();
    });
  }
  return c;
}
