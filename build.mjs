/* 建置：把每個版本（variants/<名稱>/main.js）打包成單一、可直接開啟的 HTML 檔，輸出到 dist/<名稱>.html。
   用法：node build.mjs            建置全部版本
         node build.mjs base       只建置指定版本
         node build.mjs --watch    監看原始碼變更並自動重建 */
import { build, context } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2), watch = args.includes('--watch');
const only = args.filter(a => !a.startsWith('--'));
const variants = fs.readdirSync(path.join(root, 'variants')).filter(v => fs.existsSync(path.join(root, 'variants', v, 'main.js')) && (!only.length || only.includes(v)));
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });

function assemble(v, js){
  const dir = path.join(root, 'variants', v);
  const meta = fs.existsSync(path.join(dir, 'variant.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'variant.json'), 'utf8')) : {};
  let css = fs.readFileSync(path.join(root, 'src/styles/main.css'), 'utf8');
  if(fs.existsSync(path.join(dir, 'style.css'))) css += '\n' + fs.readFileSync(path.join(dir, 'style.css'), 'utf8');
  const extra = fs.existsSync(path.join(dir, 'extra.html')) ? fs.readFileSync(path.join(dir, 'extra.html'), 'utf8') : '';
  const tpl = fs.readFileSync(path.join(root, 'src/template.html'), 'utf8');
  // 用函式取代，避免 JS 內容中的 $& 等特殊字元被誤解
  const html = tpl.replace('{{TITLE}}', () => meta.title || v).replace('{{CSS}}', () => css).replace('{{EXTRA_HTML}}', () => extra).replace('{{JS}}', () => js.replace(/<\/script/gi, '<\\/script'));
  fs.writeFileSync(path.join(root, 'dist', v + '.html'), html);
  console.log(`dist/${v}.html  (${(html.length/1024).toFixed(0)} KB)`);
}

for(const v of variants){
  const opts = { entryPoints: [path.join(root, 'variants', v, 'main.js')], bundle: true, format: 'iife', write: false, charset: 'utf8', target: 'es2020', legalComments: 'none' };
  if(watch){
    const ctx = await context({ ...opts, plugins: [{ name: 'assemble', setup(b){ b.onEnd(r => { if(!r.errors.length) assemble(v, r.outputFiles[0].text); }); } }] });
    await ctx.watch();
  } else {
    const r = await build(opts);
    assemble(v, r.outputFiles[0].text);
  }
}
if(watch) console.log('監看中…（Ctrl+C 結束）');
