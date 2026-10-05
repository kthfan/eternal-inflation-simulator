/* 控制版：基礎版 + 控制外掛（使用者介入演化：放置泡泡、向上穿隧、暫停演化、動作紀錄重播） */
import { startApp } from '../../src/app/main.js';
import { control } from '../../plugins/control/index.js';
startApp({ plugins: [control()] });
