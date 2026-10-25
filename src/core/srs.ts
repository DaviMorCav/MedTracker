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
  };
}

/**
 * Avalia uma revisão existente com base na nota dada pelo usuário na data 'today'.
 * Conforme tabela do PRD seção 7:
 * - Errei: novo passo = 0, vencimento = hoje + 1
 * - Difícil: novo passo = s (igual), vencimento = hoje + max(1, floor(LADDER[s] / 2))
 * - Bom: novo passo = min(s + 1, 4), vencimento = hoje + LADDER[novo passo]
 * - Fácil: novo passo = min(s + 2, 4), vencimento = hoje + LADDER[novo passo]
 */
export function evaluateReview(
  review: LessonReview,
  rating: ReviewRating,
  today: string
): LessonReview {
  let newStep: number = review.step;
  let intervalDays: number;

  switch (rating) {
    case 'errei':
      newStep = 0;
      intervalDays = 1;
      break;
    case 'dificil':
      newStep = review.step;
      intervalDays = Math.max(1, Math.floor(LADDER[review.step] / 2));
      break;
    case 'bom':
      newStep = Math.min(review.step + 1, 4);
      intervalDays = LADDER[newStep];
      break;
    case 'facil':
      newStep = Math.min(review.step + 2, 4);
      intervalDays = LADDER[newStep];
      break;
  }

  const nextDueDate = addDays(today, intervalDays);

  return {
    ...review,
    step: newStep,
    dueDate: nextDueDate,
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
