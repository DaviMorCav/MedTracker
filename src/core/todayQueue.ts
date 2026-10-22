import type { Subject, Lesson } from '../types/curriculum';
import type {
  LessonProgress,
  LessonReview,
  QuestionLog,
} from '../db/schema';
import { addDays } from './dates';

export interface TodayReviewsResult {
  queue: LessonReview[];
  allDueReviews: LessonReview[];
  overdueReviews: LessonReview[];
  todayReviews: LessonReview[];
  overdueCount: number;
  todayCount: number;
  totalDueCount: number;
  remainingCount: number;
}

/**
 * Calcula a fila de revisões para hoje conforme PRD seções 3 e 7:
 * - Apenas revisões ativas (!mastered).
 * - Atrasadas primeiro (dueDate < today), ordenadas da mais antiga para a mais recente.
 * - Depois as de hoje (dueDate === today).
 * - Exibe até dailyReviewCap na fila, e calcula o total restante (+N na fila).
 */
export function calculateTodayReviewsQueue(params: {
  reviews: LessonReview[];
  today: string;
  dailyReviewCap?: number;
}): TodayReviewsResult {
  const { reviews, today, dailyReviewCap } = params;

  const active = reviews.filter((r) => !r.mastered);

  // Atrasadas (mais antigas no topo)
  const overdueReviews = active
    .filter((r) => r.dueDate < today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.lessonId.localeCompare(b.lessonId));

  // De hoje
  const todayReviews = active
    .filter((r) => r.dueDate === today)
    .sort((a, b) => a.lessonId.localeCompare(b.lessonId));

  const allDueReviews = [...overdueReviews, ...todayReviews];
  const cap = dailyReviewCap !== undefined ? Math.max(0, dailyReviewCap) : allDueReviews.length;
  const queue = allDueReviews.slice(0, cap);
  const remainingCount = Math.max(0, allDueReviews.length - queue.length);

  return {
    queue,
    allDueReviews,
    overdueReviews,
    todayReviews,
    overdueCount: overdueReviews.length,
    todayCount: todayReviews.length,
    totalDueCount: allDueReviews.length,
    remainingCount,
  };
}

/**
 * Retorna as aulas concluídas que ainda não possuem registro de questões.
 * Conforme PRD seção 3: aulas concluídas sem nenhum registro na tabela de questões.
 */
export function getPendingQuestions(params: {
  progressList: LessonProgress[];
  questionLogs: QuestionLog[];
}): LessonProgress[] {
  const { progressList, questionLogs } = params;

  // Ids de aulas que já possuem ao menos um registro de questões
  const loggedLessonIds = new Set<string>();
  for (const log of questionLogs) {
    loggedLessonIds.add(log.lessonId);
  }

  // Apenas concluídas que não possuem registro
  return progressList
    .filter((p) => p.status === 'concluida' && !loggedLessonIds.has(p.lessonId))
    .sort((a, b) => {
      // Mais recentemente concluídas primeiro
      const dateA = a.completedOn || '';
      const dateB = b.completedOn || '';
      return dateB.localeCompare(dateA) || a.lessonId.localeCompare(b.lessonId);
    });
}

export type SuggestedLesson = Lesson & {
  subjectId: string;
  subjectName: string;
  volumeId: string;
  volumeName: string;
};

export interface SuggestNewLessonsParams {
  subjects: Subject[];
  activeSubjects: string[];
  progressMap: Map<string, LessonProgress> | Record<string, LessonProgress>;
  dailyNewLessons: number;
  includeBonus?: boolean;
}

/**
 * Localiza a próxima aula a ser sugerida para uma matéria específica:
 * - Volume 1 antes do volume 2, etc.
 * - Em cada volume: aulas (kind = "aula") não concluídas.
 * - Bônus só entram se includeBonus = true, e sempre após todas as aulas daquele mesmo volume.
 */
