import { addDays } from './dates';
import type { LessonReview, ReviewRating } from '../db/schema';

/**
 * Escada fixa em dias conforme PRD seção 7:
 * Passo 0: 1 dia
 * Passo 1: 7 dias
 * Passo 2: 15 dias
 * Passo 3: 30 dias
 * Passo 4: 60 dias
 */
export const LADDER = [1, 7, 15, 30, 60] as const;

export const MAX_STEP = LADDER.length - 1;

/** Facilidade inicial. Com ela, o intervalo é exatamente o da escada do PRD. */
export const EASE_START = 2.5;
export const EASE_MIN = 1.3;
export const EASE_MAX = 3.0;

/** Quantidade de erros que marca a revisão como "ponto fraco" (leech). */
export const LEECH_AT = 4;

/** Quanto a facilidade muda a cada avaliação. */
const EASE_DELTA: Record<ReviewRating, number> = {
  errei: -0.2,
  dificil: -0.15,
  bom: 0,
  facil: 0.15,
};

export interface EvaluateReviewOptions {
  /** Pequena variação de ±5% na data. Padrão: ligada. */
  fuzz?: boolean;
}

export interface ReviewPreview {
  rating: ReviewRating;
  nextStep: number;
  intervalDays: number;
  dueDate: string;
  /** Facilidade que fica gravada para a próxima revisão. */
  easeAfter: number;
}

export const REVIEW_RATINGS: ReviewRating[] = ['errei', 'dificil', 'bom', 'facil'];

/** Garante um passo válido (inteiro entre 0 e 4), mesmo em dados importados antigos. */
export function clampStep(step: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.min(MAX_STEP, Math.max(0, Math.trunc(step)));
}

/** Facilidade efetiva da revisão: dados antigos (sem o campo) começam em 2.5. */
export function reviewEase(review: LessonReview): number {
  const ease = review.ease;
  if (ease === undefined || !Number.isFinite(ease)) return EASE_START;
  return Math.min(EASE_MAX, Math.max(EASE_MIN, ease));
}

/**
 * Erros acumulados. Em dados antigos o campo não existe, então deriva do histórico.
 * Só "errei" conta como erro; "difícil" é uma lembrança difícil, não uma falha.
 */
export function reviewLapses(review: LessonReview): number {
  const lapses = review.lapses;
  if (lapses !== undefined && Number.isFinite(lapses) && lapses >= 0) {
    return Math.floor(lapses);
  }
  return (review.history || []).filter((h) => h.rating === 'errei').length;
}

/** Revisão marcada como ponto fraco (4 erros ou campo já gravado). */
export function isLeeched(review: LessonReview): boolean {
  return review.leeched === true || reviewLapses(review) >= LEECH_AT;
}

/** Hash FNV-1a de 32 bits: deixa a variação de data determinística e reproduzível. */
function hash32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Multiplicador entre 0.95 e 1.05, estável para a mesma aula/nota/passo/dia. */
function fuzzFactor(key: string): number {
  const bucket = hash32(key) % 11; // 0..10
  return 1 + (bucket - 5) / 100;
}

/**
 * Calcula o resultado de uma nota, sem gravar nada.
 * O intervalo usa a facilidade ATUAL (como no SM-2); a nova facilidade vale para a
 * próxima revisão. Por isso, com ease 2.5, a escada do PRD é reproduzida exatamente.
 */
function scheduleFor(
  review: LessonReview,
  rating: ReviewRating,
  today: string,
  options: EvaluateReviewOptions
): ReviewPreview {
  const step = clampStep(review.step);
  const ease = reviewEase(review);

  let nextStep = step;
  let baseDays: number;

  switch (rating) {
    case 'errei':
      nextStep = 0;
      baseDays = 1;
      break;
    case 'dificil':
      nextStep = step;
      baseDays = Math.max(1, Math.floor(LADDER[step] / 2));
      break;
    case 'bom':
      nextStep = Math.min(step + 1, MAX_STEP);
      baseDays = LADDER[nextStep];
      break;
    case 'facil':
      nextStep = Math.min(step + 2, MAX_STEP);
      baseDays = LADDER[nextStep];
      break;
  }

  const easeAfter = Math.min(EASE_MAX, Math.max(EASE_MIN, ease + EASE_DELTA[rating]));
  let intervalDays = Math.max(1, Math.round((baseDays * ease) / EASE_START));

  if (options.fuzz !== false) {
    const key = `${review.lessonId}|${nextStep}|${rating}|${today}`;
    intervalDays = Math.max(1, Math.round(intervalDays * fuzzFactor(key)));
  }

  return {
    rating,
    nextStep,
    intervalDays,
    dueDate: addDays(today, intervalDays),
    easeAfter,
  };
}

