# Contributing to GH Arcade

New games, level designs and bug fixes are welcome. For a security problem, see [SECURITY.md](SECURITY.md) instead of opening an issue.

## Getting set up

You need Node 22.13 or newer.

```bash
git clone https://github.com/TMHSDigital/GH-Arcade.git
cd GH-Arcade
npm install
npm run dev
```

The dev server prints a local URL. The hub is at `/GH-Arcade/` and each game at `/GH-Arcade/games/<slug>/`.

## Making a change

1. Fork the repo and create a branch.
2. Make your change. For a new game, start with `npm run new-game <slug> "Title"`; the README section [Make your own game](README.md#make-your-own-game) walks through it.
3. Run the checks below.
4. Open a pull request. For a new game or a visible change, add a screenshot or a short GIF.

## Checks

```bash
npm run lint        # ESLint
npm test            # unit tests (Vitest) for the Phaser-free modules
npm run build       # typecheck plus the production build
```

All three must pass; pull requests run them automatically. The tests cover rules, data tables and saved data, not gameplay, so please also play through what you changed with a keyboard and, if you can, a gamepad and a touch screen.

Tests live next to the code as `*.test.ts`. If you add logic that does not need Phaser (rules, scoring, level data), keep it in its own module and add a test for it.

### Dependency overrides

Each entry under `overrides` in `package.json` forces a newer version of a package than its parent asks for, and should come out as soon as upstream no longer needs it:

- `workbox-build` > `glob ^14.0.6` (added in #110): workbox-build 7.4.1, the latest release, still asks for `glob ^11.0.1`, whose versions npm audit flags. Recheck on each workbox-build or vite-plugin-pwa release; when its own `glob` range reaches a patched version, delete the override, run `npm install`, and confirm `npm audit` stays clean and the built service worker precaches the same files.

## Conventions for games

- **Use the shared toolkit.** Input goes through `ArcadeControls`, pausing through `PauseController`, menus through `buildMenu` and `OptionMenu`, and the end of a run through `endRun()`, which starts the shared game-over scene. The README has a table of what is in [`shared/`](shared).
- **Keep the scene keys.** The shared modules find scenes by key: the menu is `'Menu'`, gameplay is `'Game'` and the shared game-over scene is `'GameOver'`. They are exported as `SCENE` from [`shared/scenes.ts`](shared/scenes.ts).
- **Mark impacts with `impact()`.** For a crash, a lost life or a big hit, call `impact(this, controls, ms, intensity)` from [`shared/ui.ts`](shared/ui.ts) instead of shaking the camera yourself: it shakes the screen and rumbles the gamepad of the player it happened to. In a two-player game, pass only that player's controls.
- **Respect the pause guard.** Start `update()` with `if (this.pause.isPaused) return;` and check it in pointer handlers too.
- **Procedural art and audio.** Draw graphics in code and synthesize sounds with `tone()` and `noise()` from [`shared/sfx.ts`](shared/sfx.ts). Do not add image, audio or font files for a game; this keeps each game to a few KB on top of Phaser.
- **Use the shared palette.** Take colors from `NEON` in [`shared/ui.ts`](shared/ui.ts) so the colorblind palette applies, and honour `reducedMotion()` for decorative animation.
- **Fill in the hub card.** Edit the game's entry in [`games/registry.json`](games/registry.json): description, tags, accent color and controls hint.
- **Thumbnail.** Optional, but nice: a 16:9 JPEG screenshot of gameplay at `public/thumbs/<slug>.jpg`, kept small (aim for 20 KB or less), referenced as `"thumbnail": "thumbs/<slug>.jpg"`. Without one the card shows the first letter of the title.
- **Trophies.** List up to four trophies in the game's own `trophies.ts`; the arcade picks the file up automatically. Unlock them through `trophiesFor<typeof TROPHIES>()`, which type-checks the ids. A trophy earned at a number (a score, a level) declares it as `threshold` beside its description, and the game calls `reach(id, value)` instead of comparing against the number itself.
- **Bests of your own.** The arcade keeps one best score per game, higher is better. If the game also saves bests of its own (per mode, per difficulty, a best time), export their storage keys as `BEST_KEYS` from its `trophies.ts` (see [`games/mines/trophies.ts`](games/mines/trophies.ts)) so "Reset best scores" in the hub clears them too. Every key the game saves with `saveJSON` must also be listed in `SAVE_KEYS` there, with whether a lower or higher number is better, so backups carry it and a merge keeps the better value; tests fail if either list misses a key.
- **Extra controls.** If the game adds keys or gamepad buttons beside the shared actions, list them in the game's own `controls.ts` as `EXTRA_CONTROLS` (see [`games/stack/controls.ts`](games/stack/controls.ts)) and pass that to `ArcadeControls`. The hub reads it to warn a player who gives Pause or Mute a key or button the game already uses.

## Level designs

Levels are plain text grids, so a new one needs no engine knowledge.

- **Neon Maze.** Layouts live in [`games/maze/maze.ts`](games/maze/maze.ts), each written as its left half (the right half is mirrored). Add yours to `LAYOUTS`; levels play them in order and start over after the last. Keep rows 6 to 12 and the runner's start as they are, join your corridors to that middle block, and leave no dead ends. `npm test` checks every layout for all of this, so a layout that passes is playable.
- **Neon Breakout.** Brick layouts are the `LEVELS` list in [`games/breakout/config.ts`](games/breakout/config.ts): one string per row, with `.` for a gap and `1` to `3` for how many hits a brick takes.
- **Neon Golf.** Holes are the `HOLES` list in [`games/golf/holes.ts`](games/golf/holes.ts), up to 20 columns by 13 rows: `#` wall, `.` green, `s` sand, `w` water, `>` `<` `^` `v` boost pads, one `T` tee and one `O` cup, and a space for out of bounds. Sliding blockers go in the hole's `movers`. `npm test` checks every hole and plays it with a brute-force golfer, so a hole whose `par` cannot be made fails.
- **Neon Crates.** Levels are the `LEVELS` list in [`games/crates/levels.ts`](games/crates/levels.ts), easiest first: `#` wall, `$` crate, `.` target, `*` crate on a target, `@` robot, `+` robot on a target, and a space or `-` for floor. `par` must be the fewest moves that solve the level: `npm test` runs a solver and tells you the right number. Adding a level also means raising the `threshold` of the Master Mover trophy in `games/crates/trophies.ts` to the new level count, which a test checks too.

## Style

- TypeScript, two-space indentation, single quotes, semicolons. Match the file you are editing.
- Keep tuning numbers in the game's `config.ts`.
- Comments explain why, not what.
- No emojis or em dashes in code, docs or commit messages.

## Changelog

Notable changes are listed in [CHANGELOG.md](CHANGELOG.md). Add a line under today's date when your change is something a player or a game author would notice.

## License

By contributing, you agree that your work is released under the project's [MIT License](LICENSE).
