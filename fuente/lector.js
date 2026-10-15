/* Lectores de exportaciones: e-DOC (PDF de "Trámites" o CSV) y SERCOP (Excel/CSV de búsqueda de procesos). */
(function (root) {
  const norm = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

  // --- e-DOC PDF: tabla con columnas # | Departamento | Tipo | Estado | Asunto | Última interacción
  async function leerPdfEdoc(pdfjsLib, data) {
    const doc = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
    const filas = []; let corte = null, pendiente = null;
    const agregar = (fila, L) => { // une a la fila anterior el texto que continúa en la página siguiente
      ['departamento', 'tipo', 'estado'].forEach((k, j) => { if (L[j + 1].length) fila[k] = (fila[k] + ' ' + L[j + 1].join(' ')).trim(); });
      if (L[4].length) fila.asunto = (fila.asunto + ' ' + L[4].join(' ')).replace(/\s+/g, ' ').trim();
      if (L[5].length) fila._ult = fila._ult.concat(L[5]);
    };
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const tc = await page.getTextContent();
      const items = tc.items.filter(it => it.str && it.str.trim()).map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5] }));
      const h = k => items.find(it => norm(it.s).startsWith(k));
      const cab = [h('#'), h('DEPARTAMENTO'), h('TIPO'), h('ESTADO'), h('ASUNTO'), h('ULTIMA INTERACCION')];
      if (cab.some(c => !c)) continue;
      const xs = cab.map(c => c.x - 2), yCab = cab[0].y;
      const col = x => { let i = 0; while (i + 1 < xs.length && x >= xs[i + 1]) i++; return i; };
      const cuerpo = items.filter(it => it.y < yCab - 2 && !(it.y < 50 && /^\s*(\d{4}-\d\d-\d\d|\d+\/\d+)\s*$/.test(it.s)));
      for (const it of items) { const m = it.s.match(/^\s*(\d{4}-\d\d-\d\d)\s*$/); if (m && it.y < 80) corte = corte || m[1]; }
      const inicios = cuerpo.filter(it => col(it.x) === 0 && /^\d{5,8}$/.test(it.s.trim())).sort((a, b) => b.y - a.y);
      const lineas = c => {
          const ord = c.sort((a, b) => b.y - a.y || a.x - b.x), out = [];
          for (const it of ord) { const last = out[out.length - 1]; if (last && Math.abs(last.y - it.y) < 2) last.s += (/\s$/.test(last.s) ? '' : ' ') + it.s; else out.push({ y: it.y, s: it.s }); }
          return out.map(l => l.s.trim()).filter(Boolean);
      };
      const celdasEntre = (yTop, yBot) => {
        const c = [[], [], [], [], [], []];
        cuerpo.filter(it => it.y <= yTop && it.y > yBot).forEach(it => c[col(it.x)].push(it));
        return c.map(lineas);
      };
      if (pendiente) { const yTop = inicios.length ? Infinity : Infinity, yBot = inicios.length ? inicios[0].y + 3 : 0; agregar(pendiente, celdasEntre(yTop, yBot)); }
      inicios.forEach((ini, k) => {
        const L = celdasEntre(ini.y + 3, k + 1 < inicios.length ? inicios[k + 1].y + 3 : 0);
        const fila = { numero: L[0][0], memo: L[0].slice(1).join(' '), departamento: L[1].join(' '), tipo: L[2].join(' '),
          estado: L[3].join(' '), asunto: L[4].join(' ').replace(/\s+/g, ' '), _ult: L[5] };
        filas.push(fila); pendiente = fila;
      });
    }
    for (const f of filas) {
      const ult = f._ult; delete f._ult;
      const iF = ult.findIndex(l => /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d UTC$/.test(l));
      f.ult_nombre = iF >= 0 ? ult.slice(0, iF).join(' ') : '';
      f.ult_fecha_utc = iF >= 0 ? ult[iF].replace(' UTC', '') : null;
      f.ult_nota = (iF >= 0 ? ult.slice(iF + 1) : ult).join(' ');
    }
    return { filas, corte };
  }

  // --- filas tabulares genéricas (SheetJS: arrays) -> busca la fila de cabecera
  function cabecera(rows, claves) {
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const r = rows[i].map(norm);
      if (claves.every(k => r.some(c => c.startsWith(k)))) return { i, idx: k => r.findIndex(c => c.startsWith(k)) };
    }
    return null;
  }
  function fechaISO(v) {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const s = String(v || '').trim();
    let m = s.match(/^(\d{4})-(\d\d)-(\d\d)/); if (m) return m[0];
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return s || null;
  }
  function leerCsvEdoc(rows) {
    const c = cabecera(rows, ['#', 'ESTADO', 'ASUNTO']);
    if (!c) return null;
    const g = (r, k) => { const j = c.idx(k); return j >= 0 ? String(r[j] ?? '').trim() : ''; };
    const filas = rows.slice(c.i + 1).filter(r => /^\d{5,8}$/.test(String(r[c.idx('#')] || '').trim())).map(r => ({
      numero: g(r, '#'), memo: g(r, 'NUMERO DE DOCUMENTO') || g(r, 'DOCUMENTO'), departamento: g(r, 'DEPARTAMENTO'), tipo: g(r, 'TIPO'),
      estado: g(r, 'ESTADO'), asunto: g(r, 'ASUNTO'), ult_nombre: g(r, 'ASIGNADO') || g(r, 'AUTOR'),
      ult_fecha_utc: (g(r, 'ACTUALIZADO') || g(r, 'ULTIMA')).replace(/ UTC$/, '') || null, ult_nota: ''
    }));
    return { filas, corte: null };
  }
  function leerSercop(rows) {
    const c = cabecera(rows, ['CODIGO', 'ESTADO', 'OBJETO']);
    if (!c) return null;
    let corte = null;
    for (const r of rows.slice(0, c.i)) { const m = r.join(' ').match(/consultados el (\d{4}-\d\d-\d\d)/i); if (m) corte = m[1]; }
    const g = (r, k) => { const j = c.idx(k); return j >= 0 ? r[j] : ''; };
    const procesos = rows.slice(c.i + 1).filter(r => /GADMR/i.test(String(g(r, 'CODIGO') || ''))).map(r => ({
      codigo: String(g(r, 'CODIGO')).trim(), tipo: String(g(r, 'TIPO') || '').trim(), estado: String(g(r, 'ESTADO') || '').trim(),
      presupuesto: +String(g(r, 'PRESUPUESTO') || '0').replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.') || 0,
      fecha_pub: fechaISO(g(r, 'FECHA')), objeto: String(g(r, 'OBJETO') || '').trim()
    }));
    return { procesos, corte };
  }
  root.Lector = { leerPdfEdoc, leerCsvEdoc, leerSercop };
})(typeof window !== 'undefined' ? window : globalThis);
