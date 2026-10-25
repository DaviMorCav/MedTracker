#!/usr/bin/env python3
"""Atribui MATÉRIAS (uma ou duas) e sugere TEMA a cada questão de saida\\todas_questoes.json.   (versão 3)

Cada questão passa a ter a lista  materias  (pode ter mais de uma, como etiquetas):
  - Banco por MATÉRIA: as matérias das pastas onde ela aparece (certa).
  - Compilado "por área" de uma matéria só (pediatria, ginecologia...): a matéria do arquivo.
  - O resto: previsão. Quando o programa está em dúvida entre duas matérias, a questão recebe AS DUAS.
Confiança:  certa | alta (1 matéria, acerta ~95%) | dupla (2 matérias) | baixa (sem matéria; fica em materias_sugeridas)
O programa se TESTA antes em questões do Banco que não viu e mostra o acerto real de cada faixa.

Uso (dentro da pasta saida, depois de reconstruir_todas.py):  py -X utf8 classificar_materias.py .
Guarda cópia: todas_questoes.antes_da_classificacao.json"""
import sys, json, re, math, random, shutil, unicodedata, collections
from pathlib import Path

raiz = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
random.seed(7)
STOP = set("""de da do das dos a o as os e em um uma uns umas para por com sem sobre entre que qual quais quem como mais menos nao
nem ou se ao aos na no nas nos pelo pela pelos pelas seu sua seus suas ser foi sao era esta estao tem ter teve ha anos ano paciente
pacientes assinale alternativa correta incorreta afirmativa assertiva abaixo seguir seguinte seguintes apresenta apresentou refere queixa
historia exame fisico mg dl kg cm mm mais ainda apos antes durante cerca ate sendo sido ele ela eles elas isso essa esse este esta
conduta diagnostico provavel melhor principal proximo correto incorreto opcao questao figura imagem""".split())

def sem_acento(s): return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
def tokens(q):
    txt = sem_acento((q["enunciado"] + " " + " ".join(a["texto"] for a in q["alternativas"])).lower())
    u = [w for w in re.findall(r"[a-z][a-z0-9\-]{2,}", txt) if w not in STOP]
    return u + [u[i] + "_" + u[i + 1] for i in range(len(u) - 1)]
def lse(xs):
    m = max(xs); return m + math.log(sum(math.exp(x - m) for x in xs))
def bancos(q):
    vistos, out = set(), []
    for f in q.get("fontes", []):
        if f["tipo"] == "banco" and f.get("materia") and (f["materia"], f["nome"]) not in vistos:
            vistos.add((f["materia"], f["nome"])); out.append((f["materia"], f["nome"]))
    return out

class NB:
    """Naive Bayes com índice invertido. 'grupo' mapeia classe -> matéria."""
    def __init__(self, dados, grupo, prior=False, alpha=0.1):
        df = collections.Counter(); n = collections.Counter(); cnt = collections.defaultdict(collections.Counter)
        for toks, c in dados: n[c] += 1; cnt[c].update(toks); df.update(set(toks))
        self.vocab = {f for f, v in df.items() if v >= 3}; V = len(self.vocab) or 1
        self.classes = sorted(n); self.grupo = grupo; self.oov = {}; self.base = {}; self.idx = collections.defaultdict(list)
        tot_n = sum(n.values())
        for c in self.classes:
            tot = sum(v for f, v in cnt[c].items() if f in self.vocab); den = tot + alpha * V
            self.oov[c] = math.log(alpha / den); self.base[c] = math.log(n[c] / tot_n) if prior else 0.0
            for f, v in cnt[c].items():
                if f in self.vocab: self.idx[f].append((c, math.log((v + alpha) / den) - self.oov[c]))
    def por_materia(self, toks, cands=None):
        """devolve (matérias em ordem, margem d entre 1ª e 2ª, melhor tema de cada matéria)"""
        fs = [f for f in toks if f in self.vocab]
        if not fs: return [], 0.0, {}
        sc = {c: self.base[c] + len(fs) * self.oov[c] for c in self.classes}
        for f in fs:
            for c, delta in self.idx[f]: sc[c] += delta
        g = collections.defaultdict(list)
        for c, v in sc.items():
            m = self.grupo[c]
            if cands is None or m in cands: g[m].append((v, c))
        if not g: return [], 0.0, {}
        ms = sorted(((lse([v for v, _ in lst]), m) for m, lst in g.items()), reverse=True)
        d = (ms[0][0] - ms[1][0]) / len(fs) if len(ms) > 1 else 9.0
        return [m for _, m in ms[:3]], d, {m: max(lst)[1].split("||", 1)[-1] for m, lst in g.items()}

