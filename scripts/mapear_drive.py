#!/usr/bin/env python3
"""
Mapeia arquivos da pasta do Google Drive (vídeos de aulas e PDFs de apostilas)
com as aulas e volumes do currículo do MedTracker (src/data/curriculum.json).

Gera o arquivo `drive_links.json` (e também copia para `public/drive_links.json`)
pronto para ser importado no MedTracker.

Formas de uso:
  python scripts/mapear_drive.py --csv "c:\\Users\\davim\\Downloads\\Links Medcurso com Caminho - Página1.csv"
  python scripts/mapear_drive.py --modelo
"""

import argparse
import csv
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CURRICULUM_PATH = BASE_DIR / "src" / "data" / "curriculum.json"
OUTPUT_PATH = BASE_DIR / "drive_links.json"
PUBLIC_OUTPUT_PATH = BASE_DIR / "public" / "drive_links.json"

SUBJECT_MAP = {
    "cardiologia": "cardiologia",
    "cirurgia": "cirurgia",
    "cirurgia geral": "cirurgia",
    "cirurgia geral e trauma": "cirurgia",
    "dermatologia": "dermatologia",
    "endocrinologia": "endocrinologia",
    "gastroenterologia": "gastrologia",
    "gastrologia": "gastrologia",
    "ginecologia": "ginecologia",
    "hematologia": "hematologia",
    "hepatologia": "hepatologia",
    "infectologia": "infectologia",
    "nefrologia": "nefrologia",
    "neurologia": "neurologia",
    "obstetricia": "obstetricia",
    "oftalmologia": "oftalmologia",
    "ortopedia": "ortopedia",
    "pediatria": "pediatria",
    "pneumologia": "pneumologia",
    "preventiva": "preventiva",
    "medicina preventiva": "preventiva",
    "psiquiatria": "psiquiatria",
    "reumatologia": "reumatologia",
}

def normalize(text: str) -> str:
    """Remove acentos, caracteres especiais e converte para minúsculas."""
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = text.lower()
    text = re.sub(r"miscelan[ie]a", "miscelanea", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())

def extract_drive_id(url_or_id: str) -> str | None:
    """Extrai o ID de um link do Google Drive ou devolve o próprio ID."""
    url_or_id = url_or_id.strip()
    if not url_or_id:
        return None
    m = re.search(r"/file/d/([a-zA-Z0-9_-]+)", url_or_id)
    if m:
        return m.group(1)
    m = re.search(r"[?&]id=([a-zA-Z0-9_-]+)", url_or_id)
    if m:
        return m.group(1)
    if re.match(r"^[a-zA-Z0-9_-]{20,}$", url_or_id):
        return url_or_id
    return None

def extract_vol_num(s: str) -> int | None:
    m = re.search(r"\b(?:vol(?:ume)?|v)\.?\s*(\d+)\b", s.lower())
    if m:
        return int(m.group(1))
    return None

def extract_part_num(s: str) -> int | None:
    s = s.lower().strip()
    m = re.search(r"\((\d+)\)", s)
    if m:
        return int(m.group(1))
    m = re.search(r"\b(?:bloco|parte)\s*0?(\d+)\b", s)
    if m:
        return int(m.group(1))
    m = re.search(r"\b(\d+)\s*$", s)
    if m:
        return int(m.group(1))
    return None

def match_score(title_a: str, title_b: str) -> float:
    words_a = set(w for w in normalize(title_a).split() if len(w) > 1 or w.isdigit())
    words_b = set(w for w in normalize(title_b).split() if len(w) > 1 or w.isdigit())
    if not words_a or not words_b:
        return 0.0
    common = words_a.intersection(words_b)
    return len(common) / max(len(words_a), len(words_b))

