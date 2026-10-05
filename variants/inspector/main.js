/* 範例版本：基礎版 + 檢視器外掛。示範一個版本如何組合核心與外掛 */
import { startApp } from '../../src/app/main.js';
import { inspector } from '../../plugins/inspector/index.js';
startApp({ plugins: [inspector()] });
