# Control remoto — entrega inicial, no SRS completo

> Histórico de la entrega inicial. Para el estado vigente 0.4.0, configuración de persistencia y matriz de requisitos, consultar [remote-srs-status.md](remote-srs-status.md).

Fecha: 2026-09-08. Esta entrega implementa una primera ruta de control y deja explícitos los requisitos pendientes. No se ha desplegado el servicio ni publicado una app.

## Componentes

### Corrección 0.1.1 — teléfono aprobado retenido en Conectar

La app separa ahora vínculo, aprobación, conexión, control activo y estado del reproductor. Antes, `state === null` mostraba el formulario incluso después de aprobar el teléfono. Ahora la aprobación abre el mando sin esperar un vídeo; la pérdida de conexión conserva el mando y desactiva las órdenes. La solicitud pendiente tiene su propia pantalla, sin reclamar otra vez el código de un solo uso.

El servicio comunica aprobación/control/conectividad al autenticar, solicita estado al navegador al conectar o aprobar y admite actualización manual. La web publica inmediatamente y aísla errores de catálogo/pistas para que no cancelen la sincronización completa. La app distingue confirmación de orden y conexión, limita órdenes pendientes y avisa si no se confirman en diez segundos.

Actualizar **ambos servicios en Coolify (web y remoto)** y descargar el nuevo APK **0.1.1 / versionCode 2** del workflow. Después recargar la web y crear un vínculo nuevo, porque reiniciar el servicio revoca sus sesiones en memoria. Las pruebas cubren aprobación con snapshot nulo, desconexión, transferencia de control, compatibilidad con mensajes anteriores y sincronización por WebSocket real de loopback. No se ha ejecutado esta revisión en un teléfono físico; el usuario probó la revisión anterior. La duración de vínculos sigue siendo quince minutos y los pendientes del SRS de abajo siguen vigentes.

#### Revisión de UI y accesibilidad de esta corrección

| Severidad | Ubicación           | Antes                                                   | Después                                       | Motivo                                       |
| --------- | ------------------- | ------------------------------------------------------- | --------------------------------------------- | -------------------------------------------- |
| Alta      | apps/remote/App.tsx | Aprobación sin snapshot retenía el formulario           | Pantallas independientes de solicitud y mando | No bloquear navegación por ausencia de vídeo |
| Media     | apps/remote/App.tsx | Órdenes parecían disponibles sin control activo         | Estado disabled visible y accesible           | Explicar acciones no disponibles             |
| Media     | apps/remote/App.tsx | Actualización periódica borraba el resultado de órdenes | Mensaje separado y persistente                | Mantener errores y confirmaciones legibles   |

Aplicadas las skills better-accessibility y better-layout: botones táctiles de 48, filas flexibles, etiquetas y estados explícitos. **No verificado**: lector de pantalla nativo, aumento de texto al 200%, RTL y renderizado en teléfono real. **Block** para aprobación integral de UI nativa y SRS hasta completar esas comprobaciones; las pruebas de estado no sustituyen la revisión visual.

- `services/remote`: servicio Node + ws, independiente del proxy de proveedores, con Dockerfile y lockfile.
- `js/core/remote`: cliente web y panel en Ajustes → About → Control desde móvil.
- `apps/remote`: app Expo/React Native con TypeScript, entrada manual o escáner QR y credenciales locales en SecureStore.

El backend actual autentica la creación del vínculo usando `/auth/v1/user`; la credencial del usuario no se entrega al móvil. El canal WSS se autentica en su primer mensaje, no en la URL.

## Qué está implementado

- Código aleatorio de 128 bits, una sola reclamación y caducidad de dos minutos.
- Aprobación/rechazo/revocación local, aislamiento de sesiones y almacenamiento de hashes de credenciales en el servicio.
- Comandos cerrados para Inicio, Volver, cruceta direccional, selección, buscar en la web, reproducir, pausar, seek, volumen y silencio.
- Rechazo explícito de pantalla completa remota que requiere gesto local.
- Caducidad de comandos, deduplicación, límites de mensajes, reconexión y estado de reproducción sin URLs ni claves de proveedores.
- UI web responsive con controles nativos; UI móvil inicial para conexión y mando.

