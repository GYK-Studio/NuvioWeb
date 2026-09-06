# Nuvio Web

Nuvio is a browser-first media library for movies and series. Bring your own sources together, search across them, keep a personal library, and continue watching from any modern browser.

The experience is designed for desktop, laptop, tablet, and mobile browsers. It uses responsive navigation, native browser playback with HLS/DASH support, and a browser-based plugin runtime.

## Requirements

- Node.js 20.19 or newer
- npm 10 or newer
- A modern browser with WebAssembly and Web Workers enabled

## Run locally

```bash
npm install
npm run build
npm run serve
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

## Configuration

Copy `local.example.properties` to `local.properties`, then add the services you use. `NUVIO_LOGIN_WEB_BASE_URL` should be the public origin used for sign-in redirects when it differs from the current browser origin.

Plugin providers run in the browser and therefore must allow browser requests from your Nuvio origin. Media playback is subject to the browser's supported codecs and the source server's CORS policy.

### Nuvio Self-Host backend

Nuvio Self-Host exposes its public client configuration at `<backend>/.well-known/nuvio`. For a browser deployment, configure only the backend URL and let the web server obtain the public publishable key at runtime:

```properties
NUVIO_BACKEND_URL=https://nuvio.gykstudio.tech
NUVIO_LOGIN_WEB_BASE_URL=https://app.example.com
```

You may instead provide `NUVIO_SUPABASE_URL` and `NUVIO_SUPABASE_ANON_KEY` explicitly. Use only the backend's publishable/anon key; never place a service-role key, database password, or private token in the browser configuration.

### Deploy on Coolify

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

## Scripts

- `npm run build` — produces the static web bundle in `dist/`.
- `npm run serve` — serves the built bundle locally.
- `npm run lint` — checks the JavaScript source.
- `npm test` — builds and runs the plugin regression checks.

## License

[GNU General Public License v3.0](./LICENSE)