def find_best_volume(path_or_name: str, volumes: list, sub_id: str = ""):
    norm_p = normalize(path_or_name)
    if sub_id == "cirurgia":
        if "trauma vol" in norm_p or norm_p.startswith("trauma"):
            v = next((v for v in volumes if v["id"] == "cirurgia-v1"), None)
            if v: return v
        if "urologia" in norm_p or "queimadura" in norm_p:
            v = next((v for v in volumes if v["id"] == "cirurgia-v2"), None)
            if v: return v
        if "pre" in norm_p or "hernia" in norm_p or "anestesi" in norm_p:
            v = next((v for v in volumes if v["id"] == "cirurgia-v3"), None)
            if v: return v
        if "vascular" in norm_p or "bariatr" in norm_p or "proctol" in norm_p:
            v = next((v for v in volumes if v["id"] == "cirurgia-v4"), None)
            if v: return v

    best_v = None
    best_s = -1.0
    p_num = extract_vol_num(path_or_name)

    for v in volumes:
        score = match_score(path_or_name, v["name"])
        v_num = extract_vol_num(v["name"]) or extract_vol_num(v["id"])

        if p_num is not None and v_num is not None:
            if p_num == v_num:
                score += 0.35
            else:
                score -= 0.35

        if score > best_s:
            best_s = score
            best_v = v

    if best_s >= 0.25:
        return best_v
    return None