## Diferencias pendientes frente al SRS

**No usar esta versión como cumplimiento total del SRS.**

| Requisito                                                | Estado actual / pendiente                                                                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Renovación 30 días y persistencia                        | No implementadas: todos los vínculos duran 15 minutos; reinicio del servicio revoca todo                                                |
| Hasta tres móviles, selección de sesión y control activo | Tres móviles por sesión y transferencia desde web implementados y probados; falta selector de varias sesiones guardadas en la app       |
| Resultados de catálogo en móvil, ficha y episodios       | Resultados paginados, títulos, episodios y fuentes mediante claves opacas; faltan miniaturas y metadatos ampliados de ficha             |
| Audio/subtítulos                                         | Selección HLS/DASH y subtítulos nativos implementada; pendiente prueba con pistas reales y subtítulos externos del reproductor          |
| Pausa/seek confirmados por eventos del reproductor       | Play espera la promesa de reproducción; seek espera seeked con límite de cinco segundos. Falta matriz de errores en dispositivos reales |
| Logout externo al navegador                              | La web revoca al detectar cambio de token/perfil y al salir; falta revocación backend inmediata si la sesión se revoca en otro equipo   |
| Renovación del token del usuario                         | Conservadora: cambiar token detiene el vínculo, aunque sea un refresco de sesión                                                        |
| Heartbeat                                                | Ping cada 15 segundos con desconexión conservadora al siguiente ciclo fallido, no exactamente los 45 segundos del SRS                   |
| Accesibilidad / matriz multiplataforma                   | Panel observado a 320 px; corrección de foco aplicada. Faltan lector de pantalla, 200%, RTL y dispositivo Android/iOS real              |
| Seguridad de producción y carga                          | Pruebas iniciales; falta revisión exhaustiva, límites por IP real detrás del proxy y pruebas de carga                                   |

Los fallos de fuentes y del proxy no se resuelven con el mando. El control remoto no transmite vídeo.

## Desplegar el servicio en Coolify (cuando se apruebe)

Servicio nuevo del mismo repositorio, directorio base **`/services/remote`**, Dockerfile `Dockerfile`, puerto interno 3001. Una sola réplica: el estado es local al proceso. Asignar un dominio HTTPS propio y activar paso de WebSocket en el proxy.

Variables del servicio remoto:

```env
HOST=0.0.0.0
PORT=3001
REMOTE_ALLOWED_ORIGINS=https://movies.gykstudio.tech
REMOTE_DEVICE_ORIGINS=https://remote.gykstudio.tech
NUVIO_SUPABASE_URL=https://nuvio.gykstudio.tech
NUVIO_SUPABASE_ANON_KEY=CLAVE_PUBLICA_DE_TU_BACKEND
```

No usar `service_role`. El servicio no descubre automáticamente la clave pública: debe configurarse explícitamente. No colocar estas credenciales en el código.

En el servicio **NuvioWeb**, añadir y redesplegar:

```env
NUVIO_REMOTE_URL=https://remote.gykstudio.tech
```

Dominio elegido por el usuario: `remote.gykstudio.tech`. La app lo incluye como valor inicial editable. No se ha configurado DNS ni Coolify automáticamente. Dejar la variable vacía mantiene el servicio sin conectar.

## Desarrollo y comprobación

```bash
cd services/remote
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
# Configurar las variables anteriores antes de pnpm start
```

```bash
cd apps/remote
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm start
```

No hay APK ni IPA generados localmente en esta entrega. Con HTTPS público, web y móvil no necesitan estar en la misma LAN.

### APK automático para probar en Android

