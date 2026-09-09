# Cambios implementados

Fecha de revisión: 2026-09-09

Este documento refleja el código actual. No presenta como terminadas funciones que todavía
requieren despliegue, credenciales o validación en dispositivos reales.

## Interfaz web 2.0

- Se eliminó la marca circular provisional. El header usa el wordmark original incluido en Nuvio,
  navegación semántica, estados activos y enlace “Saltar al contenido”.
- En escritorio, la navegación principal vive en el header. En pantallas estrechas se transforma
  en un dock inferior táctil, respetando el área segura del sistema.
- Se neutralizaron alturas, escalas, desplazamientos y railes heredados de TV en las rutas web.
- Home ahora usa un hero fluido, filas horizontales nativas, cards 2:3 y cards 16:9 para continuar
  viendo. Las filas aceptan rueda, trackpad y touch sin mostrar una barra invasiva.
- Explorar, Biblioteca y Buscar usan grids fluidos. Los filtros se adaptan por columnas, sus menús
  tienen una capa propia sobre los resultados y mantienen el texto legible en todos sus estados.
- Ajustes usa dos columnas en escritorio y navegación horizontal en móvil. Fuentes, formularios,
  perfiles y selección de streams comparten superficies y espaciado consistentes.
- Se añadieron foco visible, objetivos táctiles, tipografía adaptable, propiedades lógicas,
  desplazamiento por rueda/trackpad sin barras visibles, `prefers-reduced-motion` y soporte de
  colores forzados.
- Verificación visual realizada en 1440 px, 360 px y 320 px. Sigue pendiente revisar Safari/iOS y
  lector de pantalla real.

## APK Nuvio Remote 0.4.0

- `versionCode` 5 y metadatos de paquete sincronizados.
- Nuevo icono coral, magenta y violeta sin texto, con variantes normal y adaptive icon dentro del
  proyecto Expo.
- Cabecera compacta con estado de conexión, tabs segmentadas y jerarquía tipográfica renovada.
- Mando rediseñado alrededor de una cruceta circular accesible con arriba, abajo, izquierda,
  derecha y selección.
- Controles de reproducción, posición, volumen, mute, velocidad, pantalla completa, búsqueda,
  temporadas, resultados, pistas, pantallas guardadas y revocación se mantienen funcionales.
- TypeScript y exportación Metro deben pasar antes de generar el APK en GitHub Actions.

## Proveedores y carga de fuentes

Los tres repositorios se registran como plugins Nuvio JS y no como addons de catálogo:

1. Nuvio Latino: 17 providers.
2. Latino Providers: 10 providers.
3. Nuvio Latino Hub Providers: 2 providers.

Total del inventario: 29 implementaciones de proveedor. Esto no significa 29 reproducciones
certificadas; varios nombres y hosts se repiten, y cada sitio externo puede cambiar.

- Las búsquedas de addons y plugins se ejecutan en paralelo y entregan grupos progresivamente.
- El runtime comparte ejecuciones iguales, aplica timeout, límite de memoria, concurrencia y tamaño
  de respuesta.
- El proxy de Coolify valida origen, host exacto, HTTPS y DNS pública, y fija la IP validada para
  evitar rebinding.
- Ahora sigue hasta cuatro redirecciones. Cada salto vuelve a pasar la validación completa; 301,
  302 y 303 se comportan como navegador, mientras 307 y 308 conservan el método.
- Se admiten las cabeceras web que suelen requerir los proveedores (`Origin`, `Referer`, `Cookie`,
  `X-Requested-With`) sin reenviar `Authorization` ni `Host`.
- El reproductor evita repetir una URL fallida y busca otra fuente durante el arranque. No evade
  DRM, captchas, restricciones geográficas ni un rechazo 403 del host final de vídeo.

## Servicio remoto y backend

- El servicio remoto persiste hashes de credenciales, permisos y auditoría; no persiste secretos en
  claro, catálogo, URLs de vídeo ni sockets.
- Los accesos cortos se renuevan y los vínculos tienen una caducidad absoluta de 30 días.
- La web ahora conserva sólo el identificador opaco de sesión en `sessionStorage`. Al recargar,
  solicita un token nuevo al servicio usando la sesión autenticada del backend; no guarda el token
  remoto.
- Cerrar o recargar la pestaña desconecta el socket sin revocar el teléfono. “Desconectar todos” sí
  elimina la sesión y los vínculos.
- El endpoint HTTP acepta `application/json` con parámetros como `charset=UTF-8`.
- La migración self-host `00000000000011_member_access_rpc.sql` define
  `get_my_member_access()` para instalaciones sin módulo de membresías. Debe aplicarse en el backend
  desplegado.

## Jellyfin

La integración sigue siendo inicial: detecta `/System/Info/Public`, guarda la configuración y
permite desconectar. Catálogo, autenticación real con token, usuarios, transcodificación y
reproducción Jellyfin todavía no están implementados. No debe presentarse como integración
completa.

## Pendiente externo o empírico

- Redesplegar NuvioWeb y el servicio remoto en Coolify.
- Mantener un volumen persistente `/data` para el servicio remoto y una sola réplica mientras use el
  almacenamiento de archivo actual.
- Aplicar la migración del fork `self-host` en el backend.
- Generar el APK 0.4.0 en GitHub Actions e instalarlo en un teléfono real.
- Probar proveedores con contenido autorizado y registrar por fuente: resultado, navegador, CORS,
  redirecciones y formato de vídeo.
- Validar Chrome, Firefox, Safari, Android, iOS, zoom 200 %, lector de pantalla y RTL.
