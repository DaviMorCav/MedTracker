import { db } from './index';
import type {
  LessonProgress,
  LessonStatus,
  UserSettings,
  ApostilaProgress,
} from './schema';

export const DEFAULT_SETTINGS: UserSettings = {
  id: 'default',
  dailyNewLessons: 2,
  dailyReviewCap: 20,
  activeSubjects: [
    'cardiologia',
    'cirurgia',
    'pediatria',
    'ginecologia',
    'obstetricia',
    'preventiva',
  ],
  includeBonus: false,
  questionsUrlTemplate: '',
};

export async function getSettings(): Promise<UserSettings> {
  const existing = await db.settings.get('default');
  if (existing) {
    return existing;
  }
  await db.settings.put(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export async function updateSettings(
  partial: Partial<UserSettings>
): Promise<UserSettings> {
  const current = await getSettings();
  const updated: UserSettings = {
    ...current,
    ...partial,
    id: 'default',
  };
  await db.settings.put(updated);
  return updated;
}

export async function toggleSubjectActive(subjectId: string): Promise<string[]> {
  const settings = await getSettings();
  const currentActive = settings.activeSubjects || [];
  const exists = currentActive.includes(subjectId);
  const updatedActive = exists
    ? currentActive.filter((id) => id !== subjectId)
    : [...currentActive, subjectId];

  await db.settings.put({
    ...settings,
    activeSubjects: updatedActive,
  });

  return updatedActive;
}

export async function setLessonStatus(
  lessonId: string,
  status: LessonStatus,
  today: string
): Promise<void> {
  const current = (await db.progress.get(lessonId)) || {
    lessonId,
    status: 'nao_vista',
  };

  const updated: LessonProgress = {
    ...current,
    status,
    completedOn:
      status === 'concluida' ? current.completedOn || today : undefined,
  };

  await db.progress.put(updated);
}

export async function saveLessonNotes(
  lessonId: string,
  notes: string
): Promise<void> {
  const current = (await db.progress.get(lessonId)) || {
    lessonId,
    status: 'nao_vista',
  };

  await db.progress.put({
    ...current,
    notes,
  });
}

export async function saveLessonQuestionsUrl(
  lessonId: string,
  questionsUrl: string
): Promise<void> {
  const current = (await db.progress.get(lessonId)) || {
    lessonId,
    status: 'nao_vista',
  };

  await db.progress.put({
    ...current,
    questionsUrl: questionsUrl.trim() || undefined,
  });
}

export async function saveVolumeQuestionsUrl(
  volumeId: string,
  questionsUrl: string
): Promise<void> {
  const trimmed = questionsUrl.trim();
  if (trimmed) {
    await db.volumeLinks.put({
      volumeId,
      questionsUrl: trimmed,
    });
  } else {
    await db.volumeLinks.delete(volumeId);
  }
}

export async function toggleApostilaPage(
  volumeId: string,
  page: number,
  today: string
): Promise<boolean> {
  const existing = await db.apostila.get([volumeId, page]);
  const newCompleted = !(existing && existing.completed);

  await db.apostila.put({
    volumeId,
    page,
    completed: newCompleted,
    completedAt: newCompleted ? today : undefined,
  });

  return newCompleted;
}

export async function setAllApostilaPages(
  volumeId: string,
  pages: number[],
  completed: boolean,
  today: string
): Promise<void> {
  const items: ApostilaProgress[] = pages.map((page) => ({
    volumeId,
    page,
    completed,
    completedAt: completed ? today : undefined,
  }));
  await db.apostila.bulkPut(items);
}

export async function setLessonMastered(
  lessonId: string,
  mastered: boolean
): Promise<void> {
  const currentProgress = (await db.progress.get(lessonId)) || {
    lessonId,
    status: 'nao_vista',
  };
  await db.progress.put({
    ...currentProgress,
    mastered,
  });

  const currentReview = await db.reviews.get(lessonId);
  if (currentReview) {
    await db.reviews.put({
      ...currentReview,
      mastered,
    });
  }
}
