#!/usr/bin/env python3
"""Regenera index.html a partir de fuente/ (plantilla, motor, lector, app) y datos_contratacion.json."""
import os
d = os.path.dirname(os.path.abspath(__file__)); r = os.path.dirname(d)
lee = lambda *p: open(os.path.join(*p), encoding="utf-8").read()
out = (lee(d, "plantilla.html").replace("__RAW__", lee(r, "datos_contratacion.json").replace("</", "<\\/"))
       .replace("__MOTOR__", lee(d, "motor.js")).replace("__LECTOR__", lee(d, "lector.js")).replace("__APP__", lee(d, "app.js")))
cab = '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>[hidden]{display:none!important}body{margin:0}img{max-width:100%}</style>\n</head>\n<body>\n'
open(os.path.join(r, "index.html"), "w", encoding="utf-8").write(cab + out + "\n</body>\n</html>\n")
print("[OK] index.html")
