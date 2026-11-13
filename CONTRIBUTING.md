# Contributing to GH Arcade

New games, level designs and bug fixes are welcome. For a security problem, see [SECURITY.md](SECURITY.md) instead of opening an issue.

## Getting set up

You need Node 22.12 or newer.

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
npm run typecheck   # TypeScript, strict
npm run build       # typecheck plus the production build
```

Both must pass. There is no automated test suite yet, so please play through what you changed with a keyboard and, if you can, a gamepad and a touch screen.

## Conventions for games

- **Use the shared toolkit.** Input goes through `ArcadeControls`, pausing through `PauseController`, menus through `buildMenu` and `OptionMenu`, and the end of a run through the shared game-over scene. The README has a table of what is in [`shared/`](shared).
- **Keep the scene keys.** The shared modules find scenes by key: the menu is `'Menu'`, gameplay is `'Game'` and the shared game-over scene is `'GameOver'`. They are exported as `SCENE` from [`shared/scenes.ts`](shared/scenes.ts).
- **Respect the pause guard.** Start `update()` with `if (this.pause.isPaused) return;` and check it in pointer handlers too.
- **Procedural art and audio.** Draw graphics in code and synthesize sounds with `tone()` and `noise()` from [`shared/sfx.ts`](shared/sfx.ts). Do not add image, audio or font files for a game; this keeps each game to a few KB on top of Phaser.
- **Use the shared palette.** Take colors from `NEON` in [`shared/ui.ts`](shared/ui.ts) so the colorblind palette applies, and honour `reducedMotion()` for decorative animation.
- **Fill in the hub card.** Edit the game's entry in [`games/registry.json`](games/registry.json): description, tags, accent color and controls hint.
- **Thumbnail.** Optional, but nice: a 16:9 JPEG screenshot of gameplay at `public/thumbs/<slug>.jpg`, kept small (the existing ones are under 20 KB), referenced as `"thumbnail": "thumbs/<slug>.jpg"`. Without one the card shows the first letter of the title.
- **Trophies.** Add up to four trophies for the game in [`shared/achievements.ts`](shared/achievements.ts) so it appears in the Trophies panel.

## Style

- TypeScript, two-space indentation, single quotes, semicolons. Match the file you are editing.
- Keep tuning numbers in the game's `config.ts`.
- Comments explain why, not what.
- No emojis or em dashes in code, docs or commit messages.

## Changelog

Notable changes are listed in [CHANGELOG.md](CHANGELOG.md). Add a line under "Unreleased" when your change is something a player or a game author would notice.

## License

By contributing, you agree that your work is released under the project's [MIT License](LICENSE).
