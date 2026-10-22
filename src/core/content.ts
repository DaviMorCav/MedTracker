import type { Lesson } from '../types/curriculum';
import type { LessonProgress, QuestionLog } from '../db/schema';

export interface ResolveQuestionsUrlOptions {
  lessonUrl?: string;
  volumeUrl?: string;
  template?: string;
  subjectName?: string;
  volumeName?: string;
  lessonTitle?: string;
}

/**
 * Resolve o link para questões seguindo a hierarquia do PRD seção 5:
 * 1. Link da aula
 * 2. Link do volume
 * 3. Modelo global (com substituição de {materia}, {volume}, {aula})
 */
export function resolveQuestionsUrl(options: ResolveQuestionsUrlOptions): string {
  const {
    lessonUrl,
    volumeUrl,
    template,
    subjectName = '',
    volumeName = '',
    lessonTitle = '',
  } = options;

  if (lessonUrl && lessonUrl.trim()) {
    return lessonUrl.trim();
  }

  if (volumeUrl && volumeUrl.trim()) {
    return volumeUrl.trim();
  }

  if (template && template.trim()) {
    return template
      .replace(/\{materia\}/g, encodeURIComponent(subjectName))
      .replace(/\{volume\}/g, encodeURIComponent(volumeName))
      .replace(/\{aula\}/g, encodeURIComponent(lessonTitle))
      .trim();
  }

  return '';
}

/**
 * Calcula estatísticas de acerto para uma lista de registros de questões.
 * Conforme PRD seção 7: acerto < 60% marca a aula com o selo "Fraca".
 */
export function calculateAccuracy(logs: Pick<QuestionLog, 'total' | 'correct'>[]): {
  total: number;
  correct: number;
  percentage: number;
  isWeak: boolean;
} {
  const total = logs.reduce((sum, log) => sum + (log.total || 0), 0);
  const correct = logs.reduce((sum, log) => sum + (log.correct || 0), 0);
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
  const isWeak = total > 0 && percentage < 60;

  return { total, correct, percentage, isWeak };
}

export interface SubjectProgressResult {
  totalAulas: number;
  completedAulas: number;
  totalBonus: number;
  completedBonus: number;
  percentAulas: number;
}

/**
 * Calcula o progresso de uma matéria ou volume baseado nos registros de progresso.
 */
export function calculateSubjectProgress(
  lessons: Lesson[],
  progressMap: Map<string, LessonProgress>
): SubjectProgressResult {
  const aulas = lessons.filter((l) => l.kind === 'aula');
  const bonus = lessons.filter((l) => l.kind === 'bonus');

  const completedAulas = aulas.filter(
    (l) => progressMap.get(l.id)?.status === 'concluida'
  ).length;

  const completedBonus = bonus.filter(
    (l) => progressMap.get(l.id)?.status === 'concluida'
  ).length;

  const percentAulas =
    aulas.length > 0 ? Math.round((completedAulas / aulas.length) * 100) : 0;

  return {
    totalAulas: aulas.length,
    completedAulas,
    totalBonus: bonus.length,
    completedBonus,
    percentAulas,
  };
}

/**
 * Verifica se uma revisão está atrasada/vencida com base na data de hoje.
 */
export function isReviewOverdue(dueDate: string, today: string): boolean {
  return dueDate < today;
}
