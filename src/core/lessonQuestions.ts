import type { BankIndex, BankQuestion, BankSubjectMeta } from '../types/questionBank';
import { loadBankIndex, loadBankSubject } from './questionBank';
import { pickSession, type AttemptSummary } from './questionSession';

/**
 * Liga uma aula do currículo às questões do banco ("Resolver questões deste assunto").
 *
 * Como a aula é encontrada no banco:
 *   1. Matéria: o id/nome da matéria da aula é comparado com as matérias do banco.
 *   2. Tema: o título da aula é comparado com os temas da matéria (ignora acento,
 *      maiúscula e pequenas diferenças de escrita, como "Taquiarritimias" x "Taquiarritmias").
 *   3. Texto: se o tema trouxer poucas questões (ou não existir), procura as palavras
 *      do título no enunciado e nas alternativas, dando mais peso às palavras raras.
 *
 * Tudo aqui é lógica pura (sem React e sem banco de dados), exceto `loadLessonQuestions`.
 */

// ─── Ajustes manuais ────────────────────────────────────────────────────────

/**
 * Quando o casamento automático errar para uma aula específica, escreva aqui o(s)
 * tema(s) exatamente como aparecem no banco. Exemplo:
 *   'cardiologia-v1-a01': ['Taquiarritmias'],
 */
export const LESSON_TOPIC_OVERRIDES: Record<string, string[]> = {};

/** Outros nomes que a matéria pode ter no banco (id da matéria do currículo → nomes). */
const SUBJECT_ALIASES: Record<string, string[]> = {
  gastrologia: ['gastroenterologia', 'gastro'],
  preventiva: ['medicina preventiva', 'saude coletiva'],
};

// ─── Texto: normalização e radicais ─────────────────────────────────────────

/** Minúsculas, sem acento, só letras e números separados por espaço. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Palavras que não ajudam a identificar o assunto de uma aula. */
const STOPWORDS = new Set([
  // gramática
  'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'para', 'com', 'por', 'sem',
  'ao', 'aos', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'que', 'ou', 'como', 'sobre', 'entre',
  // palavras genéricas de título de aula
  'aula', 'bloco', 'parte', 'abordagem', 'principal', 'principais', 'conceito', 'conceitos',
  'inicial', 'iniciais', 'nocoes', 'gerais', 'geral', 'basico', 'basicos', 'basica',
  'basicas', 'introducao', 'revisao', 'resumo', 'atualizacoes', 'causas', 'clinica', 'clinico',
  'diagnostico', 'tratamento', 'bonus',
]);

const STEM_LEN = 7;

/**
 * Radical de uma palavra: tira o "s" do plural e guarda só os 7 primeiros caracteres.
 * Assim "taquiarritimias" e "taquiarritmias" viram "taquiar", e "pancreatite" e
 * "pancreatie" viram "pancrea".
 */
export function stemOf(word: string): string {
  const w = word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word;
  return w.slice(0, STEM_LEN);
}

/** Radicais "importantes" do título de uma aula ou do nome de um tema. */
export function titleStems(text: string): string[] {
  const out = new Set<string>();
  for (const w of normalizeText(text).split(' ')) {
    if (w.length < 4 || /^\d+$/.test(w) || STOPWORDS.has(w)) continue;
    out.add(stemOf(w));
  }
  // Siglas em maiúsculas com 3 letras (IAM, ECG, PCR), que o filtro acima descartaria
  for (const raw of text.split(/[^A-Za-zÀ-ÿ]+/)) {
    if (raw.length === 3 && raw === raw.toUpperCase()) out.add(normalizeText(raw));
  }
  return [...out];
}

function questionStems(q: BankQuestion): Set<string> {
  const out = new Set<string>();
  const text = normalizeText(`${q.e} ${q.a.join(' ')}`);
  for (const w of text.split(' ')) {
    if (w.length < 3 || /^\d+$/.test(w)) continue;
    out.add(stemOf(w));
  }
  return out;
}

// ─── Matéria ────────────────────────────────────────────────────────────────

