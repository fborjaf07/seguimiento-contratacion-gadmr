(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  const EDOC_URL = n => `https://egobedoc.gadmriobamba.gob.ec:8081/issues/${encodeURIComponent(n)}`;
  const SERCOP_URL = 'https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/PC/buscarProceso.cpe';
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const fFecha = (f, hora) => {
    if (!f) return '—';
    const [d, h] = f.split(' '); const [y, m, dd] = d.split('-');
    return `${+dd} ${MES[+m - 1]} ${y}` + (hora && h ? `, ${h.slice(0, 5)}` : '');
  };
  const fCorta = f => { if (!f) return '—'; const [y, m, dd] = f.slice(0, 10).split('-'); return `${+dd} ${MES[+m - 1]}`; };
  const fUSD = v => v ? v.toLocaleString('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '—';
  const fUSDc = v => v >= 1e6 ? `US$ ${(v / 1e6).toLocaleString('es-EC', { maximumFractionDigits: 2 })} M` : v >= 1e3 ? `US$ ${(v / 1e3).toLocaleString('es-EC', { maximumFractionDigits: 0 })} mil` : fUSD(v);
  const nombre = s => String(s || '').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
  const hace = d => d == null ? '' : d <= 0 ? 'hoy' : d === 1 ? 'hace 1 día' : `hace ${d} días`;
  const ORDEN_ETAPAS = ['revision', 'observado', 'revisado', 'certificacion', 'inicio', 'orden', 'publicado', 'archivado'];
  const COLOR_ETAPA = { revision: 'var(--s1)', observado: 'var(--s2)', revisado: 'var(--s3)', certificacion: 'var(--s4)', inicio: 'var(--s5)', orden: 'var(--s6)', publicado: 'var(--s7)', archivado: 'var(--line)' };
  const ICON = {
    critico: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1.5 15 14H1z"/><path d="M8 6v4M8 11.6v.4" stroke="var(--surface)" stroke-width="1.6"/></svg>',
    alerta: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/></svg>',
    ok: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="m3 8.5 3 3 7-7"/></svg>',
    info: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="3"/></svg>'
  };
  const NIVEL = { critico: 'Crítico', alerta: 'Alerta', ok: 'En curso', info: 'Informativo' };

  // ---------- estado
  const embebido = JSON.parse($('#datos').textContent);
  const cMax = x => x && x.edoc && x.sercop ? [x.edoc.corte, x.sercop.corte].sort().pop() : '';
  const guardado0 = store.get('seg-raw-v1');
  const marca = x => (x && (x.generado || cMax(x))) || '';
  let raw = guardado0 && marca(guardado0) >= marca(embebido) ? guardado0 : embebido;
  let res;
  const ui = { tab: 'proyectos', q: '', etapa: null, sev: null, abierto: new Set() };

  function snapshot(r) {
    const o = {};
    r.procesos.forEach(p => o[p.id] = { etapa: p.etapa, nombre: p.etapaNombre, sercop: p.sercop ? `${p.sercop.codigo}|${p.sercop.estado}` : '', objeto: p.objeto });
    return o;
  }
  function recalcular() { res = Motor.construir(raw); }

  // ---------- render
  function renderFuentes() {
    const hoy = new Date().toISOString().slice(0, 10);
    const chip = c => { const d = Motor.dias(c, hoy); if (d == null) return ''; const col = d <= 1 ? 'ok' : d <= 3 ? 'warn' : 'crit'; return `<span class="fresco" style="background:var(--${col}-bg);color:var(--${col})">${d <= 0 ? 'al día' : `${d} d`}</span>`; };
    const f = [
      { c: 'var(--edoc)', k: 'e-DOC · Trámites enviados', v: raw.edoc.hora ? fFecha(raw.edoc.hora, true) : fFecha(raw.edoc.corte), d: `${(raw.edoc.leidas || raw.edoc.filas.length).toLocaleString('es-EC')} trámites leídos · ${raw.edoc.filas.length} de revisión y aprobación`, corte: raw.edoc.corte },
      { c: 'var(--edoc)', k: 'e-DOC · Historial de movimientos', v: fFecha(raw.historial && raw.historial.corte), d: `${Object.keys((raw.historial && raw.historial.tramites) || {}).length} trámites con historial completo`, corte: raw.historial && raw.historial.corte },
      { c: 'var(--sercop)', k: 'SERCOP · Estado de los procesos', v: raw.sercop.hora ? fFecha(raw.sercop.hora, true) : fFecha(raw.sercop.corte), d: `${raw.sercop.procesos.length} procesos del GADMR · ${raw.sercop.procesos.filter(p => p.url).length} con ficha enlazada`, corte: raw.sercop.corte }
    ];
    $('#fuentes').innerHTML = f.map(x => `<div class="fuente"><span class="k" style="color:${x.c}"><i style="background:${x.c}"></i>${esc(x.k)}</span>
      <span class="v">${esc(x.v)}${chip(x.corte)}</span><span class="d">${esc(x.d)}</span></div>`).join('');
  }
  function renderResumen() {
    const P = res.procesos;
    const pub = P.filter(p => p.etapa === 'publicado'), pend = P.filter(p => !['publicado', 'orden', 'archivado'].includes(p.etapa));
    const crit = P.filter(p => p.eval.nivel === 'critico').length, alr = P.filter(p => p.eval.nivel === 'alerta').length;
    const monto = pub.reduce((s, p) => s + (p.sercop ? +p.sercop.presupuesto || 0 : 0), 0);
    const mal = pub.filter(p => p.sercop && /SUSPEND|DESIERT|CANCEL/i.test(p.sercop.estado));
    $('#resumen').innerHTML = `
      <div class="kpi"><span class="n num">${P.length}</span><span class="l">Proyectos en seguimiento</span><span class="s">${res.procesos.reduce((s, p) => s + p.tramites.length, 0)} solicitudes de revisión y aprobación</span></div>
      <button class="kpi" data-go="pendiente"><span class="n num">${pend.length}</span><span class="l">En trámite interno</span><span class="s">Aún sin publicar en SERCOP</span></button>
      <div class="kpi"><span class="n num">${pub.length}</span><span class="l">Publicados en SERCOP</span><span class="s">${fUSDc(monto)} de presupuesto referencial</span></div>
      <button class="kpi crit" data-go="atencion"><span class="n num">${crit + alr}</span><span class="l">Requieren atención</span><span class="s">${crit} críticos · ${alr} en alerta</span></button>
      <div class="kpi"><span class="n num">${mal.length}</span><span class="l">Suspendidos o desiertos</span><span class="s">${fUSDc(mal.reduce((s, p) => s + (+p.sercop.presupuesto || 0), 0))} detenidos en SERCOP</span></div>`;
  }
  function renderFlujo() {
    const cuenta = {}; ORDEN_ETAPAS.forEach(e => cuenta[e] = 0); res.procesos.forEach(p => cuenta[p.etapa]++);
    const etapas = ORDEN_ETAPAS.filter(e => cuenta[e] > 0 || !['orden', 'archivado'].includes(e));
    const total = res.procesos.length || 1;
    $('#flujo').innerHTML = `<div class="apilada" role="img" aria-label="Distribución de proyectos por etapa">${etapas.filter(e => cuenta[e]).map(e =>
        `<span style="flex:${cuenta[e]};background:${COLOR_ETAPA[e]}" title="${esc(Motor.ETAPAS[e].nombre)}: ${cuenta[e]} de ${total}"></span>`).join('')}</div>
      <div class="etapas">${etapas.map(e => { const E = Motor.ETAPAS[e];
        return `<button class="etapa-b" data-etapa="${e}" aria-pressed="${ui.etapa === e}" title="Filtrar: ${esc(E.nombre)}">
          <span style="display:flex;align-items:center;gap:8px"><i style="width:10px;height:10px;border-radius:2px;background:${COLOR_ETAPA[e]};flex:none"></i>
          <span style="font-family:var(--f-display);font-stretch:80%;font-weight:750;font-size:26px;line-height:1" class="num">${cuenta[e]}</span></span>
          <span class="nm">${esc(E.nombre)}</span><span class="rs">${esc(E.responsable)}</span></button>`; }).join('')}</div>`;
  }
  function renderFases() {
    const pub = res.procesos.filter(p => p.sercop);
    const c = {}; pub.forEach(p => c[p.sercop.estado] = (c[p.sercop.estado] || 0) + 1);
    const orden = Motor.FASES_SERCOP.filter(f => c[f]).concat(Object.keys(c).filter(f => !Motor.FASES_SERCOP.includes(f)));
    const max = Math.max(1, ...Object.values(c));
    $('#fases').innerHTML = orden.length ? orden.map(f => `<div class="fase" title="${esc(f)}: ${c[f]} proyecto(s)"><span>${esc(f)}</span>
      <span class="tr"><i class="${/SUSPEND|DESIERT|CANCEL/i.test(f) ? 'mal' : ''}" style="width:${c[f] / max * 100}%"></i></span><b>${c[f]}</b></div>`).join('')
      : '<p class="sub">Ningún proyecto publicado todavía.</p>';
  }
  function coincide(p) {
    if (ui.etapa && p.etapa !== ui.etapa) return false;
    if (ui.sev === 'atencion' && !['critico', 'alerta'].includes(p.eval.nivel)) return false;
    if (ui.sev === 'critico' && p.eval.nivel !== 'critico') return false;
    if (ui.sev === 'pendiente' && ['publicado', 'orden', 'archivado'].includes(p.etapa)) return false;
    if (ui.q) {
      const t = Motor.norm([p.objeto, p.tramites.map(t => t.numero + ' ' + t.memo).join(' '), p.sercop ? p.sercop.codigo : '', p.sercopOtros.map(o => o.codigo).join(' '),
        p.eventos.map(e => e.quien + ' ' + (e.a || '')).join(' ')].join(' '));
      if (!Motor.norm(ui.q).split(/\s+/).every(w => t.includes(w))) return false;
    }
    return true;
  }
  function claseSercop(e) { return /SUSPEND|CANCEL/i.test(e) ? 'mal' : /DESIERT/i.test(e) ? 'reg' : ''; }
  function filaProyecto(p) {
    const ab = ui.abierto.has(p.id);
    const u = p.ultimo || {};
    const sercop = p.sercop
      ? `<span class="mono" style="color:var(--sercop);font-weight:500">${esc(p.sercop.codigo)}</span><div style="margin-top:4px"><span class="pill sercop ${claseSercop(p.sercop.estado)}">${esc(p.sercop.estado)}</span></div>
         <div class="sub num">${fUSD(+p.sercop.presupuesto)} · publicado ${fCorta(p.sercop.fecha_pub)}${p.sercopOtros.length ? ` · ${p.sercopOtros.length} proceso(s) anterior(es)` : ''}</div>`
      : p.etapa === 'orden' ? `<span class="sub" style="margin:0"><b>Catálogo electrónico</b></span><div class="sub">Fuera de la búsqueda de procesos</div>`
      : `<span class="sub" style="margin:0">Sin publicar</span>`;
    return `<div class="fila" role="button" tabindex="0" aria-expanded="${ab}" data-id="${esc(p.id)}">
      <span class="sev ${p.eval.nivel}" title="${NIVEL[p.eval.nivel]}"></span>
      <div class="c"><div class="obj">${esc(p.objeto)}</div>
        <div class="tramites">${p.tramites.map(t => `<span><span class="mono">#${esc(t.numero)}</span> ${esc(t.clase === 'Fase preparatoria' ? '' : t.clase.toLowerCase())}${t.estado !== 'Nuevo' ? ` · ${esc(t.estado.toLowerCase())}` : ''}</span>`).join('')}</div>
        <div class="motivo ${p.eval.nivel}">${ICON[p.eval.nivel]}<span><b>${NIVEL[p.eval.nivel]}.</b> ${esc(p.eval.motivo)}</span></div></div>
      <div class="c"><span class="lbl">Etapa interna</span><span class="pill etapa"><i style="background:${COLOR_ETAPA[p.etapa]}"></i>${esc(p.etapaNombre)}</span>
        <div class="sub">${p.etapa === 'publicado' ? '' : `${esc(hace(p.diasEnEtapa))} · `}<b>${esc(p.responsable)}</b></div></div>
      <div class="c"><span class="lbl">SERCOP</span>${sercop}</div>
      <div class="c"><span class="lbl">Último movimiento</span><div style="font-size:13.5px;font-weight:600">${esc(nombre(u.quien) || '—')}</div>
        <div class="sub">${fFecha(u.fecha, true)} · ${esc(hace(p.diasSinMov))}</div>${u.a ? `<div class="sub">Enviado a <b>${esc(nombre(u.a))}</b></div>` : ''}</div>
      ${ab ? detalle(p) : ''}</div>`;
  }
  function detalle(p) {
    const ev = p.eventos.slice().reverse();
    const esEv = e => p.evidencia && e.fecha === p.evidencia.fecha && e.numero === p.evidencia.numero && e.quien === p.evidencia.quien;
    const s = p.sercop;
    return `<div class="detalle" data-stop="1">
      <div class="caja"><h3>Movimientos en el e-DOC <span class="sub" style="font-weight:400">(${ev.length}, del más reciente al más antiguo)</span></h3>
        <ol class="linea">${ev.map(e => `<li class="${esEv(e) ? 'ev' : ''}"><div class="q"><b>${esc(nombre(e.quien))}</b>${e.cargo ? ` · ${esc(nombre(e.cargo))}` : ''} · ${fFecha(e.fecha, true)} · <span class="mono">${(e.numeros || [e.numero]).map(n => '#' + esc(n)).join(' ')}</span>${esEv(e) ? '<span class="tag">Define la etapa</span>' : ''}</div>
          ${e.nota ? `<div class="n">${esc(e.nota.replace(/\n?(Añadido Fichero|Asignado ha cambiado)[\s\S]*$/, '').trim() || e.nota)}</div>` : ''}${e.a ? `<div class="q">→ ${esc(nombre(e.a))}</div>` : ''}</li>`).join('')}</ol></div>
      <div class="caja">
        <h3>Trámites de revisión y aprobación</h3>
        <div class="lista-t">${p.tramites.map(t => `<div><a href="${EDOC_URL(t.numero)}" target="_blank" rel="noopener">#${esc(t.numero)}</a> · ${esc(t.memo || 's/n')} · ${esc(t.estado)}<div class="sub" style="margin:0">${esc(t.clase)} · ${esc(t.asunto.slice(0, 160))}${t.asunto.length > 160 ? '…' : ''}</div></div>`).join('')}</div>
        ${p.respuestas.length ? `<h3>Memorandos de respuesta</h3><div class="lista-t">${p.respuestas.map(r => `<div><a href="${EDOC_URL(r.numero)}" target="_blank" rel="noopener">#${esc(r.numero)}</a>${r.descripcion ? ` · ${esc(r.descripcion.slice(0, 120))}` : ''}</div>`).join('')}</div>` : ''}
        ${s ? `<h3>Proceso en SERCOP</h3><dl class="dl"><dt>Código</dt><dd><span class="mono">${esc(s.codigo)}</span> <button class="copiar" data-copiar="${esc(s.codigo)}">Copiar</button></dd>
          <dt>Tipo</dt><dd>${esc(s.tipo)}</dd><dt>Estado</dt><dd>${esc(s.estado)}</dd><dt>Presupuesto</dt><dd class="num">${fUSD(+s.presupuesto)}</dd>
          <dt>Publicación</dt><dd>${fFecha(s.fecha_pub)}</dd>
          <dt>Vínculo</dt><dd>${s.via === 'código' ? 'El código aparece en el e-DOC' : 'Coincidencia por objeto del proceso'}</dd></dl>
          <div><a href="${esc(s.url || SERCOP_URL)}" target="_blank" rel="noopener">${s.url ? 'Abrir la ficha del proceso en SERCOP' : 'Abrir la búsqueda de procesos en SERCOP'}</a>${s.consultado ? `<div class="sub">Estado leído el ${fFecha(s.consultado, true)}</div>` : ''}</div>` : ''}
        ${p.sercopOtros.length ? `<h3>Procesos anteriores</h3><div class="lista-t">${p.sercopOtros.map(o => `<div><span class="mono">${esc(o.codigo)}</span> · ${esc(o.estado)} · ${fCorta(o.fecha_pub)}</div>`).join('')}</div>` : ''}
      </div></div>`;
  }
  function renderProyectos() {
    const L = res.procesos.filter(coincide);
    return `<div class="libro"><div class="fila-h"><span></span><span>Proyecto y situación</span><span>Etapa interna</span><span>SERCOP</span><span>Último movimiento</span></div>
      ${L.length ? L.map(filaProyecto).join('') : '<div class="vacio">Ningún proyecto coincide con los filtros.</div>'}</div>`;
  }
  function renderSercop() {
    const q = Motor.norm(ui.q);
    const L = res.sercop.filter(s => !q || q.split(/\s+/).every(w => Motor.norm(s.codigo + ' ' + s.objeto + ' ' + s.estado + ' ' + s.tipo).includes(w)));
    const con = res.sercop.filter(s => s.interno).length;
    return `<p class="sub" style="margin:0 0 8px">${con} de ${res.sercop.length} procesos tienen solicitud de revisión y aprobación en los enviados del e-DOC. Los demás suelen ser de otras direcciones.</p>
      <div class="libro scroll"><table><thead><tr><th>Código</th><th>Objeto</th><th>Estado</th><th class="r">Presupuesto</th><th>Publicación</th><th>Trámite interno</th></tr></thead><tbody>
      ${L.map(s => `<tr><td class="mono" style="white-space:nowrap">${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.codigo)}</a>` : esc(s.codigo)}</td><td style="min-width:260px">${esc(s.objeto)}<div class="sub">${esc(s.tipo)}</div></td>
        <td><span class="pill sercop ${claseSercop(s.estado)}">${esc(s.estado || 'Sin leer')}</span>${s.error ? '<div class="sub">No se pudo leer en la última corrida</div>' : ''}</td><td class="r num" style="white-space:nowrap">${fUSD(+s.presupuesto)}</td><td style="white-space:nowrap">${fFecha(s.fecha_pub)}</td>
        <td>${s.interno ? `<button class="copiar" data-ir="${esc(s.interno.id)}">#${esc(s.interno.tramites.map(t => t.numero).join(', #'))}</button><div class="sub">${esc(s.interno.etapaNombre)}</div>` : '<span class="sub" style="margin:0">Sin trámite enviado</span>'}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  function renderCambios() {
    const C = (raw.cambios || []).map(c => Object.assign({ fuente: 'Actualización automática' }, c)).concat(store.get('seg-cambios-v1') || []).sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)));
    if (!C.length) return `<div class="aviso ok"><b>Todavía no hay cambios registrados.</b><span>Cada vez que cargue una nueva exportación del e-DOC o una nueva consulta SERCOP, aquí aparecerán los proyectos que cambiaron de etapa o de estado en SERCOP, con la fecha de la carga. El registro se guarda en este navegador.</span></div>`;
    return `<div class="libro scroll"><table><thead><tr><th>Carga</th><th>Proyecto</th><th>Antes</th><th>Ahora</th></tr></thead><tbody>
      ${C.slice().reverse().map(c => `<tr><td style="white-space:nowrap">${fFecha(c.fecha, true)}<div class="sub">${esc(c.fuente)}</div></td><td>${esc(c.objeto)}</td><td>${esc(c.antes)}</td><td><b>${esc(c.ahora)}</b></td></tr>`).join('')}
      </tbody></table></div>`;
  }
  function renderVista() {
    $('#filtros').querySelectorAll('.chip').forEach(c => { c.hidden = ui.tab !== 'proyectos'; c.setAttribute('aria-pressed', ui.sev === c.dataset.sev); });
    document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === ui.tab));
    $('#c-proyectos').textContent = res.procesos.length; $('#c-sercop').textContent = res.sercop.length;
    $('#c-cambios').textContent = ((raw.cambios || []).length + (store.get('seg-cambios-v1') || []).length) || '';
    $('#vista').innerHTML = ui.tab === 'proyectos' ? renderProyectos() : ui.tab === 'sercop' ? renderSercop() : renderCambios();
    $('#flujo').querySelectorAll('.etapa-b').forEach(b => b.setAttribute('aria-pressed', ui.etapa === b.dataset.etapa));
  }
  function renderPie() {
    const U = Motor.UMBRAL;
    $('#pie').innerHTML = `<p><b>Cómo se calcula.</b> Se toman los trámites enviados cuyo asunto es una solicitud de revisión y aprobación de fase preparatoria o de desagregación tecnológica. Los reenvíos y alcances del mismo objeto se agrupan como un proyecto. La etapa interna sale de las notas del e-DOC: observaciones, revisión atendida, certificación presupuestaria, resolución de inicio u orden de compra. El cruce con SERCOP usa el código del proceso cuando aparece en el e-DOC y, si no, la coincidencia del objeto.</p>
      <p><b>Umbrales.</b> Alerta y crítico: en revisión ${U.revisionAlerta} y ${U.revisionCritico} días; con observaciones ${U.observadoAlerta} y ${U.observadoCritico}; revisión atendida sin certificación ${U.revisadoAlerta} y ${U.revisadoCritico}; certificación sin resolución de inicio ${U.certAlerta} y ${U.certCritico}; resolución de inicio sin publicar ${U.inicioAlerta} y ${U.inicioCritico}. Los días se cuentan hasta el corte de la exportación del e-DOC.</p>`;
  }
  function renderTodo() { renderFuentes(); renderResumen(); renderFlujo(); renderFases(); renderVista(); renderPie(); }

  // ---------- cargas
  const scripts = {};
  function cargarScript(src) {
    return scripts[src] = scripts[src] || new Promise((ok, err) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => err(new Error('No se pudo cargar ' + src)); document.head.appendChild(s); });
  }
  async function pdfjs() {
    await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js');
    const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
    lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    return lib;
  }
  async function sheet(file) {
    await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    return wb.SheetNames.map(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }));
  }
  function aviso(tipo, html) { const m = $('#mensaje'); m.className = 'aviso ' + tipo; m.innerHTML = html; m.hidden = false; }
  async function procesarArchivo(file) {
    aviso('', `<b>Leyendo ${esc(file.name)}…</b><span>Esto toma unos segundos para un PDF largo.</span>`);
    try {
      const antes = snapshot(res);
      let nuevo = JSON.parse(JSON.stringify(raw)), fuente = '', detalleMsg = '';
      if (/\.pdf$/i.test(file.name)) {
        const lib = await pdfjs();
        const r = await Lector.leerPdfEdoc(lib, new Uint8Array(await file.arrayBuffer()));
        if (!r.filas.length) throw new Error('El PDF no tiene la tabla de trámites del e-DOC (columnas #, Departamento, Tipo, Estado, Asunto y Última interacción).');
        const rev = r.filas.filter(f => Motor.esRevision(f.asunto));
        nuevo.edoc = { corte: r.corte || new Date().toISOString().slice(0, 10), fuente: 'Exportación e-DOC (PDF)', filas: rev, leidas: r.filas.length };
        fuente = 'e-DOC'; detalleMsg = `${r.filas.length.toLocaleString('es-EC')} trámites leídos; ${rev.length} son de revisión y aprobación (corte ${fFecha(nuevo.edoc.corte)}).`;
      } else {
        const hojas = await sheet(file);
        let hecho = false;
        for (const rows of hojas) {
          const s = Lector.leerSercop(rows);
          if (s && s.procesos.length) { nuevo.sercop = { corte: s.corte || new Date().toISOString().slice(0, 10), fuente: 'Consulta SERCOP (' + file.name + ')', procesos: s.procesos }; fuente = 'SERCOP'; detalleMsg = `${s.procesos.length} procesos del GADMR (estados al ${fFecha(nuevo.sercop.corte)}).`; hecho = true; break; }
          const e = Lector.leerCsvEdoc(rows);
          if (e && e.filas.length) { const rev = e.filas.filter(f => Motor.esRevision(f.asunto)); nuevo.edoc = { corte: new Date().toISOString().slice(0, 10), fuente: 'Exportación e-DOC (' + file.name + ')', filas: rev }; fuente = 'e-DOC'; detalleMsg = `${e.filas.length} trámites leídos; ${rev.length} de revisión y aprobación.`; hecho = true; break; }
        }
        if (!hecho) throw new Error('No reconocí el archivo. Para SERCOP se necesitan las columnas Código, Estado y Objeto; para el e-DOC, las columnas #, Estado y Asunto.');
      }
      raw = nuevo; recalcular();
      const despues = snapshot(res), cambios = [], ahora = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
      for (const id in despues) {
        const a = antes[id], d = despues[id];
        if (!a) cambios.push({ fecha: ahora, fuente, objeto: d.objeto, antes: 'Sin registro', ahora: d.nombre + (d.sercop ? ` · ${d.sercop.split('|')[1]}` : '') });
        else if (a.etapa !== d.etapa || a.sercop !== d.sercop) cambios.push({ fecha: ahora, fuente, objeto: d.objeto, antes: a.nombre + (a.sercop ? ` · ${a.sercop.split('|')[1]}` : ''), ahora: d.nombre + (d.sercop ? ` · ${d.sercop.split('|')[1]}` : '') });
      }
      const hist = (store.get('seg-cambios-v1') || []).concat(cambios).slice(-500);
      store.set('seg-cambios-v1', hist);
      const guardado = store.set('seg-raw-v1', raw);
      renderTodo();
      aviso('ok', `<b>${esc(fuente)} actualizado.</b><span>${esc(detalleMsg)} ${cambios.length ? `${cambios.length} proyecto(s) cambiaron; revíselos en la pestaña Cambios.` : 'Ningún proyecto cambió de etapa.'}${guardado ? '' : ' Este navegador no permite guardar los datos; al recargar la página volverá la versión publicada.'}</span>`);
    } catch (err) {
      aviso('err', `<b>No se pudo leer ${esc(file.name)}.</b><span>${esc(err.message || err)}</span>`);
    }
  }

  // ---------- eventos
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-copiar]');
    if (t) { e.stopPropagation(); const v = t.dataset.copiar; Promise.resolve().then(() => navigator.clipboard.writeText(v)).then(() => { t.textContent = 'Copiado'; setTimeout(() => t.textContent = 'Copiar', 1500); }).catch(() => { const r = document.createRange(); r.selectNodeContents(t.previousElementSibling); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }); return; }
    const ir = e.target.closest('[data-ir]');
    if (ir) { ui.tab = 'proyectos'; ui.q = ''; ui.etapa = null; ui.sev = null; $('#q').value = ''; ui.abierto = new Set([ir.dataset.ir]); renderVista(); const f = document.querySelector(`.fila[data-id="${CSS.escape(ir.dataset.ir)}"]`); if (f) f.scrollIntoView({ block: 'start' }); return; }
    if (e.target.closest('[data-stop]') || e.target.closest('a')) return;
    const fila = e.target.closest('.fila');
    if (fila) { const id = fila.dataset.id; ui.abierto.has(id) ? ui.abierto.delete(id) : ui.abierto.add(id); renderVista(); return; }
    const et = e.target.closest('.etapa-b');
    if (et) { ui.etapa = ui.etapa === et.dataset.etapa ? null : et.dataset.etapa; ui.tab = 'proyectos'; renderVista(); return; }
    const ch = e.target.closest('.chip');
    if (ch) { ui.sev = ui.sev === ch.dataset.sev ? null : ch.dataset.sev; renderVista(); return; }
    const go = e.target.closest('[data-go]');
    if (go) { ui.sev = go.dataset.go; ui.tab = 'proyectos'; ui.etapa = null; renderVista(); $('#filtros').scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    const tab = e.target.closest('.tab');
    if (tab) { ui.tab = tab.dataset.tab; renderVista(); }
  });
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('fila')) { e.preventDefault(); e.target.click(); } });
  $('#q').addEventListener('input', e => { ui.q = e.target.value.trim(); renderVista(); });
  ['#f-edoc', '#f-sercop'].forEach(id => $(id).addEventListener('change', e => { const f = e.target.files[0]; if (f) procesarArchivo(f); e.target.value = ''; }));
  let arr = 0; const drop = $('#drop');
  addEventListener('dragenter', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { arr++; drop.hidden = false; } });
  addEventListener('dragleave', () => { if (--arr <= 0) { arr = 0; drop.hidden = true; } });
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', e => { e.preventDefault(); arr = 0; drop.hidden = true; const f = e.dataTransfer.files[0]; if (f) procesarArchivo(f); });

  // ---------- arranque: datos publicados junto a la página (sincronización automática), si existen
  recalcular(); renderTodo();
  const sincronizar = () => fetch('datos_contratacion.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => {
    if (!d || !d.edoc || !d.sercop) return;
    if (marca(d) > marca(raw)) { raw = d; recalcular(); renderTodo(); }
  }).catch(() => {});
  sincronizar();
  setInterval(sincronizar, 30 * 60 * 1000);
})();
