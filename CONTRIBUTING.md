# Contributing to Nuvio Web

Nuvio is a browser-first media application. Contributions should work with a current desktop browser and on a narrow mobile viewport.

## Before opening a pull request

- Keep changes focused and explain the user-facing outcome.
- Run `npm run build` and `npm run lint`.
- For a visible interface change, include desktop and mobile screenshots.
- For playback or provider work, describe the source type, browser, expected result, and any CORS constraints.

## Web guidelines

- Prefer semantic HTML and native browser controls where possible.
- Keep keyboard navigation accessible; pointer and touch interaction must work without focus state.
- Do not add device-specific wrappers, package metadata, remote-control assumptions, or fixed-canvas layouts.
- Treat credentials as private. Use `local.properties` for local configuration and never commit real secrets.

## Pull requests

Include a concise summary, validation performed, and any behavior a reviewer should verify. If a change changes the plugin, synchronization, or playback contract, call it out explicitly.
