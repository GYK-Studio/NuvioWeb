# Control remoto 0.4.0 — estado del SRS

Fecha: 2026-09-09. El SRS original conserva los criterios de aceptación; este informe no los reduce. Implementación ampliada, **aceptación integral pendiente**. La app móvil se entrega como 0.4.0 / versionCode 5.

## Despliegue requerido

Actualizar web, servicio remoto y APK juntos. Esta revisión cambia el protocolo y la duración de credenciales. Crear vínculos nuevos después de actualizar desde el servicio anterior, que no conservaba sesiones en disco.

En el servicio `remote.gykstudio.tech` de Coolify:

```env
HOST=0.0.0.0
PORT=3001
REMOTE_ALLOWED_ORIGINS=https://movies.gykstudio.tech
REMOTE_DEVICE_ORIGINS=https://remote.gykstudio.tech
REMOTE_DATA_FILE=/data/remote.json
REMOTE_AUDIT_DAYS=7
NUVIO_SUPABASE_URL=https://nuvio.gykstudio.tech
NUVIO_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA_EXISTENTE
```

Montar **un volumen persistente en `/data`**, con permiso de escritura para el usuario `node` del contenedor (UID 1000). **Una réplica**: almacenamiento local, no un servicio distribuido. Sin volumen, recrear el contenedor pierde los vínculos. No usar `service_role`. No subir `/data/remote.json` al repositorio. Hacer copias de seguridad protegidas y no restaurar copias antiguas sin considerar que pueden restaurar permisos revocados.

La web conserva `NUVIO_REMOTE_URL=https://remote.gykstudio.tech`. APK **0.4.0 / versionCode 5**, generado por el workflow existente. No hay APK compilado localmente ni despliegue ejecutado por el agente.

## Cobertura funcional

| SRS      | Implementación / límites                                                                                                                                                                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RF-01–05 | Panel, código 128 bits/120 s/uso único, QR sin credenciales, nombre del móvil y aprobación local. El QR lleva el desafío; el servicio se configura en la app.                                                                                                                                                       |
| RF-06    | Acceso 15 min, renovación autenticada, límite absoluto de vínculo 30 días, hashes persistentes; secretos móviles en SecureStore. La pestaña web debe permanecer abierta: cerrar o recargar revoca su sesión.                                                                                                        |
| RF-07    | Logout local bloquea ejecución; perfil nuevo suspende permisos y requiere aprobación. Renovación de JWT del mismo usuario ya no destruye el vínculo. **Revocación externa del backend no es un evento inmediato:** depende de la validación del backend al renovar; falta integración de eventos para garantizarlo. |
| RF-08    | Límites por IP y hash de desafío, además de cuotas de sesiones/dispositivos. Detrás de Coolify se usa IP del socket: límites conservadores compartidos por proxy, no se confía en X-Forwarded-For. Pendiente diseño/prueba de IP real confiable.                                                                    |
| RF-09–10 | Hasta cinco pantallas guardadas y seleccionables, nombres propios; Inicio, Volver, Biblioteca y Descubrir mediante acciones semánticas. La app móvil también incluye cruceta arriba/abajo/izquierda/derecha y selección OK; la web mueve el foco con su motor de navegación existente.                              |
| RF-11    | Resultados paginados con clave opaca, título, tipo/año y miniatura si procede de image.tmdb.org. Otros servidores de imágenes no están permitidos. Inicio, biblioteca y catálogo de Descubrir expuestos, con cargar más en Descubrir.                                                                               |
| RF-12–13 | Ficha, selector de temporada, episodio y fuente explícita. No se permite que una fuente retirada caiga en la primera del filtro. Se espera reproducción observable hasta 5 s; una carga más lenta puede devolver error aunque termine después.                                                                      |
| RF-14–17 | Play/pausa/seek/volumen/silencio, velocidad, pistas nativas y de addons a través de las opciones existentes de la web. Selección de pistas confirmada por estado hasta 5 s. Estado incluye buffering y capacidades. Pendiente matriz con medios reales.                                                             |
| RF-18–19 | Pantalla completa/autoplay no fingen éxito; aviso con gesto local en la web. Volumen se comprueba tras asignación.                                                                                                                                                                                                  |
| RF-20–22 | Estados de autorización separados de reproducción, heartbeat 15 s/umbral 45 s, reconexión exponencial, sin cola offline, snapshot obligatorio, versión y resincronización de brechas; posición interpolada visualmente.                                                                                             |
| RF-23    | Vínculos guardados, nombre, consulta de estado/última actividad, selección y revocación HTTP aunque no haya WebSocket. La web lista móviles/última actividad y permite revocar.                                                                                                                                     |
| RF-24    | Cámara solo al escanear, entrada manual; no micrófono, ubicación ni contactos.                                                                                                                                                                                                                                      |

