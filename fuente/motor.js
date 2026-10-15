/* Motor de seguimiento: agrupa trámites e-DOC de revisión y aprobación por proyecto,
   deduce la etapa interna, los cruza con SERCOP y evalúa alertas. Sin dependencias. */
(function (root) {
  const UMBRAL = {
    revisionAlerta: 7, revisionCritico: 15,      // Compras Públicas sin responder
    observadoAlerta: 5, observadoCritico: 10,    // Obras Públicas sin subsanar
    revisadoAlerta: 10, revisadoCritico: 20,     // revisión atendida, sin certificación ni publicación
    certAlerta: 10, certCritico: 20,             // certificación presupuestaria sin resolución de inicio
    inicioAlerta: 7, inicioCritico: 15           // inicio autorizado y sin publicar
  };
  const ETAPAS = {
    archivado:     { orden: 0, nombre: 'Archivado',                    responsable: '—' },
    revision:      { orden: 1, nombre: 'En revisión',                  responsable: 'Compras Públicas' },
    observado:     { orden: 2, nombre: 'Con observaciones',            responsable: 'Obras Públicas' },
    revisado:      { orden: 3, nombre: 'Revisión atendida',            responsable: 'Compras Públicas' },
    certificacion: { orden: 4, nombre: 'Certificación presupuestaria', responsable: 'Financiero' },
    inicio:        { orden: 5, nombre: 'Resolución de inicio',         responsable: 'Compras Públicas' },
    orden:         { orden: 6, nombre: 'Orden de compra (catálogo)',   responsable: 'Administrador de contrato' },
    publicado:     { orden: 7, nombre: 'Publicado en SERCOP',          responsable: 'SERCOP' }
  };
  const FASES_SERCOP = [
    'Preguntas, Respuestas y Aclaraciones', 'Entrega de Propuesta', 'Convalidacion de Errores',
    'Calificación de Participantes', 'Por Adjudicar', 'Adjudicado - Registro de Contratos',
    'Ejecución de Contrato', 'Finalizada', 'Suspendido', 'Desierta', 'Cancelado'
  ];
  const norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const STOP = new Set(('DE LA EL LOS LAS DEL EN Y PARA POR CON A AL SU SUS QUE O E UN UNA SE LO GADM GADMR RIOBAMBA ' +
    'CANTON PARROQUIA COMUNIDAD COMUNIDADES SECTOR SECTORES VARIOS VARIAS DIFERENTES EJECUCION CONSTRUCCION ' +
    'ADQUISICION ADQUISION PRESTACION SERVICIO SERVICIOS MANTENIMIENTO INCLUIDO INCLUIDA MANO OBRA CIUDAD FASE ETAPA').split(' '));
  function tokens(s) {
    return new Set(norm(s).replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/)
      .filter(w => w.length > 3 && !STOP.has(w) && !/^\d+$/.test(w)));
  }
  let PESO = null; // peso IDF por palabra: los nombres de lugar pesan más que "cabecera" o "vías"
  const w = x => (PESO && PESO[x]) || 1;
  function sim(a, b) {
    let i = 0, wi = 0, wa = 0, wb = 0;
    for (const x of a) { wa += w(x); if (b.has(x)) { i++; wi += w(x); } }
    for (const x of b) wb += w(x);
    const u = wa + wb - wi;
    return { i, j: u ? wi / u : 0, m: Math.min(wa, wb) ? wi / Math.min(wa, wb) : 0 };
  }
  function calcularPesos(textos) {
    const df = {}; textos.forEach(t => tokens(t).forEach(x => (df[x] = (df[x] || 0) + 1)));
    const N = textos.length; PESO = {};
    for (const x in df) PESO[x] = Math.log(1 + N / df[x]);
  }
  const RX_CODIGO = /\b(LICO|LICB|LICS|LICSG|SIE|CPC|MCO|COTO|COTB|COTS|RE|CDC|LCC)[-_\s]?GADMR[-_\s]?(20\d\d)[-_\s]?(\d{1,4})\b/gi;
  function codigos(texto) {
    const out = new Set(); let m; RX_CODIGO.lastIndex = 0;
    while ((m = RX_CODIGO.exec(texto || ''))) out.add(`${m[1].toUpperCase()}-GADMR-${m[2]}-${String(+m[3]).padStart(3, '0')}`);
    return out;
  }
  function objetoDe(asunto) {
    const s = String(asunto || '');
    const m = s.match(/FASE\s+PREPARATORIA|DESAGREGACI[OÓ]N\s+TECNOL[OÓ]GICA\s+(PARA|DE)/i);
    let r = m ? s.slice(m.index + m[0].length) : s;
    r = r.replace(/^[\s\-–—:;,.“”"'«»]+/, '').replace(/^PAR+A\s+(LA|EL)\s+/i, '').replace(/^[\s\-–—:“”"']+/, '');
    r = r.replace(/[\s“”"'.»]+$/, '').replace(/[“”"]/g, '').trim();
    return r || s;
  }
  function claseDe(asunto) {
    const n = norm(asunto);
    if (/^ALCANCE/.test(n)) return 'Alcance';
    if (/DESAGREGACION/.test(n)) return 'Desagregación tecnológica';
    return 'Fase preparatoria';
  }
  // fechas: el PDF trae UTC; el historial del monitor viene en hora local (UTC-5)
  function utcALocal(f) {
    if (!f) return null;
    const d = new Date(f.replace(' ', 'T') + 'Z');
    if (isNaN(d)) return null;
    d.setUTCHours(d.getUTCHours() - 5);
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
  function dias(desde, hasta) {
    if (!desde || !hasta) return null;
    const a = new Date(desde.slice(0, 10) + 'T00:00:00Z'), b = new Date(hasta.slice(0, 10) + 'T00:00:00Z');
    return Math.round((b - a) / 864e5);
  }
  function clasificarNota(nota) {
    // "Documento Archivado" es una acción rutinaria del e-DOC; sólo cuenta el archivo explícito
    const n = norm(nota).replace(/DOCUMENTO ARCHIVADO[^\n]*/g, ' ').replace(/\bARCHIVADO\s*$/g, m => n0(nota) ? m : ' ');
    if (!n.trim()) return null;
    if (/PROCESO PUBLICADO/.test(n)) return 'publicado';
    if (/^\s*ARCHIVAD[OA]\s*$|SE ARCHIVA/.test(n)) return 'archivado';
    if (/ORDEN(ES)? DE COMPRA/.test(n)) return 'orden';
    if (/RESOLUCION[_\s]+(DE[_\s]+)?INI|AUTORIZACION DE INICIO|COMISION TECNICA/.test(n)) return 'inicio';
    if (/CERTIFICACION PRESUPUESTARIA|CERT-20\d\d-\d+/.test(n)) return 'certificacion';
    if (/DEVOLUCION|OBSERVACI|SUBSANA|DEVUELT|PREVIO A (LA )?REVISION|REVISAR INTEGRALMENTE|FAVOR VERIFICAR|REVISAR LOS FORMULARIOS|CORREGIR/.test(n)) return 'observado';
    if (/ATENDID|INFORME DE REVISION|SE ATENDIO|RESPONDIDO/.test(n)) return 'revisado';
    return null;
  }
  // nota que consiste sólo en la palabra "archivado" (archivo explícito del trámite)
  function n0(nota) { return /^\s*archivad[oa]\s*$/i.test(String(nota || '')); }
  function esRevision(asunto) {
    const n = norm(asunto);
    return /REVISION\s+Y\s+APROBACION/.test(n) && /FASE PREPARATORIA|DESAGREGACION/.test(n);
  }

  function construir(raw) {
    const corteEdoc = raw.edoc.corte;
    const hist = (raw.historial && raw.historial.tramites) || {};
    const sercop = raw.sercop.procesos.map(p => Object.assign({}, p, { _tok: tokens(p.objeto) }));
    const porCodigo = Object.fromEntries(sercop.map(p => [p.codigo, p]));
    calcularPesos(raw.sercop.procesos.map(p => p.objeto).concat(raw.edoc.filas.filter(f => esRevision(f.asunto)).map(f => objetoDe(f.asunto))));
    const filas = raw.edoc.filas.filter(f => esRevision(f.asunto) && f.estado !== 'Eliminado').map(f => {
      const objeto = objetoDe(f.asunto);
      return Object.assign({}, f, { objeto, clase: claseDe(f.asunto), _tok: tokens(objeto) });
    });

    // agrupar por proyecto (unión de componentes por similitud de objeto)
    const padre = filas.map((_, i) => i);
    const raiz = i => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
    for (let a = 0; a < filas.length; a++) for (let b = a + 1; b < filas.length; b++) {
      const s = sim(filas[a]._tok, filas[b]._tok);
      if (s.j >= 0.72 || (s.m >= 0.9 && s.i >= 3)) padre[raiz(a)] = raiz(b);
    }
    const grupos = {};
    filas.forEach((f, i) => (grupos[raiz(i)] = grupos[raiz(i)] || []).push(f));

    const procesos = Object.values(grupos).map(tr => {
      // eventos: última interacción del export + historial del monitor + memorandos de respuesta
      const eventos = [];
      // un mismo movimiento suele repetirse en los trámites hermanos (alcances, reenvíos): se registra una vez
      const porClave = new Map();
      const add = (e) => {
        if (!e.fecha) return;
        const k = e.fecha + '|' + e.quien + '|' + String(e.nota || '').slice(0, 120);
        const ya = porClave.get(k);
        if (ya) { if (!ya.numeros.includes(e.numero)) ya.numeros.push(e.numero); if (!ya.cargo && e.cargo) ya.cargo = e.cargo; if (!ya.a && e.a) ya.a = e.a; return; }
        e.numeros = [e.numero]; porClave.set(k, e); eventos.push(e);
      };
      const respuestas = new Set();
      for (const t of tr) {
        add({ numero: t.numero, fecha: utcALocal(t.ult_fecha_utc), quien: t.ult_nombre, cargo: '', nota: t.ult_nota, fuente: 'export' });
        for (const m of (t.ult_nota || '').matchAll(/#\s*(\d{6,7})/g)) respuestas.add(m[1]);
        const h = hist[t.numero];
        if (h) for (const mv of h.mov) {
          add({ numero: t.numero, fecha: mv.f, quien: mv.n, cargo: mv.c, nota: mv.t, a: mv.a, fuente: 'historial' });
          for (const m of (mv.t || '').matchAll(/#\s*(\d{6,7})/g)) respuestas.add(m[1]);
        }
      }
      const resp = [];
      for (const r of respuestas) {
        if (tr.some(t => t.numero === r)) continue;
        const h = hist[r];
        resp.push({ numero: r, descripcion: h ? h.descripcion : '' });
        if (h) for (const mv of h.mov) add({ numero: r, fecha: mv.f, quien: mv.n, cargo: mv.c, nota: mv.t, a: mv.a, fuente: 'respuesta' });
      }
      eventos.sort((a, b) => a.fecha.localeCompare(b.fecha));

      // etapa interna
      // la etapa es la del último evento clasificado; desde la certificación en adelante no retrocede
      const RANGO = { revision: 1, observado: 2, revisado: 3, certificacion: 4, inicio: 5, orden: 6 };
      let etapa = 'revision', desde = eventos.length ? eventos[0].fecha : null, piso = 0, publicadoNota = false, evidencia = eventos[0] || null;
      for (const e of eventos) {
        const c = clasificarNota(e.nota);
        if (!c) continue;
        if (c === 'publicado') { publicadoNota = true; continue; }
        if (c === 'observado' && /DEVOLUCION|DEVUELT/.test(norm(e.nota))) piso = 0; // una devolución reabre el trámite
        if (c !== 'archivado' && RANGO[c] < piso) continue;
        if (RANGO[c] >= 4) piso = Math.max(piso, RANGO[c]);
        if (c !== etapa) { etapa = c; desde = e.fecha; evidencia = e; }
      }
      // si quedan trámites abiertos posteriores al archivo, el proyecto sigue vivo
      if (etapa === 'archivado') {
        const ultArch = desde;
        const vivos = eventos.filter(e => e.fecha > ultArch && clasificarNota(e.nota) !== 'archivado');
        if (vivos.length) { etapa = 'revision'; desde = vivos[0].fecha; evidencia = vivos[0]; }
      }

      // cruce con SERCOP: primero por código citado, luego por objeto
      const tokG = new Set(); tr.forEach(t => t._tok.forEach(x => tokG.add(x)));
      const textoTodo = eventos.map(e => e.nota).join(' ') + ' ' + tr.map(t => t.asunto + ' ' + t.ult_nota).join(' ');
      const porCod = [...codigos(textoTodo)].filter(c => porCodigo[c]).map(c => ({ p: porCodigo[c], via: 'código', score: 1 }));
      const registros = tr.map(t => (hist[t.numero] && hist[t.numero].registro) || t.registro).filter(Boolean).sort();
      const primeraFecha = registros.length ? registros[0].slice(0, 10) : (eventos.length ? eventos[0].fecha.slice(0, 10) : null);
      const porTexto = [];
      for (const p of sercop) {
        if (porCod.some(x => x.p === p)) continue;
        let best = { j: 0, m: 0, i: 0 };
        for (const t of tr) { const s = sim(t._tok, p._tok); if (s.j > best.j) best = s; }
        const ok = best.j >= 0.6 || (best.m >= 0.9 && best.i >= 3);
        if (ok && (!primeraFecha || p.fecha_pub >= shiftDias(primeraFecha, -365))) porTexto.push({ p, via: 'objeto', score: +best.j.toFixed(2) });
      }
      const ultimo = eventos[eventos.length - 1] || null;
      const principal = tr.slice().sort((a, b) => (a.clase === 'Fase preparatoria' ? -1 : 1) - (b.clase === 'Fase preparatoria' ? -1 : 1) || (+b.numero) - (+a.numero))[0];
      return {
        id: principal.numero,
        objeto: principal.objeto,
        tramites: tr.map(t => ({ numero: t.numero, memo: t.memo, estado: t.estado, clase: t.clase, asunto: t.asunto,
          ult_nombre: t.ult_nombre, ult_fecha: utcALocal(t.ult_fecha_utc), ult_nota: t.ult_nota }))
          .sort((a, b) => (+b.numero) - (+a.numero)),
        respuestas: resp, eventos,
        _etapa: etapa, _desde: desde, evidencia, _publicadoNota: publicadoNota,
        _cands: porCod.concat(porTexto),
        primerRegistro: primeraFecha,
        ultimo, diasSinMov: ultimo ? dias(ultimo.fecha, corteEdoc) : null
      };
    });

    // cada proceso SERCOP se asigna a un solo proyecto: primero por código, luego por mejor coincidencia
    const pares = [];
    procesos.forEach(p => p._cands.forEach(c => pares.push({ p, c })));
    pares.sort((a, b) => (b.c.via === 'código') - (a.c.via === 'código') || b.c.score - a.c.score);
    const asignado = new Map();
    for (const { p, c } of pares) if (!asignado.has(c.p.codigo)) { asignado.set(c.p.codigo, p); (p._asig = p._asig || []).push(c); }

    for (const p of procesos) {
      const matches = (p._asig || []).sort((a, b) => b.p.fecha_pub.localeCompare(a.p.fecha_pub));
      const sp = matches[0] || null;
      let etapa = p._etapa, desde = p._desde;
      if (sp) { etapa = 'publicado'; desde = sp.p.fecha_pub + ' 00:00'; }
      else if (p._publicadoNota) etapa = 'publicado';
      Object.assign(p, {
        etapa, etapaNombre: ETAPAS[etapa].nombre, responsable: ETAPAS[etapa].responsable,
        desde, diasEnEtapa: dias(desde, corteEdoc),
        sercop: sp ? Object.assign({ via: sp.via, score: sp.score }, strip(sp.p)) : null,
        sercopOtros: matches.slice(1).map(m => Object.assign({ via: m.via }, strip(m.p))),
        diasHastaPublicar: sp && p.primerRegistro ? dias(p.primerRegistro, sp.p.fecha_pub) : null
      });
      delete p._cands; delete p._asig; delete p._etapa; delete p._desde; delete p._publicadoNota;
      p.eval = evaluar(p);
    }

    const vinculados = new Set();
    procesos.forEach(p => { if (p.sercop) vinculados.add(p.sercop.codigo); p.sercopOtros.forEach(o => vinculados.add(o.codigo)); });
    const sercopLista = raw.sercop.procesos.map(s => Object.assign({}, s, {
      interno: procesos.find(p => (p.sercop && p.sercop.codigo === s.codigo) || p.sercopOtros.some(o => o.codigo === s.codigo)) || null
    }));
    procesos.sort((a, b) => b.eval.peso - a.eval.peso || (b.diasEnEtapa || 0) - (a.diasEnEtapa || 0));
    return { procesos, sercop: sercopLista, corte: { edoc: corteEdoc, historial: raw.historial && raw.historial.corte, sercop: raw.sercop.corte }, vinculados };
  }
  function strip(p) { const o = Object.assign({}, p); delete o._tok; return o; }
  function shiftDias(f, n) { const d = new Date(f + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

  function evaluar(p) {
    const d = p.diasEnEtapa ?? 0;
    const r = (nivel, motivo) => ({ nivel, motivo, peso: { critico: 3, alerta: 2, info: 0, ok: 1 }[nivel] });
    switch (p.etapa) {
      case 'publicado': {
        const e = p.sercop ? norm(p.sercop.estado) : '';
        if (!p.sercop) return r('info', 'El e-DOC indica publicación, pero el proceso no aparece en la consulta SERCOP cargada.');
        if (/SUSPEND/.test(e)) return r('critico', `Proceso suspendido en SERCOP (${p.sercop.codigo}).`);
        if (/DESIERT|CANCELAD/.test(e)) return r('alerta', `Declarado ${p.sercop.estado.toLowerCase()} en SERCOP; definir relanzamiento.`);
        return r('ok', `En SERCOP: ${p.sercop.estado}.`);
      }
      case 'observado':
        return d > UMBRAL.observadoCritico ? r('critico', `Observaciones sin subsanar hace ${d} días.`)
          : d > UMBRAL.observadoAlerta ? r('alerta', `Observaciones sin subsanar hace ${d} días.`)
          : r('ok', `Observaciones recibidas hace ${d} días.`);
      case 'revision':
        return d > UMBRAL.revisionCritico ? r('critico', `${d} días en revisión sin respuesta registrada.`)
          : d > UMBRAL.revisionAlerta ? r('alerta', `${d} días en revisión sin respuesta registrada.`)
          : r('ok', `En revisión hace ${d} días.`);
      case 'revisado':
        return d > UMBRAL.revisadoCritico ? r('critico', `Revisión atendida hace ${d} días; sin certificación ni publicación.`)
          : d > UMBRAL.revisadoAlerta ? r('alerta', `Revisión atendida hace ${d} días; sin certificación ni publicación.`)
          : r('ok', `Revisión atendida hace ${d} días.`);
      case 'certificacion':
        return d > UMBRAL.certCritico ? r('critico', `Certificación presupuestaria hace ${d} días y sin resolución de inicio.`)
          : d > UMBRAL.certAlerta ? r('alerta', `Certificación presupuestaria hace ${d} días y sin resolución de inicio.`)
          : r('ok', `En certificación presupuestaria hace ${d} días.`);
      case 'orden':
        return r('ok', 'Contratado por catálogo electrónico (orden de compra).');
      case 'inicio':
        return d > UMBRAL.inicioCritico ? r('critico', `Inicio autorizado hace ${d} días y sin publicar en SERCOP.`)
          : d > UMBRAL.inicioAlerta ? r('alerta', `Inicio autorizado hace ${d} días y sin publicar en SERCOP.`)
          : r('ok', `Inicio autorizado hace ${d} días; pendiente de publicación.`);
      case 'archivado':
        return r('info', 'Trámite archivado en e-DOC y sin proceso en SERCOP.');
    }
    return r('info', '');
  }

  root.Motor = { construir, esRevision, objetoDe, codigos, norm, utcALocal, dias, ETAPAS, FASES_SERCOP, UMBRAL };
})(typeof window !== 'undefined' ? window : globalThis);
