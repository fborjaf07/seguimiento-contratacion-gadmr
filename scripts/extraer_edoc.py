#!/usr/bin/env python3
"""
Extrae del e-DOC (eGob) las solicitudes de revisión y aprobación enviadas por la cuenta configurada
y el historial completo de cada una. Escribe data/edoc.json.

Variables de entorno: EDOC_USUARIO, EDOC_CONTRASENA
"""
import asyncio, json, os, re, sys, unicodedata
from datetime import datetime, timedelta, timezone
from playwright.async_api import async_playwright

USUARIO    = os.environ.get("EDOC_USUARIO", "")
CONTRASENA = os.environ.get("EDOC_CONTRASENA", "")
CAS_LOGIN  = "https://egob.gadmriobamba.gob.ec:8443/cas/login"
BASE_URL   = "https://egobedoc.gadmriobamba.gob.ec:8081"
SERVICE    = f"{BASE_URL}/auth/cas/callback?origin=https%3A%2F%2Fegobedoc.gadmriobamba.gob.ec%3A8081%2F"
SALIDA     = os.environ.get("SALIDA_EDOC", "data/edoc.json")
# el buscador de Enviados distingue tildes: se consulta con y sin tilde y se filtra después
CONSULTAS  = ["APROBACIÓN", "APROBACION", "Aprobación", "aprobación"]
ECUADOR    = timezone(timedelta(hours=-5))

