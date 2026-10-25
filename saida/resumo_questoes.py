#!/usr/bin/env python3
"""Gera um resumo curto e uma pequena amostra a partir de saida\\todas_questoes.json.
Uso (PowerShell):  py -X utf8 resumo_questoes.py saida\\todas_questoes.json
Cria: saida\\resumo.txt  e  saida\\amostra_revisar.json  (pequenos, para enviar ao Claude).
Só lê o arquivo; não altera nada."""
import sys, json, re, random, collections
from pathlib import Path

src = Path(sys.argv[1]); d = json.loads(src.read_text(encoding="utf8")); qs = d["questoes"]
random.seed(1)
def materia(q):
    p = q["origem_pdf"].split("/")
    return p[1] if len(p) > 2 and "Banco" in p[0] else p[0][:40]
VISUAL = re.compile(r"a seguir|abaixo|figura|imagem|radiografia|\bECG\b|eletrocardiograma|tomografia|ultrassonografia|fotografia|ver imagem|exame de imagem", re.I)
motivos = collections.Counter(); sem_img = []; por_pdf = collections.Counter()
for q in qs:
    for r in q["revisar"]: motivos[re.sub(r" em (enunciado|alt [A-E])$", " (enunciado/alternativa)", r)] += 1
    if not q["imagens"] and VISUAL.search(q["enunciado"]):
        sem_img.append(q); por_pdf[q["origem_pdf"].split("/")[0][:40]] += 1
com_img = sum(1 for q in qs if q["imagens"]); sem_cod = sum(1 for q in qs if not q["codigo"])
linhas = [f"questoes unicas: {len(qs)}", f"com imagem: {com_img}", f"sem codigo: {sem_cod}",
          f"enunciado cita imagem/figura mas sem imagem anexada: {len(sem_img)}", "", "motivos de revisao:"]
linhas += [f"  {v:6d}  {k}" for k, v in motivos.most_common()]
linhas += ["", "sem imagem (suspeitas) por pasta:"] + [f"  {v:6d}  {k}" for k, v in por_pdf.most_common()]
linhas += ["", "questoes por materia (Banco por MATERIA):"]
linhas += [f"  {v:6d}  {k}" for k, v in collections.Counter(materia(q) for q in qs).most_common()]
(src.parent / "resumo.txt").write_text("\n".join(linhas), encoding="utf8")
rev = [q for q in qs if q["revisar"]]
amostra = random.sample(rev, min(40, len(rev))) + random.sample(sem_img, min(20, len(sem_img)))
corte = lambda q: dict(origem=q["origem_pdf"], numero=q["numero"], enunciado=q["enunciado"][:300], alternativas=[a["texto"][:120] for a in q["alternativas"]], revisar=q["revisar"], imagens=len(q["imagens"]))
(src.parent / "amostra_revisar.json").write_text(json.dumps([corte(q) for q in amostra], ensure_ascii=False, indent=1), encoding="utf8")
print("\n".join(linhas)); print("\nGerado: resumo.txt e amostra_revisar.json em", src.parent)
