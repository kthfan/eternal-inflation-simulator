/* 介面｜DOM 小工具與本機設定儲存（localStorage，鍵名前綴 ei3:）。 */
/* ---------- 介面 ---------- */
export const $ = id => document.getElementById(id);

export const store = { get(k){ try { return localStorage.getItem('ei3:'+k); } catch(e){ return null; } }, set(k,v){ try { localStorage.setItem('ei3:'+k, v); } catch(e){} } };
