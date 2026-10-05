/* 測試用版本：與基礎版完全相同，只多把外掛 API 掛到 window.__ei，供自動化瀏覽器測試（test/e2e）使用。
   不要在這個版本加任何功能。 */
import { startApp } from '../../src/app/main.js';
startApp({ plugins: [{ name: 'harness', setup(api){ window.__ei = api; } }] });
