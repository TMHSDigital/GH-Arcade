# GH Arcade

A growing arcade of free browser games, built with [Phaser 3](https://phaser.io), TypeScript and [Vite](https://vite.dev), and deployed to GitHub Pages.

**Play:** https://tmhsdigital.github.io/GH-Game-1/

## Games

| Game | Description |
| --- | --- |
| [Neon Breakout](https://tmhsdigital.github.io/GH-Game-1/games/breakout/) | Smash glowing bricks, chain combos, catch power-ups. |

## Develop

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173/GH-Game-1/
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ locally
```

## Add a game

```bash
npm run new-game space-dodge "Space Dodge"
```

This copies `games/_template/` to `games/space-dodge/` and adds an entry to `games/registry.json`, which drives the hub cards. Vite discovers every `games/*/index.html` automatically, so there is no config to edit. Edit the registry entry's description, tags and accent color, then build the game.

## Layout

```
index.html, src/hub/     Arcade hub page
games/registry.json      Game list shown on the hub
games/<slug>/            One folder per game (index.html + main.ts + scenes)
games/_template/         Starter game used by new-game
shared/                  Helpers shared by games: Phaser config, high scores, synth SFX, page shell CSS
scripts/new-game.mjs     Game scaffolder
.github/workflows/       Build and deploy to GitHub Pages on every push to main
```

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`, which builds the site and publishes `dist/` to GitHub Pages. In the repo settings, Pages must have **Source: GitHub Actions** selected.
