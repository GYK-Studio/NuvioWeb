# Nuvio Web

[![Remote APK](https://github.com/GYK-Studio/NuvioWeb/actions/workflows/remote-android.yml/badge.svg)](https://github.com/GYK-Studio/NuvioWeb/actions/workflows/remote-android.yml)
[![Release](https://img.shields.io/github/v/release/GYK-Studio/NuvioWeb)](https://github.com/GYK-Studio/NuvioWeb/releases)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](./LICENSE)

**[Español](#-español) · [English](#-english)**

---

## 🇪🇸 Español

Nuvio es una mediateca centrada en el navegador para películas y series. Reúne tus propias fuentes, busca entre ellas, guarda tu biblioteca personal y sigue viendo desde cualquier navegador moderno.

Funciona en navegadores de escritorio, portátil, tableta y móvil. Usa navegación responsive, reproducción nativa con soporte HLS/DASH y un runtime de plugins en el navegador.

### Novedades

- **Nuvio Remote (APK `v0.1.1`):** mando para Android que controla la web — D-pad con repetición al mantener, scroll de página, pestaña de teclado, escáner QR con linterna y exploración de películas, series y fuentes. Descárgala en [Releases](https://github.com/GYK-Studio/NuvioWeb/releases).
- **Plugins latinos incluidos:** Nuvio Latino (17 proveedores), Latino Providers (10) y Nuvio Latino Hub (2). Se hidratan solos al abrir Plugins; se pueden eliminar y volver a añadir por URL.
- **Control desde móvil:** en la web, Ajustes → About → Control desde móvil muestra un QR y un código de 32 caracteres para emparejar el teléfono.

### Requisitos

- Node.js 20.19 o superior
- npm 10 o superior
- Un navegador moderno con WebAssembly y Web Workers activados

### Ejecutar en local

```bash
npm install
npm run build
npm run serve
```

Abre [http://127.0.0.1:4173](http://127.0.0.1:4173).

### Configuración

Copia `local.example.properties` a `local.properties` y añade los servicios que uses. `NUVIO_LOGIN_WEB_BASE_URL` debe ser el origen público usado en los redirects de login cuando difiere del origen del navegador.

Los proveedores de plugins corren en el navegador y por tanto deben permitir peticiones desde tu origen Nuvio. La reproducción depende de los códecs del navegador y de la política CORS del servidor fuente.

#### Backend Nuvio Self-Host

El backend expone su configuración pública en `<backend>/.well-known/nuvio`. Para un despliegue de navegador, configura solo la URL del backend y deja que el servidor obtenga la clave pública en runtime:

```properties
NUVIO_BACKEND_URL=https://nuvio.gykstudio.tech
NUVIO_LOGIN_WEB_BASE_URL=https://app.example.com
```

Puedes dar `NUVIO_SUPABASE_URL` y `NUVIO_SUPABASE_ANON_KEY` explícitamente. Usa solo la clave pública/anon; nunca pongas service-role, contraseñas ni tokens privados en la configuración del navegador.

Repositorio del backend: [GYK-Studio/self-host-M](https://github.com/GYK-Studio/self-host-M).

#### Desplegar en Coolify

Despliega este repositorio como aplicación **Dockerfile**. Mantén backend y cliente en hostnames separados: por ejemplo, `https://nuvio.gykstudio.tech` para el backend y `https://app.gykstudio.tech` para este cliente. No pueden compartir la misma raíz de dominio.

En Coolify configura:

- **Port Exposes:** `3000`
- **Health check path:** `/health`
- **Variables runtime-only:**

```properties
NUVIO_BACKEND_URL=https://nuvio.gykstudio.tech
NUVIO_LOGIN_WEB_BASE_URL=https://app.gykstudio.tech
HOST=0.0.0.0
PORT=3000
```

No las marques como variables de build: el contenedor sirve `nuvio.env.js` por petición, así que cambiar el backend solo requiere reiniciar el servicio. Añade `https://app.gykstudio.tech` al `SITE_URL` y `ADDITIONAL_REDIRECT_URLS` del backend, y permite ese origen en su CORS.

### Scripts

- `npm run build` — genera el bundle estático en `dist/`.
- `npm run serve` — sirve el bundle en local.
- `npm run lint` — revisa el JavaScript.
- `npm test` — compila y corre las pruebas de plugins.

### Estructura

- `js/` — cliente web (pantallas, reproductor, plugins, control remoto).
- `apps/remote/` — Nuvio Remote (Expo/React Native, APK `v0.1.1`).
- `services/remote/` — servicio del canal remoto (`remote.gykstudio.tech`).
- `services/plugin-http.cjs` — servicio de red para plugins.
- `self-host/` — backend autoalojable ([repo aparte](https://github.com/GYK-Studio/self-host-M)).

---

## 🇬🇧 English

Nuvio is a browser-first media library for movies and series. Bring your own sources together, search across them, keep a personal library, and continue watching from any modern browser.

The experience is designed for desktop, laptop, tablet, and mobile browsers. It uses responsive navigation, native browser playback with HLS/DASH support, and a browser-based plugin runtime.

### Highlights

- **Nuvio Remote (APK `v0.1.1`):** Android remote that controls the web — D-pad with press-and-hold repeat, page scroll, keyboard tab, QR scanner with torch, and movie/series/source browsing. Get it from [Releases](https://github.com/GYK-Studio/NuvioWeb/releases).
- **Bundled Latino plugins:** Nuvio Latino (17 providers), Latino Providers (10), and Nuvio Latino Hub (2). They hydrate automatically when you open Plugins; they can be removed and re-added by URL.
- **Phone control:** on the web, Settings → About → Control desde móvil shows a QR and a 32-character code to pair your phone.

### Requirements

- Node.js 20.19 or newer
- npm 10 or newer
- A modern browser with WebAssembly and Web Workers enabled

### Run locally

```bash
npm install
npm run build
npm run serve
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

### Configuration

Copy `local.example.properties` to `local.properties`, then add the services you use. `NUVIO_LOGIN_WEB_BASE_URL` should be the public origin used for sign-in redirects when it differs from the current browser origin.

Plugin providers run in the browser and therefore must allow browser requests from your Nuvio origin. Media playback is subject to the browser's supported codecs and the source server's CORS policy.

#### Nuvio Self-Host backend

Nuvio Self-Host exposes its public client configuration at `<backend>/.well-known/nuvio`. For a browser deployment, configure only the backend URL and let the web server obtain the public publishable key at runtime:

```properties
NUVIO_BACKEND_URL=https://nuvio.gykstudio.tech
NUVIO_LOGIN_WEB_BASE_URL=https://app.example.com
```

You may instead provide `NUVIO_SUPABASE_URL` and `NUVIO_SUPABASE_ANON_KEY` explicitly. Use only the backend's publishable/anon key; never place a service-role key, database password, or private token in the browser configuration.

Backend repository: [GYK-Studio/self-host-M](https://github.com/GYK-Studio/self-host-M).

#### Deploy on Coolify

Deploy this repository as a **Dockerfile** application. Keep the backend and browser client on separate hostnames: for example, retain `https://nuvio.gykstudio.tech` for the Nuvio backend and assign `https://app.gykstudio.tech` to this web client. They cannot both own the same domain root.

In Coolify configure:

- **Port Exposes:** `3000`
- **Health check path:** `/health`
- **Runtime-only variables:**

```properties
NUVIO_BACKEND_URL=https://nuvio.gykstudio.tech
NUVIO_LOGIN_WEB_BASE_URL=https://app.gykstudio.tech
HOST=0.0.0.0
PORT=3000
```

Do not mark the Nuvio values as build variables: the container supplies `nuvio.env.js` at request time, so changing the backend endpoint or public key only requires a service restart. Add `https://app.gykstudio.tech` to the backend's `SITE_URL` and `ADDITIONAL_REDIRECT_URLS`, and allow that origin through its CORS policy.

### Scripts

- `npm run build` — produces the static web bundle in `dist/`.
- `npm run serve` — serves the built bundle locally.
- `npm run lint` — checks the JavaScript source.
- `npm test` — builds and runs the plugin regression checks.

### Layout

- `js/` — web client (screens, player, plugins, remote control).
- `apps/remote/` — Nuvio Remote (Expo/React Native, APK `v0.1.1`).
- `services/remote/` — remote channel service (`remote.gykstudio.tech`).
- `services/plugin-http.cjs` — network service for plugins.
- `self-host/` — self-hostable backend ([separate repo](https://github.com/GYK-Studio/self-host-M)).

## License

[GNU General Public License v3.0](./LICENSE)
