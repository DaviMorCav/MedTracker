import type { BankQuestion } from '../types/questionBank';
import type { QuestionAttempt } from '../db/schema';

/**
 * Lógica pura da tela Questões > Resolver: filtros, sessões e estatísticas.
 * Não depende de React nem do banco de dados, para ser fácil de testar.
 */

export type ConfidenceFilter = 'certas' | 'certas_altas' | 'todas';
export type PoolMode = 'novas' | 'erradas' | 'todas';

export interface PoolFilters {
  tema: string | null; // null = todos os temas
  confidence: ConfidenceFilter;
  mode: PoolMode;
}

export interface AttemptSummary {
  total: number;
  lastCorrect: boolean;
  lastAt: number;
}

type AttemptLike = Pick<QuestionAttempt, 'questionId' | 'correct' | 'answeredAt'>;

/** Resume as respostas por questão: quantas vezes e se a última foi acerto. */
export function summarizeAttempts(attempts: AttemptLike[]): Map<string, AttemptSummary> {
  const map = new Map<string, AttemptSummary>();
  for (const a of attempts) {
    const prev = map.get(a.questionId);
    if (!prev) {
      map.set(a.questionId, { total: 1, lastCorrect: a.correct, lastAt: a.answeredAt });
    } else {
      prev.total += 1;
      if (a.answeredAt >= prev.lastAt) {
        prev.lastAt = a.answeredAt;
        prev.lastCorrect = a.correct;
      }
    }
  }
  return map;
}

function matchesBase(q: BankQuestion, tema: string | null, confidence: ConfidenceFilter): boolean {
  if (tema !== null && !(q.t && q.t.includes(tema))) return false;
  if (confidence === 'certas') return q.c === 'certa';
  if (confidence === 'certas_altas') return q.c !== 'dupla';
  return true;
}

/** Questões que atendem aos filtros (incluindo o modo novas/erradas/todas). */
export function filterPool(
  questions: BankQuestion[],
  filters: PoolFilters,
  summaries: Map<string, AttemptSummary>
): BankQuestion[] {
  return questions.filter((q) => {
    if (!matchesBase(q, filters.tema, filters.confidence)) return false;
    const s = summaries.get(q.id);
    if (filters.mode === 'novas') return !s;
    if (filters.mode === 'erradas') return !!s && !s.lastCorrect;
    return true;
  });
}

/** Quantas questões existem em cada modo, com tema e classificação já aplicados. */
export function poolCounts(
  questions: BankQuestion[],
  tema: string | null,
  confidence: ConfidenceFilter,
  summaries: Map<string, AttemptSummary>
): { todas: number; novas: number; erradas: number } {
  let todas = 0;
  let novas = 0;
  let erradas = 0;
  for (const q of questions) {
    if (!matchesBase(q, tema, confidence)) continue;
    todas += 1;
    const s = summaries.get(q.id);
    if (!s) novas += 1;
    else if (!s.lastCorrect) erradas += 1;
  }
  return { todas, novas, erradas };
}

/** Sorteia até `size` questões, sem repetir (Fisher-Yates parcial). */
export function pickSession<T>(pool: T[], size: number, rng: () => number = Math.random): T[] {
  const arr = pool.slice();
  const n = Math.min(Math.max(size, 0), arr.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

export function letterOf(index: number): string {
  return String.fromCharCode(65 + index);
}

export interface SubjectStats {
  total: number;
  correct: number;
  percentage: number;
}

/** Desempenho por matéria (id) a partir das tentativas. */
export function statsBySubject(
  attempts: Pick<QuestionAttempt, 'materia' | 'correct'>[]
): Map<string, SubjectStats> {
  const map = new Map<string, SubjectStats>();
  for (const a of attempts) {
    const s = map.get(a.materia) ?? { total: 0, correct: 0, percentage: 0 };
    s.total += 1;
    if (a.correct) s.correct += 1;
    s.percentage = Math.round((s.correct / s.total) * 100);
    map.set(a.materia, s);
  }
  return map;
}
