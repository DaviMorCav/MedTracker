#!/usr/bin/env python3
"""(v2: guarda a matéria de cada cópia do Banco, para a questão poder ter mais de uma matéria)
Reconstrói saida\\todas_questoes.json a partir dos JSONs de cada PDF, com prioridade de fonte.

Problema que resolve: a mesma questão aparece no Banco por MATÉRIA (tem matéria e tema), nos compilados
por prova (tem banca e ano) e nos compilados por área. Antes, valia a primeira encontrada em ordem
alfabética (a prova). Agora vale o Banco por MATÉRIA, depois "por área", depois provas, e a questão
guarda em "fontes" TODAS as provas/áreas em que também aparece.

Uso (PowerShell, dentro da pasta saida):   py -X utf8 reconstruir_todas.py .
Guarda cópia: todas_questoes.antes_da_reconstrucao.json. Não mexe nos JSONs por PDF nem nas imagens."""
import sys, json, shutil
from pathlib import Path

raiz = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
base = raiz / "por_pdf"
if not base.exists(): sys.exit(f"Não achei {base}. Rode de dentro da pasta saida: py -X utf8 reconstruir_todas.py .")

def classificar(partes):
    p0 = partes[0].lower()
    if "banco de questoes" in p0 and len(partes) >= 3: return 0, "banco", partes[1], partes[-1]      # matéria, tema
    if "por área" in p0 or "por area" in p0: return 1, "area", None, partes[-1]
    if "compilado" in p0: return 2, "prova", None, partes[-1]
    return 3, "outro", None, partes[-1]

arquivos = []
for jp in base.rglob("questoes.json"):
    partes = jp.parent.relative_to(base).parts
    arquivos.append((classificar(partes), jp, partes))
arquivos.sort(key=lambda x: (x[0][0], str(x[1]).lower()))

todas, indice, repetidas = [], {}, 0
for (prio, tipo, materia, tema), jp, partes in arquivos:
    d = json.loads(jp.read_text(encoding="utf8")); pasta = "por_pdf/" + "/".join(partes)
    fonte = dict(tipo=tipo, nome=tema, **({"materia": materia} if tipo == "banco" else {}))
    for q in d["questoes"]:
        for im in q["imagens"]: im["arquivo"] = f"{pasta}/{im['arquivo']}"
        chave = q.get("codigo") or q["id"]
        if chave in indice:
            ex = indice[chave]; repetidas += 1
            if fonte not in ex["fontes"]: ex["fontes"].append(fonte)
            if not ex["imagens"] and q["imagens"]: ex["imagens"] = q["imagens"]          # aproveita a imagem se a 1ª cópia não tinha
            continue
        q["materia"] = materia; q["tema"] = tema if tipo == "banco" else None
        q["fontes"] = [fonte]; q["origem_pdf"] = "/".join(partes) + ".pdf"
        q.pop("tema_arquivo", None)
        indice[chave] = q; todas.append(q)

dest = raiz / "todas_questoes.json"
if dest.exists(): shutil.copy(dest, raiz / "todas_questoes.antes_da_reconstrucao.json")
dest.write_text(json.dumps(dict(versao=2, total=len(todas), questoes=todas), ensure_ascii=False), encoding="utf8")
com_mat = sum(1 for q in todas if q["materia"])
print(f"Questões únicas: {len(todas)} | repetidas unidas: {repetidas}")
print(f"Com matéria e tema (vindas do Banco por MATÉRIA): {com_mat} | sem matéria: {len(todas) - com_mat}")
mult = sum(1 for q in todas if len(q["fontes"]) > 1); print(f"Questões que aparecem em mais de uma fonte: {mult}")
multi = sum(1 for q in todas if len({f["materia"] for f in q["fontes"] if f.get("materia")}) > 1)
print(f"Questões que estão em mais de uma MATÉRIA do Banco: {multi}")
