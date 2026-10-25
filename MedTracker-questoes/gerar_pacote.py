#!/usr/bin/env python3
"""
Gera o pacote enxuto de questões para o MedTracker.

Lê saida/todas_questoes.json e cria, na pasta de destino:
  index.json          lista de matérias, totais e temas
  <matéria>.json      um arquivo por matéria (carregado só quando você abre)
  img/<id>-<n>.jpg    apenas as imagens realmente usadas

Uso (Windows, dentro da pasta onde está este script):
  python gerar_pacote.py --saida "C:\\caminho\\saida" --destino "C:\\caminho\\MedTracker\\public\\questoes"

Opções:
  --json CAMINHO   usa outro arquivo de questões (padrão: <saida>/todas_questoes.json)
  --sem-imagens    não copia imagens (só confere o texto, bem mais rápido)

Só usa a biblioteca padrão do Python 3.8+.
"""
import argparse
import json
import re
import shutil
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

VERSAO_PACOTE = 1


def slug(texto: str) -> str:
    base = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-")


def achar_arquivo(raiz: Path, relativo: str):
    """Acha a imagem mesmo se o acento estiver em outra forma Unicode (NFC/NFD)."""
    for forma in ("NFC", "NFD"):
        candidato = raiz / unicodedata.normalize(forma, relativo)
        if candidato.is_file():
            return candidato
    return None


def motivo_exclusao(q: dict):
    """Devolve o motivo se a questão não dá para resolver no app; senão None."""
    alts = q["alternativas"]
    letras = [a["letra"] for a in alts]
    if len(alts) > 5:
        return f"{len(alts)} alternativas (leitura do PDF falhou)"
    if letras != list("ABCDE")[: len(alts)]:
        return f"letras fora de ordem: {letras}"
    if q["gabarito"] not in letras:
        return f"gabarito {q['gabarito']} não está nas alternativas"
    if len(alts) < 4 and [a["texto"].strip(" .").lower() for a in alts] != ["certo", "errado"]:
        return f"só {len(alts)} alternativas e não é Certo/Errado"
    return None


def reduzir(q: dict, materia: str) -> dict:
    """Versão enxuta da questão para uma matéria específica."""
    tpm = q.get("temas_por_materia") or {}
    temas = tpm.get(materia, []) if q["materias_origem"] == "banco" else []
    antes, depois = [], []
    for k, im in enumerate(q["imagens"], start=1):
        nome = f"img/{q['id']}-{k}.jpg"
        (antes if im.get("antes_das_alternativas", True) else depois).append(nome)
    item = {
        "id": q["id"],
        "n": q["numero"],
        "e": q["enunciado"],
        "a": [a["texto"] for a in q["alternativas"]],
        "g": q["gabarito"],
        "c": q["confianca"],
    }
    if temas:
        item["t"] = temas
    if antes:
        item["i"] = antes
    if depois:
        item["ia"] = depois
    provas = [f["nome"] for f in q["fontes"] if f["tipo"] == "prova"]
    if provas:
        item["p"] = provas
    if len(q["materias"]) > 1:
        item["ms"] = q["materias"]
    if q["revisar"]:
        item["rv"] = 1
    return item


def escrever_json(caminho: Path, dados) -> int:
    texto = json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
    caminho.write_text(texto, encoding="utf-8")
    return len(texto.encode("utf-8"))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--saida", required=True, help="pasta 'saida' (onde está por_pdf)")
    ap.add_argument("--destino", required=True, help="pasta de destino, ex.: MedTracker/public/questoes")
    ap.add_argument("--json", help="caminho do todas_questoes.json (padrão: <saida>/todas_questoes.json)")
    ap.add_argument("--sem-imagens", action="store_true")
    args = ap.parse_args()

    saida = Path(args.saida)
    destino = Path(args.destino)
    caminho_json = Path(args.json) if args.json else saida / "todas_questoes.json"
    if not caminho_json.is_file():
        print(f"Não achei {caminho_json}", file=sys.stderr)
        return 1

    dados = json.loads(caminho_json.read_text(encoding="utf-8"))
    questoes = dados["questoes"]
    print(f"Lidas {len(questoes)} questões (versão {dados.get('versao')}).")

    # 1) separa as que não dá para resolver
    boas, excluidas = [], []
    for q in questoes:
        motivo = motivo_exclusao(q)
        if motivo:
            excluidas.append({"id": q["id"], "materia": q["materia"], "motivo": motivo, "enunciado": q["enunciado"][:200]})
        else:
            boas.append(q)

    # 2) agrupa por matéria (questão em 2 matérias entra nas duas)
    por_materia = defaultdict(list)
    for q in boas:
        for m in q["materias"]:
            por_materia[m].append(q)

    destino.mkdir(parents=True, exist_ok=True)
    (destino / "img").mkdir(exist_ok=True)

    # 3) escreve um arquivo por matéria
    indice_materias, tamanhos = [], {}
    for materia in sorted(por_materia):
        itens = [reduzir(q, materia) for q in por_materia[materia]]
        itens.sort(key=lambda x: (x["c"] != "certa", x["id"]))
        arquivo = f"{slug(materia)}.json"
        tamanhos[materia] = escrever_json(destino / arquivo, {"materia": materia, "questoes": itens})
        contagem_temas = Counter(t for it in itens for t in it.get("t", []))
        indice_materias.append({
            "id": slug(materia),
            "nome": materia,
            "arquivo": arquivo,
            "total": len(itens),
            "certas": sum(1 for it in itens if it["c"] == "certa"),
            "temas": [{"nome": t, "total": n} for t, n in sorted(contagem_temas.items())],
        })

    # 4) copia só as imagens usadas
    ausentes, copiadas, bytes_img = [], 0, 0
    if not args.sem_imagens:
        for q in boas:
            for k, im in enumerate(q["imagens"], start=1):
                origem = achar_arquivo(saida, im["arquivo"])
                if origem is None:
                    ausentes.append(im["arquivo"])
                    continue
                alvo = destino / "img" / f"{q['id']}-{k}.jpg"
                shutil.copyfile(origem, alvo)
                copiadas += 1
                bytes_img += alvo.stat().st_size

    escrever_json(destino / "index.json", {
        "versao": VERSAO_PACOTE,
        "gerado_em": datetime.now().isoformat(timespec="seconds"),
        "total": len(boas),
        "materias": indice_materias,
    })

    # 5) relatórios (fora da pasta public, para não irem para o app)
    relatorio = Path(__file__).resolve().parent / "relatorio_pacote.json"
    relatorio.write_text(json.dumps({"excluidas": excluidas, "imagens_ausentes": ausentes}, ensure_ascii=False, indent=1), encoding="utf-8")

    print("\nMatérias:")
    for m in indice_materias:
        print(f"  {m['nome']:<22} {m['total']:>6} questões  {tamanhos[m['nome']] / 1e6:5.2f} MB")
    print(f"\nTexto total: {sum(tamanhos.values()) / 1e6:.1f} MB (sem compressão)")
    if args.sem_imagens:
        print("Imagens: puladas (--sem-imagens)")
    else:
        print(f"Imagens copiadas: {copiadas}  ({bytes_img / 1e6:.1f} MB)")
        if ausentes:
            print(f"ATENÇÃO: {len(ausentes)} imagens não encontradas em {saida}")
            print(f"  exemplo: {ausentes[0]}")
    print(f"Questões separadas por problema de estrutura: {len(excluidas)}")
    print(f"Detalhes em: {relatorio}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
