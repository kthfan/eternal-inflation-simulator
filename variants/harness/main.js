/* 測試用版本：與基礎版完全相同，只多把外掛 API 掛到 window.__ei（以及配色函式 window.__pal），供自動化瀏覽器測試（test/e2e、繪製比對）使用。
   不要在這個版本加任何功能。 */
import { startApp } from '../../src/app/main.js';
import { buildPalettes } from '../../src/render/camera.js';
// 繪製比對腳本需要為自行建立的宇宙建立配色
startApp({ plugins: [{ name: 'harness', setup(api){ window.__ei = api; window.__pal = buildPalettes; } }] });
