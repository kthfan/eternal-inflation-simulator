/* 瀏覽器端到端測試：npm run test:e2e
   第一次執行前需下載瀏覽器：npx playwright install chromium
   內容：建置後的各版本能正常載入、不出錯，並在 harness 版本中跑完整的自我檢查（含需要畫面的項目）、
   點選泡泡、切換典型觀測者模式等基本操作。 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url = v => 'file://' + path.join(root, 'dist', v + '.html');
let failed = 0;
const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if(!ok) failed++; };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
const errors = []; page.on('pageerror', e => errors.push(String(e)));

// 1. 每個版本都能載入、不出錯
for(const f of fs.readdirSync(path.join(root, 'dist')).filter(f => f.endsWith('.html'))){
  errors.length = 0;
  await page.goto(url(f.replace('.html', '')) + '#seed=4242'); await page.waitForTimeout(1500);
  check(!errors.length, `${f} 載入正常${errors.length ? '：' + errors[0] : ''}`);
}

// 2. harness：完整自我檢查
errors.length = 0;
await page.goto(url('harness') + '#seed=4242'); await page.waitForTimeout(1200);
await page.evaluate(() => { document.getElementById('checkBtn').closest('details').open = true; });
await page.click('#checkBtn');
await page.waitForFunction(() => document.querySelector('#checkOut .sum'), null, { timeout: 300000 });
const lines = await page.$$eval('#checkOut li', ls => ls.map(l => l.className + '|' + l.querySelector('b').textContent));
for(const l of lines.filter(l => !l.includes('sum'))){ const [cls, name] = l.split('|'); check(cls === 'ok', '自我檢查 ' + name.replace(/^[✓✗] /, '')); }

// 3. 基本操作：點選泡泡、切換典型觀測者模式
let opened = false;
for(let x = 420; x < 1100 && !opened; x += 50) for(let y = 30; y < 740 && !opened; y += 50){
  await page.mouse.click(x, y); await page.waitForTimeout(30);
  opened = !(await page.$eval('#card', e => e.hidden));
}
check(opened, '點選泡泡會開啟資訊卡');
await page.evaluate(() => { document.getElementById('obsSel').value = 'typical'; document.getElementById('applyBtn').click(); });
await page.waitForTimeout(2500);
check((await page.textContent('#sO')) !== '假真空（暴脹中）', '典型觀測者模式：觀測者會被泡泡吞沒');
check(!errors.length, '操作過程沒有錯誤' + (errors.length ? '：' + errors[0] : ''));

await browser.close();
console.log(failed ? `\n${failed} 項失敗` : '\n全部通過');
process.exit(failed ? 1 : 0);
