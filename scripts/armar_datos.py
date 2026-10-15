#!/usr/bin/env python3
"""
Une data/edoc.json (extracción e-DOC) y data/sercop.json (fichas SERCOP) con la base de procesos
data/sercop_base.json y escribe datos_contratacion.json, que es lo que lee el tablero.
Si una extracción falló, conserva los últimos datos buenos de esa fuente.
"""
import json, os
from datetime import datetime, timedelta, timezone

ECUADOR = timezone(timedelta(hours=-5))
SALIDA = "datos_contratacion.json"

def leer(ruta, defecto=None):
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as fh:
            return json.load(fh)
    return defecto

def main():
    previo = leer(SALIDA, {})
    edoc = leer("data/edoc.json")
    sercop = leer("data/sercop.json", {"procesos": []})
    base = leer("data/sercop_base.json", {"procesos": []})

    # --- e-DOC
    if edoc and edoc.get("filas"):
        bloque_edoc = {"corte": edoc["corte"], "hora": edoc.get("hora"), "fuente": edoc["fuente"],
                       "filas": edoc["filas"], "leidas": edoc.get("leidas")}
        bloque_hist = {"corte": edoc["corte"], "fuente": "e-DOC · historial de cada trámite", "tramites": edoc["historial"]}
    else:
        print("[WARN] sin datos nuevos del e-DOC; se conservan los anteriores")
        bloque_edoc, bloque_hist = previo["edoc"], previo["historial"]

    # --- SERCOP: base (Excel inicial) + fichas leídas; la ficha manda cuando se pudo leer
    por_codigo = {p["codigo"]: dict(p) for p in base.get("procesos", [])}
    leidos = 0
    for p in sercop.get("procesos", []):
        cod = p.get("codigo")
        if not cod:
            continue
        actual = por_codigo.get(cod, {"codigo": cod})
        actual["url"] = p.get("url")
        if not p.get("error") and p.get("estado"):
            leidos += 1
            for k in ("estado", "objeto", "presupuesto", "tipo", "fecha_pub"):
                if p.get(k) and (k in ("estado", "objeto", "presupuesto") or not actual.get(k)):
                    actual[k] = p[k]
            actual["consultado"] = p.get("consultado")
        else:
            actual["error"] = p.get("error")
        por_codigo[cod] = actual
    procesos = sorted(por_codigo.values(), key=lambda p: p.get("fecha_pub") or "", reverse=True)
    corte_sercop = sercop.get("corte") if leidos else (previo.get("sercop", {}).get("corte") or base.get("corte"))
    bloque_sercop = {"corte": corte_sercop, "hora": sercop.get("hora") if leidos else None,
                     "fuente": f"SERCOP · {leidos} fichas leídas automáticamente" if leidos else base.get("fuente", "SERCOP"),
                     "procesos": procesos}

    salida = {"generado": datetime.now(ECUADOR).strftime("%Y-%m-%d %H:%M"), "edoc": bloque_edoc,
              "historial": bloque_hist, "sercop": bloque_sercop, "cambios": leer("data/cambios.json", [])}
    with open(SALIDA, "w", encoding="utf-8") as fh:
        json.dump(salida, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"[OK] {SALIDA}: {len(bloque_edoc['filas'])} solicitudes e-DOC, {len(procesos)} procesos SERCOP ({leidos} actualizados)")

if __name__ == "__main__":
    main()
