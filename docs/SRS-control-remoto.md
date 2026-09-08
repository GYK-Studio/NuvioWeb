# SRS — Control remoto de NuvioWeb y app móvil

Versión: 1.0 · Fecha: 2026-09-08 · Estado: propuesta para revisión.

## 1. Objetivo y alcance

Permitir controlar una sesión de NuvioWeb abierta en un navegador desde una app móvil emparejada. La web continúa siendo una aplicación responsive para ratón, teclado y táctil; no se convierte en una interfaz de TV ni depende de un mando.

Este documento especifica una futura función del cliente, una app móvil y el transporte backend necesario. **No implementa ninguno de estos componentes ni presupone endpoints existentes.**

Destinos conocidos: cliente `https://movies.gykstudio.tech` y backend `https://nuvio.gykstudio.tech`. La ruta y dominio del servicio de control se decidirán al implementar. El proxy de proveedores no debe usarse como canal de control.

### Dentro del MVP

- App para Android/iOS: propuesta React Native con Expo y TypeScript, pendiente de confirmar al comenzar.
- Web: panel de emparejamiento, indicador de conexión y adaptador de comandos semánticos.
- Backend: autorización, emparejamiento, registro de dispositivos y canal bidireccional.
- Buscar, abrir títulos/episodios, iniciar reproducción, pausar, reanudar, buscar posición, ajustar volumen local y seleccionar pistas disponibles.
- Revocar dispositivos y recuperación tras desconexión.

### Fuera del MVP

- Transmitir el archivo de vídeo al móvil, Chromecast/AirPlay, descargas, DRM o elusión de restricciones.
- Control del sistema operativo, teclado global, acceso a archivos o encendido del equipo.
- Compras, cambios de contraseña, instalación de plugins y cambios de perfil desde el mando.
- Cambiar la fuente de reproducción sin selección explícita; automatizar ventanas emergentes.
- Controlar a terceros sin su consentimiento o a través de URLs arbitrarias.

## 2. Actores y permisos

| Actor               | Permisos                                                            |
| ------------------- | ------------------------------------------------------------------- |
| Usuario en la web   | Inicia y confirma emparejamiento, habilita control, revoca sesiones |
| App emparejada      | Envía comandos autorizados solo al navegador seleccionado           |
| Cliente web         | Valida, ejecuta y comunica el resultado real de cada comando        |
| Servicio de control | Autentica, aplica límites y enruta mensajes a sesiones autorizadas  |

Por defecto una app controla una sesión web seleccionada. Hasta tres apps pueden estar emparejadas por sesión, pero solo una tiene el control activo; la web puede recuperarlo inmediatamente. Las acciones locales siempre funcionan y no quedan bloqueadas por la app.

## 3. Arquitectura propuesta

App móvil ↔ servicio de control autenticado ↔ adaptador remoto de NuvioWeb ↔ Router/reproductor.

El servicio no decide si una acción tuvo éxito: la web emite el resultado después de ejecutarla. Un envío recibido por el servidor no equivale a una reproducción iniciada.

Usar HTTPS para gestión y WSS para comandos/estado. Evaluar Supabase Realtime solo tras verificar permisos por canal, revocación y límites en el backend real; no asumir que esa configuración existe actualmente.

Cada pestaña recibe un `webSessionId` independiente. La app lista nombres elegidos por el usuario, no solo el navegador. Nada de descubrir equipos escaneando la LAN.

## 4. Requisitos funcionales

### Emparejamiento

- RF-01: «Control desde móvil» en Ajustes abre un panel accesible con QR y código alternativo.
- RF-02: crear un desafío aleatorio de al menos 128 bits, válido 120 segundos, de un solo uso. El código manual debe ser aleatorio y tener al menos ocho caracteres.
- RF-03: el QR contiene solo el desafío temporal y una URL de aplicación controlada; nunca tokens de usuario, claves API ni contraseñas.
- RF-04: la app escanea o introduce el código y muestra el nombre de la sesión destino.
- RF-05: la web exige confirmación local con nombre del móvil antes de conceder permisos. No aceptar automáticamente por escanear.
- RF-06: tras confirmar, emitir credencial de dispositivo limitada a esa sesión y ámbitos. Expiración de acceso propuesta: 15 minutos; renovación revocable, duración máxima de vínculo: 30 días.
- RF-07: cerrar sesión en la web, borrar vínculo o cambiar de cuenta revoca el control inmediatamente. Cambiar de perfil suspende el vínculo hasta reconfirmación local.
- RF-08: limitar intentos de código a cinco por minuto y actor; combinar límites por IP/desafío sin depender únicamente de IP.

### Navegación y catálogo