def norm(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().upper()

def es_revision(asunto):
    n = norm(asunto)
    return bool(re.search(r"REVISION\s+Y\s+APROBACION", n)) and bool(re.search(r"FASE PREPARATORIA|DESAGREGACION", n))

def local_a_utc(f):
    try:
        return (datetime.strptime(f[:16], "%Y-%m-%d %H:%M") + timedelta(hours=5)).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return None

async def login(page):
    print("Login CAS...")
    await page.goto(f"{CAS_LOGIN}?service={SERVICE}", timeout=60000, wait_until="networkidle")
    await page.wait_for_timeout(1500)
    await page.fill('input[name="username"]', USUARIO)
    await page.fill('input[name="password"]', CONTRASENA)
    await page.click('button[type="submit"], input[type="submit"]')
    await page.wait_for_load_state("networkidle")
    await page.wait_for_timeout(3000)
    if "egobedoc" not in page.url:
        cuerpo = (await page.inner_text("body"))[:300].replace("\n", " ")
        raise SystemExit(f"Login fallido (URL {page.url}). Revise EDOC_USUARIO / EDOC_CONTRASENA. Página: {cuerpo}")
    print("Login OK")

async def asegurar_sesion(page):
    if "cas/login" in page.url:
        await login(page)
        return True
    return False

LISTA_JS = """() => {
  const t = [...document.querySelectorAll('table.list.issues')].pop();
  if (!t) return [];
  return [...t.querySelectorAll('tbody tr[id^="issue-"]')].map(r => {
    const c = [...r.cells].map(x => x.innerText.trim());
    const nro = c[2] || '';
    return { numero: r.id.replace('issue-', ''), estado_lista: c[1] || '',
             memo: (nro.split('\\n')[1] || '').trim(), asunto: c[3] || '', departamento: c[4] || '',
             tipo: c[5] || '', enviado: c[7] || '' };
  });
}"""

DETALLE_JS = """() => {
  const txt = s => (s || '').replace(/\\s+/g, ' ').trim();
  const attrs = (document.querySelector('.issue .attributes, div.attributes') || document.body).innerText;
  const estado = (attrs.match(/Estado:\\s*([^\\n]+?)(?:Prioridad:|\\n|$)/) || [])[1] || '';
  const registro = (attrs.match(/Fecha registro:\\s*(\\d{4}-\\d\\d-\\d\\d[ \\d:]*)/) || [])[1] || '';
  const asunto = (document.body.innerText.match(/Asunto:\\s*([^\\n]+)/) || [])[1] || (document.querySelector('.subject h3, .subject') || {}).innerText || '';
  const movs = [...document.querySelectorAll('div.journal-entry, div.journal')].map(j => {
    const autorEl = j.querySelector('.journal-entry__author');
    const cargo = autorEl && autorEl.querySelector('small') ? txt(autorEl.querySelector('small').innerText).replace(/^\\(|\\)$/g, '') : '';
    const nombre = autorEl ? txt(autorEl.innerText.replace(autorEl.querySelector('small') ? autorEl.querySelector('small').innerText : '', '')) : '';
    const tiempo = j.querySelector('.journal-entry__time');
    const fecha = tiempo ? (tiempo.innerText.match(/\\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d/) || [''])[0] : '';
    const notaEl = j.querySelector('.journal-entry__note');
    const nota = notaEl ? txt(notaEl.innerText).replace(/^Nota:\\s*/, '') : '';
    const detalles = [...j.querySelectorAll('.journal-entry__details li')].map(li => txt(li.innerText));
    let enviado = '';
    for (const d of detalles) {
      const m = d.match(/(?:Documento Enviado a|Asignado ha cambiado de .+? a)\\s+(.+)$/);
      if (m) { enviado = m[1].trim(); break; }
    }
    return { origen: txt((j.querySelector('.journal-entry__origin') || {}).innerText), nombre, cargo, fecha,
             nota, detalles, enviado_a: enviado, archivado: !!j.querySelector('.archived') };
  }).filter(m => m.fecha);
  return { asunto: txt(asunto), estado: txt(estado), registro: txt(registro), movs };
}"""

async def main():
    if not USUARIO or not CONTRASENA:
        raise SystemExit("Faltan EDOC_USUARIO / EDOC_CONTRASENA")
    inicio = datetime.now(ECUADOR)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--ignore-certificate-errors", "--no-sandbox", "--disable-dev-shm-usage"])
        ctx = await browser.new_context(ignore_https_errors=True,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36")
        page = await ctx.new_page()
        await login(page)

        candidatos = {}
        for q in CONSULTAS:
            await page.goto(f"{BASE_URL}/my/pmy?q={q}&per_page=300", timeout=60000, wait_until="domcontentloaded")
            if await asegurar_sesion(page):
                await page.goto(f"{BASE_URL}/my/pmy?q={q}&per_page=300", timeout=60000, wait_until="domcontentloaded")
            filas = await page.evaluate(LISTA_JS)
            for f in filas:
                candidatos.setdefault(f["numero"], f)
            print(f"  búsqueda '{q}': {len(filas)} filas")
        revision = {n: f for n, f in candidatos.items() if es_revision(f["asunto"])}
        print(f"{len(revision)} solicitudes de revisión y aprobación")

        historial, filas_out = {}, []
        for i, (num, f) in enumerate(sorted(revision.items()), 1):
            await page.goto(f"{BASE_URL}/issues/{num}", timeout=60000, wait_until="domcontentloaded")
            if await asegurar_sesion(page):
                await page.goto(f"{BASE_URL}/issues/{num}", timeout=60000, wait_until="domcontentloaded")
            d = await page.evaluate(DETALLE_JS)
            movs = d["movs"]  # el e-DOC los muestra del más reciente al más antiguo
            u = movs[0] if movs else {}
            print(f"  [{i}/{len(revision)}] #{num} {len(movs)} movimientos | {d['estado']}")
            filas_out.append({
                "numero": num, "memo": f["memo"], "departamento": f["departamento"], "tipo": f["tipo"],
                "estado": d["estado"] or f["estado_lista"], "asunto": d["asunto"] or f["asunto"],
                "registro": d["registro"][:16],
                "ult_nombre": u.get("nombre", ""), "ult_fecha_utc": local_a_utc(u.get("fecha", "")),
                "ult_nota": " ".join([u.get("nota", "")] + u.get("detalles", [])).strip()[:400],
            })
            historial[num] = {
                "descripcion": d["asunto"] or f["asunto"], "estado": d["estado"], "registro": d["registro"][:16],
                "mov": [{"f": m["fecha"], "n": m["nombre"], "c": m["cargo"],
                         "t": " ".join([m["nota"]] + m["detalles"]).strip()[:500],
                         "a": m["enviado_a"], "o": m["origen"]} for m in movs],
            }
        await browser.close()

    corte = inicio.strftime("%Y-%m-%d")
    salida = {"corte": corte, "hora": inicio.strftime("%Y-%m-%d %H:%M"), "fuente": "e-DOC · Enviados (extracción automática)",
              "filas": filas_out, "leidas": len(candidatos), "historial": historial}
    os.makedirs(os.path.dirname(SALIDA) or ".", exist_ok=True)
    with open(SALIDA, "w", encoding="utf-8") as fh:
        json.dump(salida, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"[OK] {SALIDA}: {len(filas_out)} solicitudes, corte {salida['hora']}")

if __name__ == "__main__":
    asyncio.run(main())
