# Nuvio Remote 0.2.0

> Histórico del rework visual. La versión actual es 0.4.0; consultar `docs/remote-srs-status.md` para nuevas capacidades, persistencia y pendientes de aceptación.

Renovación exclusiva de la APK. No cambia la web ni el servicio remoto.

- Header con navegación Mando / Explorar / Conexión; sin barra lateral.
- Mando con acción principal play/pausa, salto ±10 s, barras táctiles de posición y volumen, silencio y pistas disponibles.
- Exploración con búsqueda, resultados, episodios y fuentes que publica la web; al entrar en reproducción vuelve al mando.
- Conexión con QR o código validado, configuración de servidor desplegable, estado de permisos, reconexión y cuenta atrás de caducidad.
- Confirmación nativa al desvincular, botón Atrás de Android para cerrar cámara o regresar al mando, cámara cerrada al ir a segundo plano.
- Controles con nombres, estados disabled, barras ajustables mediante accesibilidad y filas que admiten crecimiento de texto.

## Probar

El workflow existente genera APK 0.2.0 / versionCode 3 al subir cambios en esta carpeta. Descargar el artefacto de la ejecución correcta e instalar sobre la versión anterior. No necesita cambiar variables ni redesplegar la web por esta renovación.

Comprobar en teléfono: conectar, aprobar, pasar por las tres pestañas, buscar, elegir fuente, pausar, tocar las barras, cambiar pistas, bloquear/desbloquear el teléfono, desconectar Internet, volver a conectar y desvincular. Las fuentes siguen dependiendo de la web y del proveedor.

## Límites reales

No es una app de reproducción independiente. No ejecuta los tres repositorios de proveedores: controla los que ya usa la web. No se añadieron carátulas ficticias: el protocolo actual no entrega imágenes. Vínculos persistentes de 30 días y varias sesiones requieren más implementación; el servicio actual caduca a los 15 minutos. Esta entrega no declara cumplimiento integral del SRS.

## Revisión de layout y accesibilidad

| Severidad | Ubicación        | Antes                                              | Después                                          | Motivo                                               |
| --------- | ---------------- | -------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| Media     | App.tsx          | Formulario y controles mezclados en una sola lista | Tres apartados bajo header                       | Agrupar por tarea y mantener navegación visible      |
| Media     | App.tsx          | Acciones de reproducción equivalentes visualmente  | Play/pausa principal, controles secundarios      | Jerarquía de acciones                                |
| Media     | RangeControl.tsx | Solo botones de salto/volumen                      | Barras táctiles y acciones ajustables accesibles | Elección directa sin perder alternativas con botones |

Skills better-layout y better-accessibility aplicadas. Revisión estática: objetivos de al menos 48, filas flexibles, etiquetas, roles, estados y sin animaciones automáticas. Sin verificación visual nativa: 320 px, texto al 200%, RTL, lector de pantalla y zonas seguras en dispositivos físicos. **Block** para aprobación integral hasta verificar en móvil; TypeScript y pruebas de estado no sustituyen esa comprobación.