El workflow `.github/workflows/remote-android.yml` se ejecuta al subir cambios de la app o del servicio, al crear un tag `vX.Y.Z` y también con **Actions → Nuvio Remote Android APK → Run workflow**. El tag debe coincidir con la versión de `apps/remote/app.json`; para esta revisión es `v0.4.0`. Comprueba TypeScript y el protocolo, genera Android con Expo Prebuild y compila `assembleRelease` con JavaScript incluido. No necesita Expo Go, Metro, EXPO_TOKEN ni una cuenta de Expo.

Cuando termine en verde, descarga el artefacto `nuvio-remote-android-v0.4.0-N`, extrae el ZIP e instala el APK en un teléfono Android ARM64. Al ejecutarse con el tag `v0.4.0`, además adjunta la APK al release de GitHub con ese tag. Es un APK con firma de prueba, no una publicación de Play Store. Para distribución pública se necesita firma privada de producción. El workflow aún no se ha ejecutado en GitHub; la generación nativa local sí pasó. Esta máquina no tiene Android SDK disponible en las rutas comprobadas, por lo que no se ha validado la compilación Gradle completa.

Primero despliega el servicio en `https://remote.gykstudio.tech` con las variables indicadas arriba y redespliega la web con `NUVIO_REMOTE_URL`. Comprueba `/health` del servicio. Abre Ajustes → About → Control desde móvil en la web, crea un código, escanéalo con la app y aprueba el dispositivo en la web. Prueba búsqueda, selección, pausa, salto y volumen. Los vínculos de esta versión caducan a los 15 minutos: crea otro código para continuar.

El fork `self-host/` está excluido de Git y Docker; no se incorpora al APK ni al repositorio web. El servicio remoto usa su API de autenticación existente; no modifica sus tablas ni necesita `service_role`.

Pruebas realizadas: núcleo/canal WSS (sin TLS, en loopback con identidades de prueba), aislamiento y caducidad de claves de catálogo, TypeScript de la app, lint de módulos web y compilación de NuvioWeb. Exportación Metro/Hermes para Android realizada correctamente en `/tmp/nuvio-remote-export-v2`; no es un APK. La autenticación con el backend real y la reproducción controlada desde un teléfono no se han verificado de extremo a extremo.

Prueba adicional de catálogo, desde la raíz del repositorio (requiere las dependencias web): `node --test services/remote/content.test.mjs`.

El contrato usa `catalog.activate` y `player.selectTrack` con claves opacas emitidas por la web, en lugar de aceptar identificadores o enlaces arbitrarios del teléfono. `catalog.page` solicita una página de doce opciones. Los nombres y descripciones se limitan; URLs de proveedores no se incluyen en los mensajes de catálogo. Crear otro código conserva la sesión y los dispositivos existentes hasta el máximo de tres.

Referencias de implementación: [Expo SDK](https://docs.expo.dev/versions/latest/) y [ws](https://github.com/websockets/ws). Versiones fijadas en los lockfiles; no se usa React Native latest mezclado con un SDK incompatible.

## Evaluación UI inicial

| Severidad                      | Ubicación                     | Antes                        | Después                                        | Motivo                                          |
| ------------------------------ | ----------------------------- | ---------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| Media                          | js/core/remote/remotePanel.js | Sin panel de mando           | Diálogo con botones nativos, etiqueta y estado | Acceso por ratón, teclado y tacto               |
| Media                          | css/responsive.css            | Sin layout de emparejamiento | Panel observado a 320 px sin recorte lateral   | Reflow de controles                             |
| Alta pendiente de verificación | apps/remote/App.tsx           | Sin app                      | UI inicial tipada, no probada en móvil real    | No aprobar accesibilidad nativa sin comprobarla |

**Block para declarar cumplimiento integral del SRS**: falta la matriz E2E y los requisitos listados como pendientes. Las pruebas parciales no constituyen aprobación del producto completo.
