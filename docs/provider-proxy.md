# Proveedores web en Coolify

El Dockerfile de NuvioWeb incluye `/api/providers/fetch`. No hace falta desplegar otro servicio ni modificar Supabase. Configura estas variables de ejecución en el **cliente NuvioWeb** y redespliega:

```env
NUVIO_PROVIDER_PROXY_ENABLED=true
NUVIO_PROVIDER_ALLOWED_ORIGINS=https://movies.gykstudio.tech
NUVIO_PROVIDER_ALLOWED_HOSTS=hlswish.com
```

La lista de hosts anterior es solo un ejemplo mínimo. Usa `.env.coolify.example` para la lista de 55 hosts comprobados por DNS/HTTPS durante la revisión de los 29 proveedores. Consulta `docs/provider-verification.md` para fallos y límites: no equivale a reproducción verificada. Añade nombres exactos separados por comas; no se admiten comodines. No añadas servicios privados ni destinos con credenciales.

Para desarrollo, `local.properties` contiene la configuración y está excluido de Git y Docker. El servidor lee ahí los hosts/orígenes privados; las variables de proceso tienen prioridad. Reinicia el servidor tras actualizar su código. Coolify debe recibir las variables del ejemplo manualmente: el archivo no se importa automáticamente y no contiene la clave real de TMDB.

`TMDB_API_KEY` sigue siendo necesaria en el cliente. Las variables de hosts y orígenes permanecen exclusivamente en el servidor; no son claves de autenticación.

## Límites y alcance

- HTTPS, puerto 443, GET/POST y hosts exactos exclusivamente.
- Resolución IPv4 validada y fijada a la conexión; bloqueo de redes privadas, locales y reservadas.
- No sigue redirecciones. No reenvía cookies, Authorization, Host ni cabeceras arbitrarias.
- Máximo 1 MiB por petición/respuesta, 10 conexiones concurrentes y 120 peticiones/minuto por proceso.
- Origen obligatorio y JSON; sin CORS entre dominios. La comprobación de Origin no autentica a clientes no navegador: para exposición con muchos usuarios añade autenticación y límites por usuario en un gateway.
- Solo obtiene texto para proveedores: **no es un proxy de vídeo**, no resuelve DRM, captchas ni bloqueos de reproducción. El enlace de vídeo final también debe ser compatible con el navegador.
- Desactivado salvo configuración explícita. Para revertir, establece `NUVIO_PROVIDER_PROXY_ENABLED=false` y redespliega.

## Verificación

Compilación y pruebas locales no equivalen a reproducción verificada. Queda pendiente configurar la lista completa de destinos autorizados, desplegar y repetir Stranger Things T1E1. No se ha modificado Coolify automáticamente.