/** Acha, entre as matérias do banco, a que corresponde à matéria da aula. */
export function findBankSubject(
  index: BankIndex,
  subjectId: string,
  subjectName: string
): BankSubjectMeta | null {
  const wanted = new Set(
    [subjectId, subjectName, ...(SUBJECT_ALIASES[subjectId] ?? [])]
      .map(normalizeText)
      .filter(Boolean)
  );

  // 1. Igualdade exata (id ou nome)
  for (const m of index.materias) {
    if (wanted.has(normalizeText(m.id)) || wanted.has(normalizeText(m.nome))) return m;
  }

  // 2. Um nome contém o outro (ex.: "Cirurgia Geral" e "Cirurgia")
  for (const m of index.materias) {
    const names = [normalizeText(m.id), normalizeText(m.nome)];
    for (const w of wanted) {
      for (const n of names) {
        if (n.length >= 5 && w.length >= 5 && (n.includes(w) || w.includes(n))) return m;
      }
    }
  }
  return null;
}

// ─── Tema ───────────────────────────────────────────────────────────────────

/** Temas do banco que correspondem ao título da aula (os de melhor correspondência). */
export function matchTemas(title: string, temas: { nome: string }[]): string[] {
  const wanted = new Set(titleStems(title));
  if (wanted.size === 0) return [];

  let best = { shared: 0, coverage: 0 };
  const scored: { nome: string; shared: number; coverage: number }[] = [];

  for (const t of temas) {
    const stems = titleStems(t.nome);
    if (stems.length === 0) continue;
    const shared = stems.filter((s) => wanted.has(s)).length;
    if (shared === 0) continue;
    const coverage = shared / stems.length;
    if (coverage < 0.5) continue; // pelo menos metade das palavras do tema aparece no título
    scored.push({ nome: t.nome, shared, coverage });
    if (shared > best.shared || (shared === best.shared && coverage > best.coverage)) {
      best = { shared, coverage };
    }
  }

  return scored
    .filter((s) => s.shared === best.shared && s.coverage === best.coverage)
    .map((s) => s.nome);
}

// ─── Busca no texto das questões ────────────────────────────────────────────

/** Palavra que aparece em mais questões do que isso (da matéria) é genérica demais. */
const GENERIC_DF_RATIO = 0.35;
/** Fração mínima do "peso" das palavras do título que a questão precisa conter. */
const TEXT_MIN_SCORE = 0.4;
const TEXT_MAX_QUESTIONS = 80;
/** Se o tema tiver menos questões que isso, completa com a busca no texto. */
export const MIN_TOPIC_QUESTIONS = 10;

interface StemIndex {
  sets: Set<string>[];
  df: Map<string, number>;
}

const indexCache = new WeakMap<BankQuestion[], StemIndex>();

function getStemIndex(questions: BankQuestion[]): StemIndex {
  let idx = indexCache.get(questions);
  if (!idx) {
    const sets = questions.map(questionStems);
    const df = new Map<string, number>();
    for (const set of sets) {
      for (const s of set) df.set(s, (df.get(s) ?? 0) + 1);
    }
    idx = { sets, df };
    indexCache.set(questions, idx);
  }
  return idx;
}