Las rutas/acciones propuestas del SRS se materializan en el protocolo existente: `catalog.activate` y `player.selectTrack` usan claves opacas, no URLs. Renovación: `POST /remote/refresh/web`, `POST /remote/refresh/device`; consulta/revocación: `POST /remote/device/status`, `POST /remote/devices/revoke`.

## Persistencia y auditoría

Archivo atómico sincronizado a disco, permisos 0600. Guarda propietarios, hashes, permisos, deduplicación y auditoría; no guarda tokens en claro, estado de catálogo ni URLs de vídeo. Auditoría con tipo/resultado/fecha/identificadores seudónimos, máximo 20 000 registros y hasta 7 días por defecto (configurable 1–30). Ese límite puede eliminar eventos antes del plazo bajo carga. No es una auditoría regulatoria ni un registro ilimitado. Escritura síncrona por cambios: falta medir carga real antes de prometer objetivos p95.

## Verificación

Pruebas automatizadas actuales: esquema, aislamiento, caducidad, renovación por propietario, 30 días absolutos, revocación y reinicio en disco, ausencia de secretos, selección entre pantallas, renovación móvil simulando SecureStore, snapshot nuevo, aprobación Android con Origin real, rechazo de Origin ajeno, suspensión de perfil, rangos táctiles y catálogo opaco. TypeScript, lint de adaptadores y build web; exportación Metro/Hermes Android realizada. Estas pruebas usan identidades/transportes locales y dobles de módulos nativos; no sustituyen un teléfono físico.

Pendientes para aceptar el SRS completo: E2E móvil-web con vídeos autorizados y audio/subtítulos reales; pruebas de 320 px, texto 200%, RTL y lector de pantalla; matriz Chrome/Edge/Firefox/Safari y Android/iOS; p95 y carga bajo proxy; revocación global inmediata vía backend; revisión de seguridad del almacenamiento y del comportamiento ante fallo de disco. Sin ADB, SDK Android, Docker ni acceso al teléfono en este entorno, no se puede cerrar esa validación aquí.

## Revisión UI

| Severidad | Ubicación                     | Antes                                          | Después                                            | Motivo                                          |
| --------- | ----------------------------- | ---------------------------------------------- | -------------------------------------------------- | ----------------------------------------------- |
| Alta      | apps/remote/session.ts        | Control habilitado sin snapshot fresco         | Se bloquea hasta sincronizar                       | No actuar sobre estado antiguo                  |
| Media     | apps/remote/App.tsx           | Un solo vínculo y acciones básicas             | Mis pantallas, temporadas, velocidad, metadatos    | Agrupar acciones por tarea, según better-layout |
| Media     | js/core/remote/remotePanel.js | Avisos de gesto solo visibles dentro del panel | Aviso local con botones y código de error al móvil | No fingir una acción bloqueada por el navegador |

**Block para aprobación integral**, no para ejecución de las pruebas locales: falta la verificación nativa y operativa indicada. No se ha modificado el diseño general de la web.