- RF-09: la app permite elegir una sesión conectada y muestra claramente a cuál enviará órdenes.
- RF-10: enviar acciones semánticas (`navigation.home`, `navigation.back`, `catalog.search`, `catalog.open`) en lugar de pulsaciones o coordenadas.
- RF-11: resultados de búsqueda con ID, tipo, título, año y miniatura. Validar y paginar consultas; no transferir toda la biblioteca.
- RF-12: la ficha permite seleccionar temporada/episodio y pedir reproducción mediante los flujos existentes de la web.
- RF-13: si falta una fuente, mostrar el error real; no iniciar otra obra ni instalar proveedores como consecuencia de una orden.

### Reproductor

- RF-14: `player.play`, `player.pause`, `player.seek`, `player.setVolume`, `player.setMuted`, `player.selectAudio` y `player.selectSubtitle`.
- RF-15: seek absoluto en segundos dentro del rango disponible; volumen entre 0 y 1. Validar estado y valores en servidor y cliente.
- RF-16: las pistas se seleccionan por un ID presente en la instantánea actual, nunca una URL enviada por la app.
- RF-17: mostrar título, episodio, duración, posición, estado, volumen, pistas y capacidades disponibles. No revelar URLs de streaming, cookies ni cabeceras de proveedores.
- RF-18: pantalla completa y autoplay son capacidades condicionadas a las reglas del navegador. Si requieren gesto local, devolver `LOCAL_INTERACTION_REQUIRED` y mostrar aviso en la web; nunca simular éxito.
- RF-19: si el dispositivo no permite controlar volumen, anunciar `UNSUPPORTED_CAPABILITY`; el volumen del sistema queda fuera del alcance.

### Conexión y dispositivos

- RF-20: estados visibles: desconectado, emparejando, pendiente de aprobación, conectado, reconectando, revocado y error.
- RF-21: heartbeat cada 15 segundos; declarar desconexión tras 45 segundos sin respuesta. Reconectar con espera exponencial y variación aleatoria, máximo 30 segundos entre intentos.
- RF-22: no acumular órdenes de reproducción mientras está desconectado. Al reconectar, obtener una instantánea nueva antes de habilitar controles.
- RF-23: lista de vínculos en web y app con nombre, última actividad, estado y botón de revocación.
- RF-24: permisos de cámara solo al escanear; entrada manual disponible si se deniegan. No solicitar micrófono, ubicación ni contactos.

## 5. Contrato propuesto

Rutas propuestas, todavía inexistentes:

| Ruta                              | Uso                                       |
| --------------------------------- | ----------------------------------------- |
| POST /remote/pairings             | Web autenticada crea desafío              |
| POST /remote/pairings/claim       | App solicita vínculo usando desafío       |
| POST /remote/pairings/:id/approve | Confirmación desde sesión web propietaria |
| DELETE /remote/devices/:id        | Revocar vínculo propio                    |
| GET /remote/sessions              | Sesiones autorizadas y capacidades        |
| WSS /remote/channel               | Comandos, confirmaciones y estado         |

Esquema de comando:

```json
{
  "version": 1,
  "commandId": "uuid",
  "webSessionId": "uuid",
  "sequence": 42,
  "type": "player.seek",
  "payload": { "positionSeconds": 120 },
  "expiresAt": "ISO-8601"
}
```

Identidad de emisor obtenida de su credencial, no de campos confiados del mensaje. TTL máximo de comando: 10 segundos. Mensaje máximo: 16 KiB. Lista cerrada de tipos y propiedades.

La respuesta contiene `commandId`, estado `accepted/completed/rejected`, `stateVersion` y código de error si aplica. Deduplicar `commandId` durante al menos cinco minutos; no ejecutar dos veces órdenes repetidas. Procesar secuencialmente por sesión y descartar órdenes caducadas o de vínculo revocado.

Los eventos `session.snapshot`, `player.state`, `command.result`, `device.revoked` y `connection.status` llevan versión y secuencia. Actualizar posición como máximo una vez por segundo, con interpolación visual en la app. Una brecha de secuencia exige resincronizar.

Errores definidos: `UNAUTHORIZED`, `PAIRING_EXPIRED`, `PAIRING_DENIED`, `SESSION_OFFLINE`, `RATE_LIMITED`, `INVALID_PAYLOAD`, `UNSUPPORTED_CAPABILITY`, `LOCAL_INTERACTION_REQUIRED`, `NO_SOURCE`, `PLAYBACK_FAILED`, `STALE_STATE`.

## 6. Datos y seguridad

