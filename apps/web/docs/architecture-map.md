# NuvioWeb architecture map

## Application boundaries

```text
retired legacy presentation                     active browser presentation
js/app.js + js/bootstrap/*                       apps/web/index.html
js/ui/navigation + js/ui/components/screens     apps/web/src/bootstrap/*
css/*                                            apps/web/src/navigation/components/screens
                                                 apps/web/src/styles/*
             \                                  /
              shared Nuvio engine and contracts
              js/core + js/data + js/domain
              js/platform + js/i18n + services

apps/remote = separate Expo application (workspace member, not a Web screen source)
services/remote = separate WebSocket/SRS service (workspace member)
```

`apps/web` is the only active browser presentation and the root production build now bundles it into `dist/`. The retired presentation sources remain inert only where removing them would break compatibility imports or legacy regression tests; they are no longer copied, bundled or served. `apps/web` must not import legacy screen renderers or legacy CSS, and it must not fork repositories/stores/player logic.

## Bootstrap and runtime ownership

- `index.html` loads environment properties, QR support and the generated root bundle.
- `js/app.js:bootstrapApp` currently renders the shell, initializes `Platform`, `I18n`, browser history routing, `PlayerController`, focus, theme, device-session registration, authentication and foreground/background sync.
- Authentication routing gates signed-out users, restores profiles, resolves experience-mode onboarding and starts profile-scoped synchronization.
- `js/bootstrap/renderAppShell.js` creates legacy screen hosts and the native `<video>` element. `webNavigation.js` and `webPlayerControls.js` attach browser presentation behavior.
- New bootstrap adapters should preserve that initialization order while creating new hosts/navigation and a real video surface owned by `apps/web`.
- Both root and `apps/web` development servers resolve backend environment properties through `scripts/envProperties.mjs`. This keeps authentication pointed at the configured Supabase deployment without duplicating discovery logic or embedding credentials in the Web package.

## Routing semantics

- `js/ui/navigation/router.js` registers 26 state routes and stores `{route, params, previousRoute}` in browser history.
- It preserves per-route UI state, handles Browser Back/Forward, skips onboarding/auth routes in the normal back stack, returns Player to Stream/Details, and coordinates post-play recommendation navigation.
- Route names and parameter shapes are internal contracts used by Remote commands and screens. The new router may expose URLs, but must retain equivalent state/history semantics and a compatibility navigation adapter.
- Dynamic behavior lives in parameter objects (`itemId`, `itemType`, stream/player context, catalog identifiers, cast/TMDB entity keys, folder identifiers), not path-pattern registrations.

## Shared engine map

| Area                   | Existing owner                                                                                                                        | Reuse rule for `apps/web`                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Authentication/session | `js/core/auth/*`, Supabase auth repositories                                                                                          | Import through an auth adapter; new forms subscribe to real auth state/actions                                                             |
| Profiles/onboarding    | `js/core/profile/profileManager.js`, profile/sync services, experience-mode routing/store                                             | Reuse state and commands; replace the presentation-heavy `profileSelectionScreen.js` with a new view adapter                               |
| Catalogs and metadata  | catalog/meta/add-on repositories, `homeCatalogs`, TMDB/MDBList services                                                               | Screen-specific data adapters normalize view models without duplicating fetching/caching                                                   |
| Home state             | home catalog/layout/continue-watching stores, watch and library repositories                                                          | Compose real hero/rail data; preserve ordering, profile scope and progress                                                                 |
| Library/collections    | library, saved-library, watched/progress, collections and cloud-library repositories; `js/core/collections/collectionSourceLoader.js` | Reuse repository mutations and sync; shared collection loader resolves addon, TMDB and Trakt folder pages; new views own presentation only |
| Plugins/sources        | add-on repository/API, plugin manager/runtime/service client, plugin/catalog stores                                                   | Reuse install/config/enable/refresh/remove actions; keep runtime diagnostics and errors                                                    |
| Streams/debrid         | `streamRepository`, debrid resolvers/preparers, stream ordering/badge/preference modules                                              | Adapter exposes loading/results/filter/preparation/error states and passes original playback context onward                                |
| Player                 | `js/core/player/playerController.js`, native/HLS/DASH/AVPlay engines, ASS/subtitle/audio modules                                      | Build a new HUD around the real controller and video element; never emulate playback                                                       |
| Watch state/tracking   | watch-progress/watched repositories, Trakt/SIMKL scrobble and sync services                                                           | Subscribe/mutate through existing services so resume/post-play/library stay consistent                                                     |
| Settings               | `js/data/local/*SettingsStore.js`, profile-scoped store and integration services                                                      | Build sections from explicit descriptors mapped to existing getters/setters; preserve every persisted value                                |
| Platform               | `js/platform/index.js`, browser runtime/services/adapter/environment                                                                  | Keep capability checks, external links, speech/fullscreen and environment contracts behind a Web adapter                                   |
| Localization           | `js/i18n/index.js`, genre labels and locale resources                                                                                 | New components use the existing translation runtime; no hard-coded Stitch sample data                                                      |
| Remote integration     | `js/core/remote/remoteClient.js`, `remoteContent.js`, `services/remote`                                                               | Preserve route/action compatibility; do not rebuild `apps/remote`                                                                          |

## Coupling and extraction rules

- Presentation-heavy legacy modules often mix DOM creation, focus rules and repository calls. New screen adapters should retain repository/service calls and callbacks but expose plain state/actions to new components.
- High fan-in contracts include `Router.navigate/getCurrent`, `ProfileManager.getActiveProfileId`, `LocalStore.get/set`, `PlayerController`, and `playerSettingsStore`; changes to these are compatibility-sensitive.
- Runtime events that must survive include auth/profile/sync subscriptions, visibility/focus synchronization, remote commands, player progress and terminal events, post-play navigation, route-state capture, keyboard/TV focus, and stream cancellation.
- IDs used by the player and external controls must be intentionally mapped; do not preserve arbitrary legacy DOM IDs unless another module queries them.
- `apps/web/src/bootstrap/runtimeLifecycle.js` owns the new shell's auth/profile/foreground lifecycle. `profileSessionAdapter.js`, `remoteAdapter.js`, and `playbackSessionAdapter.js` bridge shared services without importing legacy screens.
- `js/core/collections/collectionSourceLoader.js` is a DOM-free compatibility service for addon, TMDB and Trakt collection sources; both its inputs and outputs are plain source/page models.

## Package/deployment boundary

- Workspace candidates discovered from product source are root (`nuvio-web`), `apps/remote`, `services/remote`, and the new `apps/web`. Agent/tool packages under `.agents/`, `agent/`, and `.opencode/` are not product workspace members.
- Root remains the workspace and deployment boundary, but `pnpm build`, Docker and Coolify now publish the `apps/web` presentation into root `dist/`. This switch was explicitly authorized after parity and browser verification; no Coolify hostname or backend contract changes are required.
- Expo/Metro compatibility must be validated using the workspace install before deciding whether a linker override is necessary. No linker override is justified by inspection alone.
