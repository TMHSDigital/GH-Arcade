# Security policy

GH Arcade is a static site: a hub page and a set of browser games served from GitHub Pages. There is no server, no accounts and no data collection. Scores, trophies and settings stay in the browser's `localStorage`.

## Supported versions

Only the latest commit on `main`, which is what is deployed, is supported.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub: open the repository's **Security** tab and choose [**Report a vulnerability**](https://github.com/TMHSDigital/GH-Arcade/security/advisories/new). Include what you found, how to reproduce it and what you think the impact is.

If that option is not available, open an issue that only asks for a private way to get in touch, with no details of the problem.

You can expect an acknowledgement within a week. Once a fix is deployed, the report can be published as an advisory with credit to you, if you would like that.

## Scope

In scope: the code in this repository, the deployed site, and the build and deploy workflow.

Out of scope: vulnerabilities in third-party dependencies that do not affect this project (report those upstream), and anything that needs physical access to a player's device or a modified browser.
