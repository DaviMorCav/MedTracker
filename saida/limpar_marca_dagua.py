#!/usr/bin/env python3
"""Acha e remove imagens de marca d'água (a mesma imagem repetida em muitas questões).

Uso (PowerShell), em duas etapas:
  1) py -X utf8 limpar_marca_dagua.py saida            -> só MOSTRA o que seria removido (não altera nada)
  2) py -X utf8 limpar_marca_dagua.py saida --aplicar  -> remove de verdade

Como funciona: calcula a "impressão digital" (MD5) de cada imagem. Se a mesma imagem aparece em
MIN_QUESTOES ou mais questões diferentes, é tratada como marca d'água. Figuras de questão (ECG, exames)
quase nunca se repetem tantas vezes. Antes de remover, copia um exemplo de cada suspeita para
saida\\_marca_dagua_suspeita\\ para você ver. Com --aplicar guarda cópia de segurança dos JSONs (.backup).
Opção: --min N muda o limite (padrão 6)."""
import sys, json, re, shutil, hashlib, collections
from pathlib import Path

args = sys.argv[1:]
if not args: sys.exit(__doc__)
raiz = Path(args[0]); aplicar = "--aplicar" in args
MIN = int(args[args.index("--min") + 1]) if "--min" in args else 6

def md5(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""): h.update(bloco)
    return h.hexdigest()

todas_p = raiz / "todas_questoes.json"
print("Lendo todas_questoes.json (pode levar um minuto)...", flush=True)
todas = json.loads(todas_p.read_text(encoding="utf8"))
n_total = sum(len(q["imagens"]) for q in todas["questoes"])
print(f"{len(todas['questoes'])} questões, {n_total} imagens para conferir.", flush=True)
cache, uso = {}, collections.defaultdict(set)
exemplo, total_imgs = {}, 0
for q in todas["questoes"]:
    for im in q["imagens"]:
        p = raiz / im["arquivo"]; total_imgs += 1
        if total_imgs % 2000 == 0: print(f"  conferindo imagens: {total_imgs}/{n_total} ({100 * total_imgs // max(n_total, 1)}%)", flush=True)
        if not p.exists(): continue
        k = str(p)
        if k not in cache: cache[k] = md5(p)
        h = cache[k]; uso[h].add(q["id"]); exemplo.setdefault(h, p)
suspeitas = {h: len(s) for h, s in uso.items() if len(s) >= MIN}
afetadas = sum(1 for q in todas["questoes"] for im in q["imagens"] if cache.get(str(raiz / im["arquivo"])) in suspeitas)
print(f"Imagens ligadas a questões: {total_imgs} | tipos de imagem diferentes: {len(uso)}")
print(f"Suspeitas de marca d'água (aparecem em {MIN}+ questões): {len(suspeitas)} tipos, {afetadas} cópias")
vis = raiz / "_marca_dagua_suspeita"; vis.mkdir(exist_ok=True)
for i, (h, n) in enumerate(sorted(suspeitas.items(), key=lambda x: -x[1]), 1):
    e = exemplo[h]; shutil.copy(e, vis / f"{i:02d}-aparece_em_{n}_questoes{e.suffix}")
    if i <= 10: print(f"  {i:02d}. em {n} questões -> {vis.name}\\{i:02d}-aparece_em_{n}_questoes{e.suffix}")
if not aplicar:
    print(f"\nNada foi alterado. Abra a pasta {vis} e confira se são mesmo marcas d'água.\nSe estiver certo, rode de novo com --aplicar."); sys.exit()

# ---- aplicar ----
shutil.copy(todas_p, raiz / "todas_questoes.backup.json")
for q in todas["questoes"]:
    q["imagens"] = [im for im in q["imagens"] if cache.get(str(raiz / im["arquivo"])) not in suspeitas]
todas_p.write_text(json.dumps(todas, ensure_ascii=False), encoding="utf8")
apagadas = 0
jsons = list((raiz / "por_pdf").rglob("questoes.json"))
print(f"Atualizando {len(jsons)} JSONs de PDFs...", flush=True)
for i, jp in enumerate(jsons, 1):
    if i % 50 == 0: print(f"  {i}/{len(jsons)}", flush=True)
    d = json.loads(jp.read_text(encoding="utf8")); mudou = False; removidos = set()
    for lista in (d["questoes"], d["fora_do_modo_resolucao"]):
        for q in lista:
            novas = []
            for im in q["imagens"]:
                p = jp.parent / im["arquivo"]
                if p.exists():
                    k = str(p)
                    if k not in cache: cache[k] = md5(p)
                    if cache[k] in suspeitas: removidos.add(im["arquivo"]); mudou = True; continue
                novas.append(im)
            q["imagens"] = novas
    if mudou:
        shutil.copy(jp, jp.with_suffix(".backup"))
        jp.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf8")
        for rel in removidos:
            f = jp.parent / rel
            if f.exists(): f.unlink(); apagadas += 1
        pv = jp.parent / "previa.html"
        if pv.exists():
            t = pv.read_text(encoding="utf8")
            for rel in removidos: t = t.replace(f"<img src='{rel}'>", "")
            pv.write_text(t, encoding="utf8")
print(f"\nPronto: {afetadas} referências removidas dos JSONs e {apagadas} arquivos de imagem apagados.")
print("Cópias de segurança: todas_questoes.backup.json e questoes.backup em cada pasta de PDF.")