- Tablas/colecciones propuestas: sesiones web, desafíos temporales, dispositivos vinculados y concesiones de acceso. Guardar hashes de secretos, no secretos en texto claro.
- Asociación obligatoria entre cuenta, sesión y dispositivo; aislamiento comprobable entre usuarios. Nunca canales públicos con nombres predecibles.
- Tokens móviles en Keychain/Keystore. En web preferir cookies HttpOnly/Secure/SameSite para sesiones si la arquitectura lo permite; no poner secretos en query strings de WebSocket ni logs.
- Verificar Origin del canal web, proteger endpoints con cookies contra CSRF y autenticar clientes móviles. Origin por sí solo no es autenticación.
- Validar esquemas y permisos en ambos extremos. Prohibidos `eval`, shell, inyección de teclas globales, HTML y URLs de navegación arbitrarias.
- Límite inicial: 20 comandos/segundo por dispositivo, ráfaga 30. Agrupar seek/volumen durante arrastre y preservar el último valor confirmado.
- Registro mínimo: tipo de acción, resultado, fecha e identificadores seudónimos; sin títulos, tokens o URLs de vídeo por defecto. Retención propuesta: siete días, configurable y documentada.
- El usuario puede revocar todas las sesiones. No eliminar cuenta ni datos de biblioteca desde el mando.

## 7. Experiencia, accesibilidad y calidad

- Web: panel usable desde 320 px, sin desplazamiento horizontal; QR acompañado de código textual, foco atrapado en modal y restaurado al cerrar.
- App: objetivos táctiles de al menos 44×44 puntos, soporte de lector de pantalla y texto ampliado. No comunicar estado solo por color.
- Latencia objetivo bajo conexión estable: confirmación p95 inferior a 500 ms; reflejo de estado p95 inferior a 1 segundo. Medir, no asumir.
- Mostrar «orden enviada» separado de «reproduciendo». Si el vídeo está almacenando en búfer, reflejarlo.
- Android/iOS suspenden aplicaciones: no prometer conexión persistente en segundo plano; reconectar al volver al primer plano.
- Soporte web objetivo: últimas dos versiones estables de Chrome, Edge, Firefox y Safari al implementar. Probar Chrome Android y Safari iOS explícitamente.

## 8. Criterios de aceptación

| ID    | Prueba                                            | Resultado exigido                                       |
| ----- | ------------------------------------------------- | ------------------------------------------------------- |
| AC-01 | Escanear QR y aprobar localmente                  | Solo el móvil aprobado obtiene control                  |
| AC-02 | Código expirado, repetido o diez intentos rápidos | Rechazo y limitación, sin vínculo                       |
| AC-03 | Cuenta A intenta controlar sesión B               | Rechazo tanto HTTP como WSS                             |
| AC-04 | Enviar dos veces el mismo commandId               | Una ejecución, misma confirmación                       |
| AC-05 | Play/pause/seek con fuente de prueba autorizada   | Estado y posición reales reflejados                     |
| AC-06 | Fuente inexistente o error del reproductor        | Error visible; no falso éxito                           |
| AC-07 | Desconectar y reconectar ambos extremos           | No reproducir órdenes antiguas; snapshot nuevo          |
| AC-08 | Revocar desde web con conexión activa             | Siguiente comando rechazado y canal cerrado             |
| AC-09 | Pantalla completa sin gesto local                 | Aviso correcto, sin promesa de ejecución                |
| AC-10 | Dos pestañas y dos móviles                        | Aislamiento por sesión y control activo inequívoco      |
| AC-11 | 320 px, teclado, lector de pantalla               | Emparejamiento y revocación completos sin ratón         |
| AC-12 | Inspeccionar logs, QR y eventos                   | Sin claves, sesiones de usuario ni enlaces de streaming |

Incluir pruebas unitarias de esquema/deduplicación, integración de permisos y revocación, E2E móvil-web, carga y fallos de red. Usar medios de prueba propios o autorizados; no depender de un proveedor externo para validar el protocolo.

## 9. Plan de entrega y decisiones pendientes

1. Validar este SRS y comprobar capacidades reales del backend de autenticación.
2. Implementar y probar protocolo, permisos y emparejamiento del servidor.
3. Incorporar adaptador semántico y panel responsive en la web bajo bandera de función.
4. Crear app móvil con emparejamiento, selector de sesión y mando.
5. Ejecutar matriz de aceptación, revisar seguridad y desplegar gradualmente en Coolify.

Pendientes antes de implementación: confirmar Expo frente a alternativas, versiones mínimas Android/iOS, disponibilidad de Realtime frente a servicio WSS propio, política final de sesiones/retención, distribución APK/TestFlight/tiendas y cuentas de publicación. No crear apps, servicios ni migraciones hasta la siguiente autorización.
