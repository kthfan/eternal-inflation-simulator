/* 介面｜面板的收起／展開、說明文字、隱藏所有面板。 */
import { $, store } from './dom.js';

/* 面板顯示／隱藏 */
export const body = document.body;
export let pt;

export function setCtl(open){ body.classList.toggle('ctl-closed', !open); pt.setAttribute('aria-expanded', open); store.set('ctl', open ? '1' : '0'); }

export function setNotes(show){ body.classList.toggle('no-notes', !show); $('notesBtn').textContent = show ? '隱藏說明文字' : '顯示說明文字'; $('notesBtn').setAttribute('aria-pressed', show); store.set('notes', show ? '1' : '0'); }

export function setLede(show){ $('ledeBtn').closest('.plate').classList.toggle('compact', !show); $('ledeBtn').textContent = show ? '收起說明' : '展開說明'; $('ledeBtn').setAttribute('aria-expanded', show); store.set('lede', show ? '1' : '0'); }

export function setUI(hidden){ body.classList.toggle('ui-hidden', hidden); $('uiBtn').textContent = hidden ? '顯示面板' : '隱藏面板'; $('uiBtn').setAttribute('aria-pressed', hidden); }

/* 模組初始化：依原本的執行順序，由 app/main.js 統一呼叫 */
export function init(){
  pt = $('panelToggle');
  pt.addEventListener('click', () => setCtl(true));
  $('ctlHide').addEventListener('click', () => setCtl(false));
  $('notesBtn').addEventListener('click', () => setNotes(body.classList.contains('no-notes')));
  $('ledeBtn').addEventListener('click', () => setLede($('ledeBtn').closest('.plate').classList.contains('compact')));
  $('uiBtn').addEventListener('click', () => setUI(!body.classList.contains('ui-hidden')));
  {
    const narrow = matchMedia('(max-width:760px)').matches, c = store.get('ctl');
    setCtl(narrow ? false : c !== '0');
    setNotes(store.get('notes') !== '0');
    setLede(store.get('lede') !== '0');
  }
}