def limiar(pares, alvo, minimo=40):
    pares = sorted(pares, key=lambda x: -x[0]); ok = 0; melhor = float("inf")
    for i, (d, a) in enumerate(pares, 1):
        ok += a
        if i >= minimo and ok / i >= alvo: melhor = d
    return melhor

src = raiz / "todas_questoes.json"
dados = json.loads(src.read_text(encoding="utf8")); qs = dados["questoes"]
rot = [q for q in qs if bancos(q)]
if len(rot) < 200: sys.exit(f"Poucas questões com matéria do Banco ({len(rot)}). Rode antes: py -X utf8 reconstruir_todas.py .  (a versão nova, que guarda a matéria nas fontes)")
multi_banco = sum(1 for q in rot if len({m for m, _ in bancos(q)}) > 1)
print(f"{len(qs)} questões | {len(rot)} com matéria do Banco ({multi_banco} em mais de uma matéria) | {len(qs) - len(rot)} para classificar", flush=True)
T = {id(q): tokens(q) for q in qs}

def montar(lista):
    ex = [(T[id(q)], m, t) for q in lista for m, t in bancos(q)]
    direto = NB([(tk, m) for tk, m, _ in ex], {m: m for _, m, _ in ex})
    ct = collections.Counter((m, t) for _, m, t in ex); ok = {k for k, v in ct.items() if v >= 8}
    tema = NB([(tk, f"{m}||{t}") for tk, m, t in ex if (m, t) in ok], {f"{m}||{t}": m for m, t in ok}, prior=True) if ok else None
    return direto, tema

