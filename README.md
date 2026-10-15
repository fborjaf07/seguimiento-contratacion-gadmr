# Seguimiento de contratación · GADM Riobamba

Tablero de la Dirección General de Gestión de Obras Públicas que compara las **solicitudes de revisión y aprobación de fase preparatoria** enviadas por el e-DOC (eGob) con el **estado de cada proceso en SERCOP**.

Página: `https://fborjaf07.github.io/seguimiento-contratacion-gadmr/`

## Actualización automática

Dos flujos de GitHub Actions, ambos también se pueden correr a mano desde la pestaña *Actions*:

| Flujo | Dónde corre | Horario (Ecuador) | Qué hace |
|---|---|---|---|
| `actualizar.yml` · *Actualizar e-DOC y tablero* | Servidores de GitHub | 08:00, 14:00, 19:00 | `scripts/extraer_edoc.py`: inicia sesión en el CAS, busca en *Enviados* las solicitudes de revisión y aprobación y lee el historial de cada una → `data/edoc.json` |
| `sercop.yml` · *Actualizar SERCOP* | Equipo del GADMR (runner propio) | 07:50, 13:50, 18:50 | `scripts/extraer_sercop.py`: abre la ficha pública de cada proceso de `sercop_procesos.json` y lee su estado → `data/sercop.json` |

SERCOP no responde a los servidores de GitHub, por eso su lectura corre en un equipo dentro de Ecuador.

Después de cada extracción:

1. `scripts/armar_datos.py`: une todo en `datos_contratacion.json`, que es lo que lee la página. Si una fuente falla, conserva sus últimos datos buenos.
4. `scripts/cambios.js`: registra en `data/cambios.json` los proyectos que cambiaron de etapa o de estado SERCOP.

## Configuración (una sola vez)

- **Secretos** (*Settings → Secrets and variables → Actions*): `EDOC_USUARIO` y `EDOC_CONTRASENA`, de la cuenta cuyos *Enviados* se siguen.
- **GitHub Pages** (*Settings → Pages*): *Deploy from a branch* → `main` → `/ (root)`.

## Runner SERCOP (equipo del GADMR, una sola vez)

En el PC que permanece encendido (el mismo del monitor de trámites), con Python 3.11 y Git instalados:

1. En GitHub: *Settings → Actions → Runners → New self-hosted runner → Windows x64*.
2. Abra PowerShell como administrador y ejecute los comandos que muestra esa página (crear `C:\actions-runner`, descargar y descomprimir, y `config.cmd --url ... --token ...`).
3. Durante la configuración:
   - *Enter any additional labels*: escriba **`sercop`**.
   - *Would you like to run the runner as service?*: **Y**, con la cuenta de Windows que tiene Python en el PATH.
4. En *Settings → Actions → Runners* el equipo debe aparecer como **Idle**. Pruebe con *Actions → Actualizar SERCOP → Run workflow*.

Si el equipo está apagado, SERCOP simplemente no se actualiza en esa corrida y el tablero conserva los últimos estados.

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
