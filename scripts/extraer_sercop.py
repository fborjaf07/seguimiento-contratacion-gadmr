#!/usr/bin/env python3
"""
Lee el estado actual de cada proceso SERCOP listado en sercop_procesos.json (link de la ficha del proceso,
la que lleva idSoliCompra=...). Las fichas son públicas y no tienen captcha. Escribe data/sercop.json.

sercop_procesos.json:
  [ {"url": "https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/PC/informacionProcesoContratacion2.cpe?idSoliCompra=XXXX"}, ... ]
  (opcional: "codigo" para referencia; se completa solo)
"""
import asyncio, json, os, re
from datetime import datetime, timedelta, timezone
from playwright.async_api import async_playwright

LISTA   = os.environ.get("LISTA_SERCOP", "sercop_procesos.json")
SALIDA  = os.environ.get("SALIDA_SERCOP", "data/sercop.json")
ECUADOR = timezone(timedelta(hours=-5))

# etiquetas de la ficha del proceso (se aceptan variantes)
CAMPOS = {
    "codigo":      [r"C[óo]digo(?: del Proceso)?"],
    "entidad":     [r"Entidad(?: Contratante)?"],
    "objeto":      [r"Objeto de(?:l)? Proceso", r"Descripci[óo]n"],
    "estado":      [r"Estado del Proceso"],
    "tipo":        [r"Tipo de Contrataci[óo]n", r"Tipo Compra"],
    "presupuesto": [r"Presupuesto Referencial Total\s*\(sin iva\)", r"Presupuesto Referencial(?: Total)?"],
    "fecha_pub":   [r"Fecha de Publicaci[óo]n"],
}

def campo(texto, patrones):
    for p in patrones:
        m = re.search(r"(?:^|\n)\s*" + p + r"\s*:+[ \t]*([^\n]+)", texto, re.I)
        if m and m.group(1).strip().strip(":").strip():
            return m.group(1).strip().strip(":").strip()
    return ""

def numero(s):
    s = re.sub(r"[^\d,.\-]", "", s or "")
    if s.count(",") and s.count("."):
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif s.count(","):
        s = s.replace(",", ".") if len(s.split(",")[-1]) == 2 else s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return 0.0

def fecha_iso(s):
    m = re.search(r"(\d{4})-(\d\d)-(\d\d)", s or "")
    if m: return m.group(0)
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", s or "")
    return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}" if m else ""

async def leer(page, url):
    await page.goto(url, timeout=45000, wait_until="domcontentloaded")
    await page.wait_for_timeout(2500)
    texto = await page.inner_text("body")
    # algunas fichas presentan los datos en tablas etiqueta|valor: se normaliza a "etiqueta: valor"
    pares = await page.evaluate("""() => [...document.querySelectorAll('tr')].map(r => [...r.cells].map(c => c.innerText.trim()))
        .filter(c => c.length >= 2).map(c => c[0] + ': ' + c.slice(1).join(' ')).join('\\n')""")
    base = pares + "\n" + texto
    d = {k: campo(base, v) for k, v in CAMPOS.items()}
    d["presupuesto"] = numero(d["presupuesto"])
    d["fecha_pub"] = fecha_iso(d["fecha_pub"])
    if "GADMR" not in (d["codigo"] or ""):
        m = re.search(r"\b[A-Z]{2,6}-GADMR-\d{4}-\d{1,4}\b|\b[A-Z]{2,6}-GADMR-\d{1,4}-\d{4}\b", base)
        d["codigo"] = m.group(0) if m else ""
    return d

async def main():
    with open(LISTA, encoding="utf-8") as fh:
        lista = json.load(fh)
    previo = {}
    if os.path.exists(SALIDA):
        with open(SALIDA, encoding="utf-8") as fh:
            previo = {p.get("url"): p for p in json.load(fh).get("procesos", [])}
    ahora = datetime.now(ECUADOR)
    procesos, errores, seguidos = [], 0, 0
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        ctx = await browser.new_context(ignore_https_errors=True, locale="es-EC",
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36")
        page = await ctx.new_page()
        for i, item in enumerate(lista, 1):
            url = item["url"].strip()
            try:
                d = await leer(page, url)
                if not d["estado"]:
                    raise ValueError("la ficha no muestra 'Estado del Proceso'")
                d.update(url=url, consultado=ahora.strftime("%Y-%m-%d %H:%M"), error=None)
                print(f"[{i}/{len(lista)}] {d['codigo'] or '?'} → {d['estado']}", flush=True)
                seguidos = 0
            except Exception as e:
                errores += 1
                d = dict(previo.get(url) or {"codigo": item.get("codigo", ""), "estado": "", "objeto": "", "tipo": "", "presupuesto": 0, "fecha_pub": ""})
                d.update(url=url, error=str(e)[:200])
                print(f"[{i}/{len(lista)}] ERROR {item.get('codigo','')}: {str(e)[:160]}", flush=True)
                seguidos += 1
            d["codigo"] = d.get("codigo") or item.get("codigo", "")
            procesos.append(d)
            if seguidos >= 3 and i == seguidos:
                # las tres primeras fichas fallaron: SERCOP no responde desde este servidor; no tiene sentido seguir
                print("SERCOP no responde desde este servidor; se conservan los estados anteriores.", flush=True)
                for resto in lista[i:]:
                    prev = dict(previo.get(resto["url"]) or {"codigo": resto.get("codigo", "")})
                    prev.update(url=resto["url"], error="no consultado (SERCOP no respondió)")
                    procesos.append(prev)
                break
            await page.wait_for_timeout(800)
        await browser.close()
    salida = {"corte": ahora.strftime("%Y-%m-%d"), "hora": ahora.strftime("%Y-%m-%d %H:%M"),
              "fuente": "SERCOP · fichas de proceso (extracción automática)", "procesos": procesos}
    os.makedirs(os.path.dirname(SALIDA) or ".", exist_ok=True)
    with open(SALIDA, "w", encoding="utf-8") as fh:
        json.dump(salida, fh, ensure_ascii=False, indent=1)
    print(f"[OK] {SALIDA}: {len(procesos)} procesos, {errores} con error")
    if procesos and errores == len(procesos):
        raise SystemExit("Ninguna ficha SERCOP se pudo leer")

if __name__ == "__main__":
    asyncio.run(main())
