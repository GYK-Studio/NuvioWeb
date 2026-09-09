# Verificación de proveedores — 2026-09-08

Alcance: lectura de los tres manifiestos proporcionados y sus **29 archivos JavaScript**; todos devolvieron HTTP 200. Extracción estática de hosts de URLs literales, sin ejecutar código durante esta revisión. No es auditoría integral de seguridad ni certificación de reproducción.

Fuentes: [Nuvio Latino](https://raw.githubusercontent.com/adrianjael/pluggin-latino/refs/heads/main/manifest.json), [Latino Providers](https://raw.githubusercontent.com/KennethJYS/Nuvio-Providers-Latino/refs/heads/main/manifest.json), [Nuvio Latino Hub Providers](https://raw.githubusercontent.com/Kokuuuuuun/Nuvio-Latino-Hub-Providers/refs/heads/main/manifest.json).

## Inventario

| Repositorio                    | Proveedores inspeccionados                                                                                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nuvio Latino (17)              | Embed69, SoloLatino, PelisGo, PelisPlusHD, HackStore, PelisPanda, CineCalidad, SeriesMetro, XuPalace, FuegoCine, PlayHubMax, TioPlus, CinemaCity, BrazucaPlay, LaMovie, VidEasy Latino, Cuevana UBD |
| Latino Providers (10)          | CineCalidad, Embed69, Zoowomaniacos, Xupalace, SeriesMetro, PelisSeriesHoy, Seriesflix, Detodopeliculas, LaMovie, HackStore                                                                         |
| Nuvio Latino Hub Providers (2) | DoramasFlix, Vimeus                                                                                                                                                                                 |

Los nombres repetidos representan implementaciones diferentes. Un proveedor consulta múltiples hosts; 29 proveedores no equivalen a 29 dominios.

## Resultados de red

Se extrajeron 64 hosts candidatos tras excluir `log.info`, un falso positivo de extracción. En 55 se verificó DNS IPv4 público y respuesta HTTPS mediante HEAD a la raíz, sin seguir redirecciones. Estos 55 figuran en `.env.coolify.example` y en la configuración local ignorada por Git.

No autorizados por fallo de comprobación:

- ENOTFOUND: `api2.videasy.net`, `cuevana.unbuendato.com`, `la.movie`, `vidsrc.xyz`.
- SERVFAIL: `api.playhubmax.com`, `www.playhubmax.com`.
- Tiempo de espera: `api.videasy.net`, `fastream.to`, `pixeldrain.com`.

Respuestas que requieren atención aunque el host sí contestó:

- 403: `buzzheavier.com`, `cinemacity.cc`, `dr0pstream.com`, `goodstream.one`, `pelisgo.online`, `streamwish.com`, `vimeos.net`.
- 522: `hglink.to`, `streamwish.to`, `strwish.com`.
- 405: `doramasflix-api.dracot16.workers.dev` (HEAD no permitido).
- 404: `drive.usercontent.google.com` en la raíz.
- 301/302: `api.themoviedb.org`, `awish.pro`, `cineby.sc`, `dsvplay.com`, `player.pelisserieshoy.com`, `player.videasy.net`, `player.vimeo.com`, `proyectox.yoyatengoabuela.com`, `seriesflixhd.best`, `sfastwish.com`, `vidmoly.to`, `wishfast.top`, `xupalace.org`.
- Los restantes 30 hosts devolvieron 200 a HEAD en la raíz.

La respuesta de una raíz no prueba el endpoint específico. Los destinos dinámicos, concatenados, descargados o cifrados pueden no estar en la extracción estática. No se autorizan automáticamente nuevos hosts ni subdominios. Las redirecciones se siguen hasta cuatro saltos y cada destino debe estar también en la lista exacta de hosts autorizados.

## Límites pendientes

- Stranger Things T1E1 no produjo una reproducción verificada durante las pruebas anteriores.
- El proxy solo entrega texto, no retransmite vídeo ni conserva sesiones/cookies de proveedores.
- VidEasy estaba deshabilitado en la app durante la instalación; incluir sus hosts no activa el proveedor.
- Tras reiniciar el servidor y configurar Coolify, hacen falta pruebas funcionales por proveedor y análisis de errores. No presentar «29 proveedores verificados» como «29 proveedores reproduciendo».
