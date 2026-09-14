# Stitch inventory

Project `5092809079354259052` contains **22** current screen resources: **13 Web**, **5 Remote**, and **4 shared artwork assets**. All were enumerated and retrieved through Stitch on 2026-09-13. Source-selection alternates are kept distinct until implementation comparison proves which states each should supply.

The completion re-query on 2026-09-14 returned the same 22 resource IDs: no new or unclassified screen was introduced during implementation.

| Stitch screen                                              | Feature/state                                  | Classification        | Related legacy feature                 | `apps/web` destination       | Notes                                                                           |
| ---------------------------------------------------------- | ---------------------------------------------- | --------------------- | -------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| Nuvio Web - Home (`01518428…`)                             | Hero, navigation and media rails               | WEB                   | `home`                                 | `src/screens/home/`          | Primary Home visual reference                                                   |
| Nuvio Web - Search & Discover (`9321e9f9…`)                | Search input/results and discovery composition | WEB                   | `search`, part of `discover`           | `src/screens/search/`        | Search reference; do not merge route semantics                                  |
| Nuvio Web - Explorar (`9535fd27…`)                         | Dedicated browse/explore surface               | WEB                   | `discover`                             | `src/screens/discover/`      | Primary Discover reference                                                      |
| Nuvio Web - The Last of Us Details (`8d28c99c…`)           | Series details, seasons and episodes           | WEB                   | `detail`                               | `src/screens/detail/`        | Content is illustrative only; runtime data must replace it                      |
| Nuvio Web - Biblioteca (`1795d345…`)                       | Library navigation, filters and grids          | WEB                   | `library`, collections                 | `src/screens/library/`       | Also informs folder/catalog grids                                               |
| Nuvio Web - Ajustes (`9bc56856…`)                          | Settings navigation and groups                 | WEB                   | `settings`, account/integrations/about | `src/screens/settings/`      | Visual subset; legacy section inventory remains authoritative for functionality |
| Nuvio Web - Selección de Perfil (`0bcc7ca8…`)              | Profile selection/management                   | WEB                   | `profileSelection`                     | `src/screens/profiles/`      | Also informs onboarding/auth presentation                                       |
| Nuvio Web - Fuentes (`4b12247d…`)                          | Source management                              | ALTERNATE / DUPLICATE | `plugins`, `plugin`, `catalogOrder`    | `src/screens/sources/`       | Earlier source-management direction                                             |
| Nuvio Web - Fuentes (Fiel al repositorio) (`46102202…`)    | Repository-faithful source management          | WEB                   | `plugins`, `plugin`, `catalogOrder`    | `src/screens/sources/`       | Primary functional source-management reference                                  |
| Nuvio Web - Selección de Fuentes (`bf093260…`)             | Stream/source selection                        | ALTERNATE / DUPLICATE | `stream`                               | `src/screens/streams/`       | Earlier stream-selection direction                                              |
| Nuvio Web - Selección de Fuentes (Corregida) (`4b499e96…`) | Corrected stream/source selection              | WEB                   | `stream`                               | `src/screens/streams/`       | Primary stream-selection reference; earlier version supplies extra states only  |
| Nuvio Web - Player Modo Cinemático (`cd6f8162…`)           | Player HUD                                     | WEB                   | `player`                               | `src/screens/player/`        | Presentation over the real native/HLS/DASH/AVPlay pipeline                      |
| Nuvio Web - Player States (Loading & Error) (`d263e60d…`)  | Player loading and recovery/error states       | WEB                   | `player`                               | `src/screens/player/states/` | Required functional states, not static mockups                                  |
| Nuvio Remote - Conexión (`9bb0fff7…`)                      | Remote pairing                                 | REMOTE                | `apps/remote`                          | Not implemented in Web       | Visual-language context only                                                    |
| Nuvio Remote — Estado de conexión (`a61e3858…`)            | Remote connection status                       | REMOTE                | `apps/remote`                          | Not implemented in Web       | Visual-language context only                                                    |
| Nuvio Remote - Mando (`606ce828…`)                         | Remote control surface                         | REMOTE                | `apps/remote`                          | Not implemented in Web       | Visual-language context only                                                    |
| Nuvio Remote - Explorar (`cf2897d8…`)                      | Remote browse surface                          | REMOTE                | `apps/remote`                          | Not implemented in Web       | Visual-language context only                                                    |
| Nuvio Remote - Teclado (`e8482068…`)                       | Remote keyboard                                | REMOTE                | `apps/remote`                          | Not implemented in Web       | Visual-language context only                                                    |
| Post-apocalyptic wide backdrop (`63ace1f2…`)               | Details/hero artwork                           | SHARED REFERENCE      | artwork treatment                      | Asset reference only         | Illustrative artwork, never application data                                    |
| Dramatic survival-series poster (`09be05bb…`)              | Poster artwork                                 | SHARED REFERENCE      | poster treatment                       | Asset reference only         | Illustrative artwork, never application data                                    |
| Highway checkpoint episode still (`970e86b3…`)             | Episode artwork                                | SHARED REFERENCE      | episode cards/player                   | Asset reference only         | Illustrative artwork                                                            |
| Flooded museum episode still (`83a6b884…`)                 | Episode artwork                                | SHARED REFERENCE      | episode cards/player                   | Asset reference only         | Illustrative artwork                                                            |

## Target visual system

- Near-black canvas (`#090b10`) with deep slate surfaces (`#11141d`, `#191e2b`) and restrained hairline borders.
- Electric cobalt (`#3b82f6`) for primary actions and focus, with `#60a5fa` hover emphasis and `#1d4ed8` pressed/ambient states.
- Space Grotesk for display/headline roles and Manrope for body, labels and controls.
- 8px base card/control corners, 16px expanded containers and pill geometry reserved for primary CTAs/badges.
- 64px frosted desktop header, artwork-first wide heroes, 2:3 posters, 16:9 episode/continue-watching cards, and visible keyboard focus.
- Desktop outer margin 3.5rem, tablet 2rem, mobile 1rem; mobile changes to bottom navigation rather than compressing the desktop header.

## Completeness audit

- All 13 Web resources are represented: Home, Search, Explore, Details, Library, Settings, Profiles, repository-faithful Sources, corrected Stream Selection, Player HUD, and Player loading/error states. The two earlier alternates inform secondary states without replacing the corrected designs.
- The five Remote resources remain correctly scoped to `apps/remote`; Web only implements the pairing/approval dialog required to connect that separate application.
- The four artwork resources remain visual references only. No illustrative title, poster, profile, or episode data is hardcoded in `apps/web`.
