# Seguimiento de contratación · GADM Riobamba

Tablero de la Dirección General de Gestión de Obras Públicas que compara las **solicitudes de revisión y aprobación de fase preparatoria** enviadas por el e-DOC (eGob) con el **estado de cada proceso en SERCOP**.

Página: `https://fborjaf07.github.io/seguimiento-contratacion-gadmr/`

## Actualización automática

`.github/workflows/actualizar.yml` corre a las **08:00, 14:00 y 19:00 (hora de Ecuador)** y también a mano desde *Actions → Actualizar seguimiento de contratación → Run workflow*.

1. `scripts/extraer_edoc.py`: inicia sesión en el CAS, busca en *Enviados* las solicitudes de revisión y aprobación y lee el historial completo de cada una → `data/edoc.json`.
2. `scripts/extraer_sercop.py`: abre la ficha pública de cada proceso listado en `sercop_procesos.json` (sin captcha) y lee el estado → `data/sercop.json`.
3. `scripts/armar_datos.py`: une todo en `datos_contratacion.json`, que es lo que lee la página. Si una fuente falla, conserva sus últimos datos buenos.
4. `scripts/cambios.js`: registra en `data/cambios.json` los proyectos que cambiaron de etapa o de estado SERCOP.

## Configuración (una sola vez)

- **Secretos** (*Settings → Secrets and variables → Actions*): `EDOC_USUARIO` y `EDOC_CONTRASENA`, de la cuenta cuyos *Enviados* se siguen.
- **GitHub Pages** (*Settings → Pages*): *Deploy from a branch* → `main` → `/ (root)`.

## Agregar un proceso SERCOP publicado

Edite `sercop_procesos.json` y agregue el link de la ficha del proceso (el que tiene `idSoliCompra=`):

```json
[
  { "url": "https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/PC/informacionProcesoContratacion2.cpe?idSoliCompra=XXXXXXXX" }
]
```

El código, el objeto y el estado se leen solos en la siguiente corrida.

## Modificar la página

La página se arma desde `fuente/` (plantilla, motor de etapas, lector de archivos y aplicación). Después de editar: `python fuente/armar_html.py`.