function getNextLessonForSubject(
  subject: Subject,
  progressMap: Map<string, LessonProgress> | Record<string, LessonProgress>,
  pickedIds: Set<string>,
  includeBonus: boolean
): SuggestedLesson | null {
  const isLessonDone = (lessonId: string): boolean => {
    const prog =
      progressMap instanceof Map ? progressMap.get(lessonId) : progressMap[lessonId];
    return Boolean(prog && (prog.status === 'concluida' || prog.mastered));
  };

  for (const volume of subject.volumes) {
    const aulas = volume.lessons.filter((l) => l.kind === 'aula');
    const bonus = volume.lessons.filter((l) => l.kind === 'bonus');

    // 1. Aulas não concluídas nem escolhidas neste lote
    for (const aula of aulas) {
      if (!isLessonDone(aula.id) && !pickedIds.has(aula.id)) {
        return {
          ...aula,
          subjectId: subject.id,
          subjectName: subject.name,
          volumeId: volume.id,
          volumeName: volume.name,
        };
      }
    }

    // 2. Se todas as aulas deste volume já foram concluídas ou escolhidas neste lote,
    // e includeBonus estiver ativo, bônus deste volume tornam-se elegíveis
    if (includeBonus) {
      for (const b of bonus) {
        if (!isLessonDone(b.id) && !pickedIds.has(b.id)) {
          return {
            ...b,
            subjectId: subject.id,
            subjectName: subject.name,
            volumeId: volume.id,
            volumeName: volume.name,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Sugere novas aulas conforme as regras da Seção 3.1 do PRD:
 * - O usuário define matérias ativas e sua ordem.
 * - Fila percorre as matérias ativas em rodízio (round-robin).
 * - Em cada matéria, pega a próxima aula não concluída na ordem dos volumes.
 * - Bônus só após as aulas do mesmo volume e se includeBonus = true.
 * - Matérias sem aulas restantes são ignoradas no rodízio.
 */
export function suggestNewLessons(params: SuggestNewLessonsParams): SuggestedLesson[] {
  const {
    subjects,
    activeSubjects,
    progressMap,
    dailyNewLessons,
    includeBonus = false,
  } = params;

  if (dailyNewLessons <= 0 || !activeSubjects || activeSubjects.length === 0) {
    return [];
  }

  const subjectMap = new Map<string, Subject>();
  for (const s of subjects) {
    subjectMap.set(s.id, s);
  }

  // Matérias ativas na ordem configurada pelo usuário
  const activeSubjectObjs: Subject[] = [];
  for (const id of activeSubjects) {
    const sub = subjectMap.get(id);
    if (sub) {
      activeSubjectObjs.push(sub);
    }
  }

  if (activeSubjectObjs.length === 0) {
    return [];
  }

  const picked: SuggestedLesson[] = [];
  const pickedIds = new Set<string>();

  let hasMore = true;
  while (picked.length < dailyNewLessons && hasMore) {
    hasMore = false;
    for (const subject of activeSubjectObjs) {
      if (picked.length >= dailyNewLessons) {
        break;
      }

      const next = getNextLessonForSubject(
        subject,
        progressMap,
        pickedIds,
        includeBonus
      );

      if (next) {
        picked.push(next);
        pickedIds.add(next.id);
        hasMore = true;
      }
    }
  }

  return picked;
}

/**
 * Calcula a sequência de dias consecutivos com atividade (streak).
 * Conforme PRD seção 10: a sequência é derivada das datas de conclusão, avaliações e registros.
 */
export function calculateStreak(
  activeDates: Set<string> | string[],
  today: string
): number {
  const datesSet = activeDates instanceof Set ? activeDates : new Set(activeDates);
  if (datesSet.size === 0) return 0;

  // Se hoje teve atividade, a sequência conta a partir de hoje.
  // Se hoje ainda não teve atividade, a sequência conta a partir de ontem (para não zerar antes de estudar).
  let current = today;
  if (!datesSet.has(today)) {
    const yesterday = addDays(today, -1);
    if (!datesSet.has(yesterday)) {
      return 0;
    }
    current = yesterday;
  }

  let streak = 0;
  while (datesSet.has(current)) {
    streak++;
    current = addDays(current, -1);
  }

  return streak;
}

export interface DayForecast {
  date: string;
  dayLabel: string;
  count: number;
}

/**
 * Calcula a carga de revisões para os próximos 7 dias (today + 1 até today + 7).
 * Conforme PRD seção 3 item 5.
 */
export function calculateNext7DaysForecast(
  reviews: LessonReview[],
  today: string
): DayForecast[] {
  const activeReviews = reviews.filter((r) => !r.mastered);
  const result: DayForecast[] = [];
  const dayOfWeekNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  for (let i = 1; i <= 7; i++) {
    const dStr = addDays(today, i);
    const count = activeReviews.filter((r) => r.dueDate === dStr).length;

    const [year, month, day] = dStr.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayLabel = i === 1 ? 'Amanhã' : dayOfWeekNames[dateObj.getDay()];

    result.push({
      date: dStr,
      dayLabel,
      count,
    });
  }

  return result;
}

