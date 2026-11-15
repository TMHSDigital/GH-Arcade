# Changelog

Notable changes to GH Arcade, newest first. The site deploys from `main` on every push, so there are no version numbers; entries are grouped by date. The [roadmap](README.md#roadmap) lists what is planned.

## 2026-11-15

### Added

- A shared daily result links to its day, so a friend who opens it after midnight UTC still plays the same board. An earlier day plays as a challenge that does not count toward today's result or your streak.
- Neon Pong: EASY CPU and HARD CPU modes beside VS CPU. The Table Champion and Clean Sheet trophies need the normal or the hard CPU.
- After your first finished run, the arcade asks the browser to keep saved progress when the device is low on space. Settings, under "Your data", says whether it is protected.

### Changed

- Hub: resetting trophies or best scores and restoring or merging a backup ask for confirmation in the page, so a gamepad can answer. Cancel is selected first.
- The daily challenge label looks the same in Neon Hop, Neon Runner, Neon Snake and Neon Stack: the date, and your best for the day under it.
- Node 22.13 or newer is required (it was 22.12), and pull requests are checked on Node 22.13 as well as Node 24.

### Fixed

- The pause menu's SOUND label updates immediately when Mute is pressed.
- Neon Maze: being caught on the same tick as eating the last dot now costs a life instead of clearing the level.
- Restoring or merging a backup that cannot be saved (for example when the browser is out of room) puts back what was on the device instead of leaving it wiped.
- A daily challenge that ends on 0 points now counts as played: the hub stops offering it and the streak carries on.
- The average in the Trophies panel no longer counts two-player matches, which have no score.
- Resetting trophies or restoring a backup now sticks when a game is open mid-run in another tab.
- Touch: tapping RESUME no longer makes the hopper hop in Neon Hop or moves the paddle in Neon Pong.
- Neon Snake: the daily challenge starts with the same first food for everyone, including after PLAY AGAIN or an earlier run on the page.

## 2026-11-14

### Added

- A game's address can name a menu mode: `games/stack/?mode=daily` opens the menu with DAILY selected. Hub cards use it while today's daily challenge is unplayed, and a shared daily result links to it.
- Neon Snake has a Daily mode as well: food and bonus stars follow the same sequence for everyone on a given UTC date.
- Hub: the Settings and Trophies panels can be worked with a gamepad. Up and down move between controls and scroll the panel, left and right change a slider, A presses a button or ticks a box, and B cancels a key that is waiting to be rebound.
- Games pause themselves when a gamepad disconnects, as they do when the tab loses focus.
- The screen stays on while a run is in progress, so playing with a gamepad no longer lets a phone or laptop dim or lock mid-game. It is free to sleep again on pause, on the menu and at game over.
- Hub: a line says how long until the next daily challenge (it changes at midnight UTC), and an open hub moves its Daily chips on to the new day by itself.
- Gamepads rumble on impacts (crashes, lost lives, line clears) in every game, on gamepads and browsers that support it. In two-player games only the player it happened to feels it. Settings and the pause menu have a switch for it.
- Neon Maze has a second maze layout. Levels alternate between the two, and CONTRIBUTING.md explains how to add more.

## 2026-11-13

### Added

- Installed app shortcuts open the first four featured games directly, following the game registry's order.
- Neon Hop and Neon Runner have a Daily mode too: the same traffic, river and bonus orbs in Hop, and the same course in Runner, for everyone on a given UTC date.
- The on-screen touch options are available in the pause menu's settings too.
- Gamepad buttons can be remapped in Settings, for every action that already had a rebindable key. The change applies to each player's gamepad.
- A SHARE option on the game-over screen: it hands the game, the score and (for a daily run) the date to the browser's share sheet, or copies them.
- Hub: games with a daily challenge have a `daily` filter and show today's result on their card; the Trophies panel lists recent daily results and the current streak.
- Settings can merge a backup into what is on the device, keeping the trophies and best scores of both, as well as replace it.
- Each game keeps its five highest scores: the game-over screen says when a run made the list, and the Trophies panel shows it with dates.
- Hub: the chosen tag filter is remembered between visits, like the sort order.
- A notice when the browser is blocking saved data, so players know their scores and trophies will not be kept.

### Changed

- The games now run on Phaser 4. Game authors: glows go through `addGlow()` from `shared/ui.ts`, since Phaser 4 replaces `preFX` with filters.

### Fixed

- The Arcade, Pause and Fullscreen buttons no longer cover the corners of the game in windows close to its own shape.
- A rebound Pause or Mute key now works in two-player modes too.
- Neon Pinball: with the left-handed touch layout, holding the left half of the screen launches the ball.
- Menu help text, and Neon Pinball's in-game help, name the keys you chose in Settings instead of the defaults.

## 2026-11-12

### Added

- Settings in the pause menu: volume, sound, reduced motion and colors can be changed without leaving a game, by keyboard, gamepad or touch.
- Neon Stack has a Daily mode: everyone gets the same piece order on a given UTC date, with a best score per day.
- Touch options in Settings (on touch devices): on-screen button size, a left-handed layout and vibration on press.
- Unit tests (Vitest), ESLint and a pull request check.
- A Content-Security-Policy on every built page: the arcade loads only its own files and Google Fonts.
- An ARCADE option on the game-over and match result screens.
- Hub: sort by recently played, most played or name; trophy progress and a last-played marker on each card; average score and lifetime totals in the Trophies panel.
- Settings has a "Your data" section: download a backup of trophies, stats, best scores and settings, restore one, or reset best scores.
- Notices when the arcade is ready to play offline and when it has updated, and install instructions on iPhone and iPad.
- `SECURITY.md`, `CONTRIBUTING.md` and this changelog.

### Changed

- `npm run new-game` scaffolds a game with a menu, a game scene and the shared game-over screen, escapes the title safely, and prints the remaining manual steps.
- The build runs on Node 24; Node 22.12 or newer is required.
- The deploy workflow uses current, SHA-pinned actions with least-privilege permissions, and Dependabot watches npm and GitHub Actions.

### Fixed

- A new version arriving while you play no longer reloads the game mid-run.
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

## 2026-09-27

### Added

- The arcade hub with tag filters, thumbnails and saved high scores.
- Ten games: Neon Breakout, Neon Snake, Neon Stack, Astro Blaster, Neon Runner, Star Siege, Neon Hop, Neon Pong, Neon Maze and Neon Pinball.
- Keyboard, gamepad and touch controls, with two-player modes in Snake, Siege and Pong.
- Pause menu, shared game-over screen, trophies and per-game stats.
- Settings: volume, reduced motion, a colorblind-friendly palette and key rebinding.
- Installable PWA with offline play.
