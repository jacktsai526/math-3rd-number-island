# Number Island Quest 數學小島大冒險

A cute 3D math puzzle adventure for US 3rd graders. Help Pip the otter fix **Orchard Island** by solving 10 math puzzles. Works in any modern browser on phone, iPad and computer.

可愛的 3D 數學解謎遊戲，適合美國三年級。陪小水獺皮皮解開 10 個數學機關，修好「乘法果園島」！手機、iPad、電腦的瀏覽器都能玩。

**Play 開始玩：** https://jacktsai526.github.io/math-3rd-number-island/

## How to play 怎麼玩

- **New Game 開始新遊戲** starts a fresh adventure. Tap a flag on the island to walk Pip there.
- Tap **Hint 提示** (or Bean the sprout) when you're stuck. Fewer hints = more stars.
- **Save 存檔** on the map lets you name your save. Games also autosave after every level.
- **Load Game 讀取存檔** shows the saves on this device. To continue on another phone, iPad or computer, copy the 8-letter **save code** from the Save screen and type it in Load Game on the other device.
- Add it to your home screen to play it like an app (works offline after the first visit).

## Levels 關卡（Orchard Island 乘法果園島）

| # | Level | Math (Common Core grade 3) |
|---|---|---|
| 1-1 | Apple Baskets 一籃一籃的蘋果 | Multiplication as equal groups (3.OA.A.1) |
| 1-2 | Plant an Orchard 種一片果園 | Arrays, commutative property (3.OA.B.5) |
| 1-3 | Balance Bridge 翹翹板橋 | Unknown factor, a × b = c × ? (3.OA.A.4) |
| 1-4 | Secret Lock 花園的密碼鎖 | Multiples and logic clues (3.OA.C.7) |
| 1-5 | Treasure Stones 寶藏踏腳石 | Skip-counting patterns (3.OA.D.9) |
| 1-6 | Bunny Picnic 兔子野餐會 | Division as fair sharing (3.OA.A.2) |
| 1-7 | Harbor Boats 港口小船 | Rounding to the nearest 10 and 100 (3.NBT.A.1) |
| 1-8 | Pie Party 派對切派 | Fractions a/b of a whole (3.NF.A.1) |
| 1-9 | Clock Tower 大鐘塔 | Telling time to the minute, elapsed time (3.MD.A.1) |
| 1-10 | Sheep Pen 綿羊圍欄 | Area and perimeter (3.MD.C.7, 3.MD.D.8) |

Numbers change every time you play, so every replay is a new puzzle. Finish all 10 for the grand finale!

## Adding more worlds 未來擴充

The game is data-driven: worlds are listed in `WORLDS` and levels in `KEYS`, `NAMES` and the `LV` array in `js/game.js`. Future worlds (Fraction Bay, Clock Mountain, Shape Temple) already appear as "Coming soon".

## Tech

- Plain HTML + JavaScript modules, no build step. Host with GitHub Pages (Settings → Pages → Deploy from branch `main`, folder `/ (root)`).
- [Three.js](https://threejs.org/) r170 (MIT) bundled in `vendor/`.
- All 3D models, music and sound effects are generated in code (no outside art or audio files).
- Font: [Fredoka](https://fonts.google.com/specimen/Fredoka) (SIL Open Font License) in `fonts/`; Chinese text uses Noto Sans TC from Google Fonts.

| File | What it does |
|---|---|
| `index.html` | Page layout and styles |
| `js/game.js` | 3D world, Pip, levels, screens, finale |
| `js/music.js` | Generative background music |
| `js/save.js` | Named saves and cross-device save codes |
| `sw.js`, `manifest.webmanifest` | Offline play and add-to-home-screen |
