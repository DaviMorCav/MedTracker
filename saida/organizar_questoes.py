#!/usr/bin/env python3
"""Roda, em ordem, reconstruir_todas.py e classificar_materias.py (precisam estar na MESMA pasta deste arquivo).
Uso (PowerShell, dentro da pasta saida):   py -X utf8 organizar_questoes.py ."""
import sys, runpy
from pathlib import Path
aqui = Path(__file__).resolve().parent
alvo = sys.argv[1] if len(sys.argv) > 1 else "."
for nome in ("reconstruir_todas.py", "classificar_materias.py"):
    arq = aqui / nome
    if not arq.exists(): sys.exit(f"Falta o arquivo {nome} nesta pasta ({aqui}).")
    print(f"\n=== {nome} ===", flush=True)
    sys.argv = [str(arq), alvo]
    runpy.run_path(str(arq), run_name="__main__")