random.shuffle(rot); k = min(3000, len(rot) // 10)
teste, treino = rot[:k], rot[k:]
print("Treinando para o teste (pode levar alguns minutos)...", flush=True)
m_dir, m_tema = montar(treino)
res = {}
for nome, mod in (("direto", m_dir), ("via_tema", m_tema)):
    if mod is None: continue
    pares, pares2, por_mat, conf = [], [], collections.defaultdict(lambda: [0, 0]), collections.Counter()
    for q in teste:
        S = {m for m, _ in bancos(q)}; tops, d, _ = mod.por_materia(T[id(q)])
        if not tops: continue
        a1 = int(tops[0] in S); a2 = int(bool(S & set(tops[:2])))
        pares.append((d, a1)); pares2.append((d, a2))
        for m in S: por_mat[m][0] += int(tops[0] == m); por_mat[m][1] += 1
        if not a1: conf[(sorted(S)[0], tops[0])] += 1
    res[nome] = dict(pares=pares, pares2=pares2, por_mat=por_mat, conf=conf, acc=sum(a for _, a in pares) / max(len(pares), 1))
    print(f"  método {nome}: acerto da 1ª matéria {res[nome]['acc']:.1%}", flush=True)
esc = max(res, key=lambda n: res[n]["acc"]); R = res[esc]
pares, pares2 = R["pares"], R["pares2"]
T95 = limiar(pares, 0.95); Tlow = min(limiar(pares2, 0.90), T95)
def faixa(lst, lo, hi):
    s = [a for d, a in lst if lo <= d < hi]; return (sum(s) / len(s) if s else 0, len(s) / len(lst))
fa, fd, fb = faixa(pares, T95, 1e9), faixa(pares2, Tlow, T95), faixa(pares2, -1e9, Tlow)
tot_dupla = faixa(pares2, Tlow, T95)[1]
rel = [f"TESTE em {len(pares)} questões do Banco que o programa não viu",
       "  " + " | ".join(f"{n}: {res[n]['acc']:.1%}" for n in res) + f"   -> usado: {esc}", "",
       "Acerto de CADA faixa (não acumulado):",
       f"  ALTA  (1 matéria)  : a matéria está certa em {fa[0]:.1%}   ({fa[1]:.0%} das questões)",
       f"  DUPLA (2 matérias) : a matéria certa está entre as duas em {fd[0]:.1%}   ({fd[1]:.0%} das questões)",
       f"  BAIXA (sem matéria): a certa estaria entre as duas sugeridas em {fb[0]:.1%}   ({fb[1]:.0%} das questões)  <- revisar"]
rel += ["", "Acerto da 1ª matéria por matéria (no teste):"] + [f"  {a[0] / a[1]:6.1%}  {m}  ({a[1]} testes)" for m, a in sorted(R["por_mat"].items(), key=lambda x: x[1][0] / x[1][1])]
rel += ["", "Trocas mais comuns (verdadeira -> prevista):"] + [f"  {n:4d}  {a} -> {b}" for (a, b), n in R["conf"].most_common(10)]
print("\n".join(rel), flush=True)

print("\nTreinando com todo o Banco e classificando...", flush=True)
m_dir, m_tema = montar(rot); final = m_dir if esc == "direto" else m_tema
cl = {m for q in rot for m, _ in bancos(q)}
CLINICAS = {m for m in cl if m not in ("Pediatria", "Ginecologia", "Obstetricia", "Cirurgia", "Medicina Preventiva", "Ortopedia", "Oftalmologia", "Otorrinologia", "Psiquiatria")}
def dica(q):
    for f in q.get("fontes", []):
        if f["tipo"] != "area": continue
        n = sem_acento(f["nome"].lower())
        for chave, mat in (("pediatria", "Pediatria"), ("ginecologia", "Ginecologia"), ("obstetricia", "Obstetricia"), ("preventiva", "Medicina Preventiva")):
            if n.startswith(chave) and mat in cl: return mat, None
        if n.startswith("cirurgia") and "Cirurgia" in cl: return "Cirurgia", None
        if n.startswith("clinicamedica"): return None, CLINICAS
        if n.startswith("psiquiatria-otorrino"): return None, {m for m in ("Psiquiatria", "Otorrinologia", "Ortopedia", "Oftalmologia") if m in cl}
    return None, None
def temas_de(q, mats):
    if m_tema is None or not mats: return {}
    return m_tema.por_materia(T[id(q)], set(mats))[2]
cont = collections.Counter(); n_mats = collections.Counter()
for i, q in enumerate(qs, 1):
    if i % 5000 == 0: print(f"  {i}/{len(qs)}", flush=True)
    b = bancos(q)
    if b:
        q["materias"] = list(dict.fromkeys(m for m, _ in b)); q["materias_origem"], q["confianca"] = "banco", "certa"
        q["temas_por_materia"] = {m: [t for mm, t in b if mm == m] for m in q["materias"]}; cont["banco"] += 1
    else:
        mat, cands = dica(q)
        if mat:
            q["materias"], q["materias_origem"], q["confianca"] = [mat], "arquivo", "alta"; q["temas_sugeridos"] = temas_de(q, [mat]); cont["arquivo"] += 1
        else:
            tops, d, _ = final.por_materia(T[id(q)], cands); q["materias_origem"] = "previsto"
            if tops and d >= T95: q["materias"], q["confianca"] = tops[:1], "alta"
            elif len(tops) > 1 and d >= Tlow: q["materias"], q["confianca"] = tops[:2], "dupla"
            else: q["materias"], q["confianca"] = [], "baixa"; q["materias_sugeridas"] = tops[:2]
            q["temas_sugeridos"] = temas_de(q, q["materias"] or tops[:2]); cont["previsto_" + q["confianca"]] += 1
    q["materia"] = q["materias"][0] if q["materias"] else None          # 1ª matéria, para compatibilidade
    n_mats[len(q["materias"])] += 1
shutil.copy(src, raiz / "todas_questoes.antes_da_classificacao.json")
src.write_text(json.dumps(dados, ensure_ascii=False), encoding="utf8")
fim = ["", "RESULTADO NO ARQUIVO TODO:"] + [f"  {n:6d}  {k_}" for k_, n in sorted(cont.items())]
fim += ["", "Quantas matérias cada questão tem:"] + [f"  {n:6d}  questões com {k_} matéria(s)" for k_, n in sorted(n_mats.items())]
tot = collections.Counter(m for q in qs for m in q["materias"])
fim += ["", "Questões em cada matéria (uma questão pode contar em duas):"] + [f"  {n:6d}  {m}" for m, n in tot.most_common()]
(raiz / "classificacao_relatorio.txt").write_text("\n".join(rel + fim), encoding="utf8")
sug = [q for q in qs if q["materias_origem"] == "previsto"]
corte = lambda q: dict(origem=q["origem_pdf"], materias=q["materias"], sugeridas=q.get("materias_sugeridas"), confianca=q["confianca"], temas=q.get("temas_sugeridos"), enunciado=q["enunciado"][:220])
bx = [q for q in sug if q["confianca"] == "baixa"]; du = [q for q in sug if q["confianca"] == "dupla"]; al = [q for q in sug if q["confianca"] == "alta"]
am = random.sample(bx, min(25, len(bx))) + random.sample(du, min(30, len(du))) + random.sample(al, min(25, len(al)))
(raiz / "amostra_classificacao.json").write_text(json.dumps([corte(q) for q in am], ensure_ascii=False, indent=1), encoding="utf8")
print("\n".join(fim)); print("\nGerado: classificacao_relatorio.txt e amostra_classificacao.json")