/** Questões cujo texto fala do título da aula, das mais para as menos parecidas. */
export function searchByText(title: string, questions: BankQuestion[]): BankQuestion[] {
  const n = questions.length;
  if (n === 0) return [];

  const { sets, df } = getStemIndex(questions);
  const usable = titleStems(title).filter((s) => {
    const d = df.get(s) ?? 0;
    return d > 0 && d / n <= GENERIC_DF_RATIO;
  });
  if (usable.length === 0) return [];

  const weight = new Map(usable.map((s) => [s, Math.log((n + 1) / ((df.get(s) ?? 0) + 1))]));
  let total = 0;
  for (const w of weight.values()) total += w;
  if (total <= 0) return [];

  const scored: { q: BankQuestion; score: number }[] = [];
  questions.forEach((q, i) => {
    let sum = 0;
    for (const s of usable) if (sets[i].has(s)) sum += weight.get(s) ?? 0;
    const score = sum / total;
    if (score >= TEXT_MIN_SCORE) scored.push({ q, score });
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, TEXT_MAX_QUESTIONS).map((s) => s.q);
}

// ─── Resultado final ────────────────────────────────────────────────────────

export interface LessonMatch {
  questions: BankQuestion[];
  /** 'tema': achou tema no banco · 'texto': só pela busca no texto · 'nenhum': nada */
  via: 'tema' | 'texto' | 'nenhum';
  /** Temas do banco usados (vazio quando via = 'texto' ou 'nenhum'). */
  temas: string[];
  /** Quantas questões vieram da busca no texto para completar o tema. */
  fromText: number;
}

export function findLessonQuestions(
  title: string,
  temas: { nome: string }[],
  questions: BankQuestion[],
  overrideTemas?: string[]
): LessonMatch {
  const temaNames = overrideTemas && overrideTemas.length > 0 ? overrideTemas : matchTemas(title, temas);

  let pool: BankQuestion[] = [];
  if (temaNames.length > 0) {
    const wanted = new Set(temaNames);
    pool = questions.filter((q) => q.t?.some((t) => wanted.has(t)));
  }
  const fromTema = pool.length;

  if (pool.length < MIN_TOPIC_QUESTIONS) {
    const seen = new Set(pool.map((q) => q.id));
    pool = [...pool, ...searchByText(title, questions).filter((q) => !seen.has(q.id))];
  }

  const via: LessonMatch['via'] = fromTema > 0 ? 'tema' : pool.length > 0 ? 'texto' : 'nenhum';
  return {
    questions: pool,
    via,
    temas: fromTema > 0 ? temaNames : [],
    fromText: pool.length - fromTema,
  };
}

// ─── Montagem da sessão ─────────────────────────────────────────────────────

/**
 * Escolhe até `size` questões: primeiro as nunca respondidas, depois as que errou
 * por último, depois as que já acertou. Ignora as de `excludeIds` (já feitas agora)
 * e, havendo outras, as de matéria duvidosa ("dupla").
 */
export function buildLessonSession(
  pool: BankQuestion[],
  summaries: Map<string, AttemptSummary>,
  size: number,
  excludeIds: Set<string> = new Set(),
  rng: () => number = Math.random
): BankQuestion[] {
  let candidates = pool.filter((q) => !excludeIds.has(q.id));
  const sure = candidates.filter((q) => q.c !== 'dupla');
  if (sure.length > 0) candidates = sure;

  const novas: BankQuestion[] = [];
  const erradas: BankQuestion[] = [];
  const outras: BankQuestion[] = [];
  for (const q of candidates) {
    const s = summaries.get(q.id);
    if (!s) novas.push(q);
    else if (!s.lastCorrect) erradas.push(q);
    else outras.push(q);
  }

  const result = pickSession(novas, size, rng);
  for (const group of [erradas, outras]) {
    if (result.length >= size) break;
    result.push(...pickSession(group, size - result.length, rng));
  }
  return result;
}

// ─── Carregamento ───────────────────────────────────────────────────────────

export type LessonQuestionsResult =
  | {
      status: 'ok';
      subject: BankSubjectMeta;
      match: LessonMatch;
      /** Todas as questões da matéria (para o "resolver da matéria toda"). */
      all: BankQuestion[];
    }
  | { status: 'sem-materia' };

/** Baixa (ou lê do cache) o banco e procura as questões da aula. */
export async function loadLessonQuestions(lesson: {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string;
}): Promise<LessonQuestionsResult> {
  const index = await loadBankIndex();
  const subject = findBankSubject(index, lesson.subjectId, lesson.subjectName);
  if (!subject) return { status: 'sem-materia' };

  const all = await loadBankSubject(subject.arquivo);
  const match = findLessonQuestions(
    lesson.title,
    subject.temas,
    all,
    LESSON_TOPIC_OVERRIDES[lesson.id]
  );
  return { status: 'ok', subject, match, all };
}
