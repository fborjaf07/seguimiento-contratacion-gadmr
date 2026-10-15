// Compara las etapas actuales con la última corrida y agrega los cambios a data/cambios.json.
// Uso: node scripts/cambios.js   (después de armar_datos.py; vuelve a escribir datos_contratacion.json con los cambios)
const fs = require('fs');
require('../fuente/motor.js');
const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };

const datos = leer('datos_contratacion.json');
const r = Motor.construir(datos);
const ahora = datos.generado;
const actual = {};
r.procesos.forEach(p => actual[p.id] = {
  objeto: p.objeto, etapa: p.etapaNombre,
  sercop: p.sercop ? `${p.sercop.codigo} · ${p.sercop.estado}` : ''
});
const previo = leer('data/ultimo_snapshot.json', null);
const cambios = leer('data/cambios.json', []);
let nuevos = 0;
if (previo) {
  for (const id in actual) {
    const a = previo[id], d = actual[id];
    const txt = x => x.etapa + (x.sercop ? ` (${x.sercop})` : '');
    if (!a) { cambios.push({ fecha: ahora, id, objeto: d.objeto, antes: 'Nueva solicitud', ahora: txt(d) }); nuevos++; }
    else if (a.etapa !== d.etapa || a.sercop !== d.sercop) { cambios.push({ fecha: ahora, id, objeto: d.objeto, antes: txt(a), ahora: txt(d) }); nuevos++; }
  }
}
const recortados = cambios.slice(-1000);
fs.writeFileSync('data/cambios.json', JSON.stringify(recortados, null, 1));
fs.writeFileSync('data/ultimo_snapshot.json', JSON.stringify(actual, null, 1));
datos.cambios = recortados;
fs.writeFileSync('datos_contratacion.json', JSON.stringify(datos));
console.log(`[OK] ${nuevos} cambio(s) registrados${previo ? '' : ' (primera corrida: línea base guardada)'}`);