def load_curriculum():
    if not CURRICULUM_PATH.exists():
        raise FileNotFoundError(f"Não encontrei o currículo em {CURRICULUM_PATH}")
    with open(CURRICULUM_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def generate_template(curriculum):
    template = {
        "_instrucoes": "Preencha 'videoId' com o ID do vídeo no Google Drive e 'pdfId' com o ID do PDF da apostila.",
        "lessons": {},
        "volumes": {}
    }
    for subject in curriculum.get("subjects", []):
        for volume in subject.get("volumes", []):
            template["volumes"][volume["id"]] = {
                "pdfId": "",
                "pdfName": f"{volume['name']}.pdf"
            }
            for lesson in volume.get("lessons", []):
                template["lessons"][lesson["id"]] = {
                    "videoId": "",
                    "videoName": f"{lesson['title']}.mp4"
                }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(template, f, ensure_ascii=False, indent=2)
    print(f"✓ Modelo gerado com sucesso em: {OUTPUT_PATH}")

def process_csv(csv_path: Path, curriculum: dict):
    curriculum_by_subject = {sub["id"]: sub for sub in curriculum["subjects"]}

    matched_lessons = {}
    matched_volumes = {}
    unmatched_files = []

    with open(csv_path, encoding="utf-8", errors="ignore") as f:
        reader = csv.DictReader(f)
        for row in reader:
            nome = (row.get("Nome") or "").strip()
            link = (row.get("Link") or "").strip()
            drive_id = (row.get("ID") or "").strip()
            caminho = (row.get("Caminho") or "").strip()

            if not drive_id:
                drive_id = extract_drive_id(link)

            if not drive_id or "folders" in link or nome.endswith(".lnk"):
                continue

            parts = [p.strip() for p in caminho.split("/") if p.strip()]
            if not parts:
                continue

            materia_norm = normalize(parts[0])
            sub_id = SUBJECT_MAP.get(materia_norm)
            if not sub_id:
                for k, v in SUBJECT_MAP.items():
                    if k in materia_norm or materia_norm in k:
                        sub_id = v
                        break

            if not sub_id or sub_id not in curriculum_by_subject:
                continue

            sub = curriculum_by_subject[sub_id]
            vol_folder_name = parts[1] if len(parts) > 1 else parts[0]
            best_vol = find_best_volume(vol_folder_name, sub["volumes"], sub_id)
            if not best_vol and len(sub["volumes"]) == 1:
                best_vol = sub["volumes"][0]

            # 1. PDFs de Apostila
            if nome.lower().endswith(".pdf"):
                pdf_vol = find_best_volume(nome, sub["volumes"], sub_id) or best_vol
                if pdf_vol:
                    matched_volumes[pdf_vol["id"]] = {
                        "pdfId": drive_id,
                        "pdfName": nome
                    }
                continue

            # 2. Vídeos das aulas
            if nome.lower().endswith((".mp4", ".mkv", ".avi", ".mov")):
                # Ignora arquivos de números de apostila tipo "1.mp4", "2.mp4"
                if re.match(r"^\d+\.mp4$", nome.lower()):
                    continue

                candidates = best_vol["lessons"] if best_vol else [l for v in sub["volumes"] for l in v["lessons"]]
                aula_nome = re.sub(r"\.(mp4|mkv|avi|mov)$", "", nome, flags=re.IGNORECASE)
                aula_norm = normalize(aula_nome)
                aula_part = extract_part_num(aula_nome)
                is_bonus = "/ bônus /" in caminho.lower() or "/ bonus /" in caminho.lower()

                best_lesson = None
                best_score = 0.0

                for l in candidates:
                    l_norm = normalize(l["title"])
                    l_part = extract_part_num(l["title"])
                    kind_match = (is_bonus and l["kind"] == "bonus") or (not is_bonus and l["kind"] == "aula")

                    # Se o título e tipo batem exatamente
                    if aula_norm == l_norm and kind_match and (aula_part is None or aula_part == l_part):
                        if l["id"] not in matched_lessons:
                            best_lesson = l
                            best_score = 1.5
                            break
                        else:
                            has_other_unmatched = any(
                                c["id"] not in matched_lessons and normalize(c["title"]) == aula_norm and ((is_bonus and c["kind"] == "bonus") or (not is_bonus and c["kind"] == "aula"))
                                for c in candidates
                            )
                            if not has_other_unmatched:
                                best_lesson = l
                                best_score = 1.5
                                break

                    score = match_score(aula_nome, l["title"])
                    if kind_match:
                        score += 0.25
                    else:
                        score -= 0.25

                    if aula_part is not None and l_part is not None:
                        if aula_part == l_part:
                            score += 0.4
                        else:
                            score -= 0.4

                    if l["id"] in matched_lessons:
                        score -= 0.25

                    if score > best_score:
                        best_score = score
                        best_lesson = l
                    elif score == best_score and best_lesson and best_lesson["id"] in matched_lessons and l["id"] not in matched_lessons:
                        best_score = score
                        best_lesson = l

                if best_lesson and best_score >= 0.35:
                    matched_lessons[best_lesson["id"]] = {
                        "videoId": drive_id,
                        "videoName": nome
                    }
                else:
                    unmatched_files.append((caminho, f"Score: {best_score:.2f}"))

    output_data = {
        "lessons": matched_lessons,
        "volumes": matched_volumes,
    }

    # Salva no arquivo raiz drive_links.json
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    # Copia também para public/drive_links.json para o app poder carregar diretamente
    PUBLIC_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(PUBLIC_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    total_lessons = sum(len(v["lessons"]) for s in curriculum["subjects"] for v in s["volumes"])
    total_volumes = sum(len(s["volumes"]) for s in curriculum["subjects"])

    print(f"==================================================")
    print(f"✓ Mapeamento Google Drive MedTracker concluído!")
    print(f"==================================================")
    print(f"• Volumes (Apostilas): {len(matched_volumes)} / {total_volumes} vinculados ({len(matched_volumes)/total_volumes*100:.1f}%)")
    print(f"• Aulas (Vídeos):     {len(matched_lessons)} / {total_lessons} vinculadas ({len(matched_lessons)/total_lessons*100:.1f}%)")
    print(f"• Arquivos sem par:   {len(unmatched_files)}")
    print(f"• Arquivo gerado em:  {OUTPUT_PATH}")
    print(f"• Cópia pública em:   {PUBLIC_OUTPUT_PATH}")
    print(f"==================================================")

def main():
    parser = argparse.ArgumentParser(description="Mapeador de arquivos do Google Drive para MedTracker")
    parser.add_argument("--csv", type=str, help="Caminho do CSV de links exportado do Google Drive")
    parser.add_argument("--modelo", action="store_true", help="Gera arquivo modelo vazio")
    args = parser.parse_args()

    curriculum = load_curriculum()

    if args.modelo:
        generate_template(curriculum)
        return

    csv_path = None
    if args.csv:
        csv_path = Path(args.csv)
    else:
        # Tenta achar o arquivo no Downloads padrão ou no diretório corrente
        downloads_candidate = Path(r"c:\Users\davim\Downloads\Links Medcurso com Caminho - Página1.csv")
        local_candidate = BASE_DIR / "Links Medcurso com Caminho - Página1.csv"
        if downloads_candidate.exists():
            csv_path = downloads_candidate
        elif local_candidate.exists():
            csv_path = local_candidate

    if not csv_path or not csv_path.exists():
        print("Erro: Nenhum arquivo CSV encontrado. Especifique com --csv caminho/para/arquivo.csv")
        sys.exit(1)

    print(f"Processando arquivo: {csv_path}")
    process_csv(csv_path, curriculum)

if __name__ == "__main__":
    main()
