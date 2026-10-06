/* 遊戲版雛形：基礎版 + 玩家宇宙外掛（有自我意識的宇宙：移動、能量、技能）。見 docs/ROADMAP.md D 節 */
import { startApp } from '../../src/app/main.js';
import { player } from '../../plugins/player/index.js';
startApp({ plugins: [player()] });