/**
 * Prévia das 4 notas, usada pelo modal. É a mesma conta de `evaluateReview`, então a
 * data mostrada é exatamente a data que será salva.
 */
export function previewReview(
  review: LessonReview,
  today: string,
  options: EvaluateReviewOptions = {}
): Record<ReviewRating, ReviewPreview> {
  const previews = {} as Record<ReviewRating, ReviewPreview>;
  for (const rating of REVIEW_RATINGS) {
    previews[rating] = scheduleFor(review, rating, today, options);
  }
  return previews;
}

/**
 * Cria a primeira revisão de uma aula logo após sua conclusão.
 * Conforme PRD seção 7: nasce em step = 0, com dueDate = hoje + 1 dia.
 */
export function createInitialReview(lessonId: string, today: string): LessonReview {
  return {
    lessonId,
    step: 0,
    dueDate: addDays(today, 1),
    mastered: false,
    history: [],
    updatedAt: Date.now(),
    ease: EASE_START,
    lapses: 0,
    leeched: false,
  };
}

/**
 * Avalia uma revisão existente com base na nota dada pelo usuário na data 'today'.
 * Conforme tabela do PRD seção 7:
 * - Errei: novo passo = 0, vencimento = hoje + 1
 * - Difícil: novo passo = s (igual), vencimento = hoje + max(1, floor(LADDER[s] / 2))
 * - Bom: novo passo = min(s + 1, 4), vencimento = hoje + LADDER[novo passo]
 * - Fácil: novo passo = min(s + 2, 4), vencimento = hoje + LADDER[novo passo]
 *
 * A facilidade (ease) e o contador de erros são camadas opcionais por cima da escada:
 * com facilidade 2.5 os intervalos continuam idênticos aos do PRD.
 */
export function evaluateReview(
  review: LessonReview,
  rating: ReviewRating,
  today: string,
  options: EvaluateReviewOptions = {}
): LessonReview {
  const preview = scheduleFor(review, rating, today, options);
  const lapses = reviewLapses(review) + (rating === 'errei' ? 1 : 0);

  return {
    ...review,
    step: preview.nextStep,
    dueDate: preview.dueDate,
    ease: preview.easeAfter,
    lapses,
    leeched: review.leeched === true || lapses >= LEECH_AT,
    updatedAt: Date.now(),
    history: [
      ...(review.history || []),
      {
        date: today,
        rating,
      },
    ],
  };
}

/**
 * Distribui as revisões atrasadas pelos próximos dias (mínimo 3 dias).
 * Conforme PRD seções 6 e 7:
 * - O mais atrasado primeiro (ordenado por dueDate ascendente).
 * - Sem passar de dailyCap por dia.
 * - Se 3 dias não bastarem para caber todas com o cap, usa mais dias (D = ceil(N / cap)).
 */
export function spreadOverdueReviews(
  overdueReviews: LessonReview[],
  dailyCap: number,
  today: string
): LessonReview[] {
  if (!overdueReviews || overdueReviews.length === 0) {
    return [];
  }

  const cap = Math.max(1, dailyCap);

  // Ordena por vencimento mais antigo primeiro
  const sorted = [...overdueReviews].sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate)
  );

  const N = sorted.length;
  // Dias mínimos: 3 dias. Se N > 3 * cap, usa Math.ceil(N / cap) dias.
  const D = Math.max(3, Math.ceil(N / cap));

  const base = Math.floor(N / D);
  const remainder = N % D;

  const result: LessonReview[] = [];
  let itemIndex = 0;

  for (let dayOffset = 1; dayOffset <= D; dayOffset++) {
    // Dias iniciais recebem 1 item a mais enquanto houver resto
    const dayCount = base + (dayOffset - 1 < remainder ? 1 : 0);
    const dayDueDate = addDays(today, dayOffset);

    for (let j = 0; j < dayCount && itemIndex < N; j++) {
      const review = sorted[itemIndex++];
      result.push({
        ...review,
        dueDate: dayDueDate,
        updatedAt: Date.now(),
      });
    }
  }

  return result;
}
