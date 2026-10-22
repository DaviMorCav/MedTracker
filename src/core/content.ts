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

export interface SubjectAccuracyStat {
  subjectId: string;
  subjectName: string;
  total: number;
  correct: number;
  percentage: number;
  isWeak: boolean;
}

/**
 * Calcula o percentual de acerto por matéria a partir dos registros de questões,
 * ordenado do menor para o maior percentual conforme PRD seção 8.
 */
export function calculateSubjectAccuracyRankings(
  subjects: { id: string; name: string }[],
  questionLogs: QuestionLog[],
  lessonSubjectMap: Map<string, string>
): SubjectAccuracyStat[] {
  const statsMap = new Map<string, { total: number; correct: number }>();

  for (const log of questionLogs) {
    const subjectId = lessonSubjectMap.get(log.lessonId);
    if (!subjectId) continue;

    const current = statsMap.get(subjectId) || { total: 0, correct: 0 };
    current.total += log.total || 0;
    current.correct += log.correct || 0;
    statsMap.set(subjectId, current);
  }

  const subjectNameMap = new Map(subjects.map((s) => [s.id, s.name]));
  const result: SubjectAccuracyStat[] = [];

  for (const [subjectId, stat] of statsMap.entries()) {
    if (stat.total > 0) {
      const percentage = Math.round((stat.correct / stat.total) * 100);
      result.push({
        subjectId,
        subjectName: subjectNameMap.get(subjectId) || subjectId,
        total: stat.total,
        correct: stat.correct,
        percentage,
        isWeak: percentage < 60,
      });
    }
  }

  // Ordenado do menor para o maior (PRD seção 8)
  return result.sort((a, b) => a.percentage - b.percentage || b.total - a.total);
}

export interface OverallQuestionsStats {
  totalQuestions: number;
  totalCorrect: number;
  percentage: number;
  totalSessions: number;
}

/**
 * Calcula resumo geral de questões feitas e acertos.
 */
export function calculateOverallQuestionsStats(
  logs: QuestionLog[]
): OverallQuestionsStats {
  const totalQuestions = logs.reduce((sum, l) => sum + (l.total || 0), 0);
  const totalCorrect = logs.reduce((sum, l) => sum + (l.correct || 0), 0);
  const percentage =
    totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  return {
    totalQuestions,
    totalCorrect,
    percentage,
    totalSessions: logs.length,
  };
}

