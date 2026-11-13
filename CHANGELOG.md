# Changelog

Notable changes to GH Arcade, newest first. The site deploys from `main` on every push, so there are no version numbers; entries are grouped by date. The [roadmap](README.md#roadmap) lists what is planned.

## Unreleased

### Added

- Settings in the pause menu: volume, sound, reduced motion and colors can be changed without leaving a game, by keyboard, gamepad or touch.
- Unit tests (Vitest), ESLint and a pull request check.

## 2026-11-12

### Fixed

- Neon Runner: falling into a floor gap now ends the run.
- Neon Pinball: the right flipper key is `/` instead of `M`, which also toggled mute. Ball 1 of a new game always has its ball save.
- Resuming from the pause menu no longer also performs a game action.
- Two-player games: either player can use the pause menu and the match result screen. Pong and Snake versus matches now count as plays, and Snake versus has a Menu option on touch and gamepad.
- Trophies earned in an abandoned run no longer appear on a later game-over screen.
- Settings and trophies no longer overwrite each other when the arcade is open in two tabs.
- Rebound keys work on "press start" screens, prompts show the current key, and the settings dialog refuses a key that another action already uses.
- Reduced motion follows the operating system until you set it yourself.
- Malformed saved data no longer stops the hub from rendering.
- A game that fails to start shows a message and a link back to the arcade instead of a permanent LOADING label.
- Neon Stack: auto-shift keeps going after tapping the opposite direction.
- Neon Maze: a caught chaser's eyes no longer pass through a wall cell.
- Neon Hop: logs slide in from off screen instead of popping into view.
- Astro Blaster: the next wave no longer starts after game over.

### Changed

- `npm run new-game` scaffolds a game with a menu, a game scene and the shared game-over screen, escapes the title safely, and prints the remaining manual steps.
- The build runs on Node 24; Node 22.12 or newer is required.
- The deploy workflow uses current, SHA-pinned actions with least-privilege permissions, and Dependabot watches npm and GitHub Actions.

### Added

- `SECURITY.md`, `CONTRIBUTING.md` and this changelog.

## 2026-09-27

### Added

- The arcade hub with tag filters, thumbnails and saved high scores.
- Ten games: Neon Breakout, Neon Snake, Neon Stack, Astro Blaster, Neon Runner, Star Siege, Neon Hop, Neon Pong, Neon Maze and Neon Pinball.
- Keyboard, gamepad and touch controls, with two-player modes in Snake, Siege and Pong.
- Pause menu, shared game-over screen, trophies and per-game stats.
- Settings: volume, reduced motion, a colorblind-friendly palette and key rebinding.
- Installable PWA with offline play.
