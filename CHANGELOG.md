# Changelog

Notable changes to GH Arcade, newest first. The site deploys from `main` on every push, so there are no version numbers; entries are grouped by date. The [roadmap](README.md#roadmap) lists what is planned.

## Unreleased

### Added

- Settings in the pause menu: volume, sound, reduced motion and colors can be changed without leaving a game, by keyboard, gamepad or touch.
- Neon Stack has a Daily mode: everyone gets the same piece order on a given UTC date, with a best score per day.
- Neon Hop and Neon Runner have a Daily mode too: the same traffic, river and bonus orbs in Hop, and the same course in Runner, for everyone on a given UTC date.
- Touch options in Settings (on touch devices): on-screen button size, a left-handed layout and vibration on press. They are in the pause menu's settings too.
- Unit tests (Vitest), ESLint and a pull request check.
- A Content-Security-Policy on every built page: the arcade loads only its own files and Google Fonts.
- An ARCADE option on the game-over and match result screens.
- Hub: sort by recently played, most played or name; trophy progress and a last-played marker on each card; average score and lifetime totals in the Trophies panel.
- Settings has a "Your data" section: download a backup of trophies, stats, best scores and settings, restore one, or reset best scores.
- A notice when the browser is blocking saved data, so players know their scores and trophies will not be kept.
- Notices when the arcade is ready to play offline and when it has updated, and install instructions on iPhone and iPad.

### Changed

- The games now run on Phaser 4. Game authors: glows go through `addGlow()` from `shared/ui.ts`, since Phaser 4 replaces `preFX` with filters.

### Fixed

- The Arcade, Pause and Fullscreen buttons no longer cover the corners of the game in windows close to its own shape.
- A rebound Pause or Mute key now works in two-player modes too.
- A new version arriving while you play no longer reloads the game mid-run.
- Neon Pinball: with the left-handed touch layout, holding the left half of the screen launches the ball.
- Menu help text, and Neon Pinball's in-game help, name the keys you chose in Settings instead of the defaults.

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
