import { db } from './index';
import type {
  LessonProgress,
  LessonStatus,
  UserSettings,
  ApostilaProgress,
  QuestionLog,
  QuestionAttempt,
  LessonReview,
  LessonMedia,
  VolumeMedia,
  ApostilaMedia,
  DriveMediaImportData,
} from './schema';
import { createInitialReview } from '../core/srs';
import type { BackupData } from '../core/backup';

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
    updatedAt: Date.now(),
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
    updatedAt: Date.now(),
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
    updatedAt: Date.now(),
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
    updatedAt: Date.now(),
  });

  return newCompleted;
}

export async function setAllApostilaPages(
  volumeId: string,
  pages: number[],
  completed: boolean,
  today: string
): Promise<void> {
  const now = Date.now();
  const items: ApostilaProgress[] = pages.map((page) => ({
    volumeId,
    page,
    completed,
    completedAt: completed ? today : undefined,
    updatedAt: now,
  }));
  await db.apostila.bulkPut(items);
}

export async function setLessonMastered(
  lessonId: string,
  mastered: boolean
): Promise<void> {
  const now = Date.now();
  const currentProgress = (await db.progress.get(lessonId)) || {
    lessonId,
    status: 'nao_vista',
  };
  await db.progress.put({
    ...currentProgress,
    mastered,
    updatedAt: now,
  });

  const currentReview = await db.reviews.get(lessonId);
  if (currentReview) {
    await db.reviews.put({
      ...currentReview,
      mastered,
      updatedAt: now,
    });
  }
}

/**
 * Conclui uma aula conforme PRD seção 5:
 * 1. Grava status = 'concluida' e completedOn = hoje.
 * 2. Cria a revisão da aula (se ainda não existir) com vencimento em hoje + 1 dia.
 */
export async function completeLesson(
  lessonId: string,
  today: string
): Promise<{ reviewCreated: boolean; review: LessonReview }> {
  const now = Date.now();
  const current = (await db.progress.get(lessonId)) || {
    lessonId,
    status: 'nao_vista',
  };

  const updatedProgress: LessonProgress = {
    ...current,
    status: 'concluida',
    completedOn: current.completedOn || today,
    updatedAt: now,
  };
  await db.progress.put(updatedProgress);

  let review = await db.reviews.get(lessonId);
  let reviewCreated = false;

  if (!review) {
    review = createInitialReview(lessonId, today);
    review.updatedAt = now;
    await db.reviews.put(review);
    reviewCreated = true;
  }

  return { reviewCreated, review };
}

/**
 * Desmarca uma aula concluída conforme PRD seção 5 item 4:
 * 1. Atualiza status para o novo status (padrão 'nao_vista') e limpa completedOn.
 * 2. Remove a revisão criada.
 */
export async function uncompleteLesson(
  lessonId: string,
  newStatus: LessonStatus = 'nao_vista'
): Promise<void> {
  const current = (await db.progress.get(lessonId)) || {
    lessonId,
    status: 'nao_vista',
  };

  await db.progress.put({
    ...current,
    status: newStatus,
    completedOn: undefined,
    updatedAt: Date.now(),
  });

  await db.reviews.delete(lessonId);
}

/**
 * Registra o resultado de questões de uma aula.
 */
export async function addQuestionLog(
  log: Omit<QuestionLog, 'id'>
): Promise<number> {
  return (await db.questionLogs.add(log as QuestionLog)) as number;
}

/**
 * Remove um registro de questões pelo id.
 */
export async function deleteQuestionLog(id: number): Promise<void> {
  await db.questionLogs.delete(id);
}


/**
 * Registra a resposta a uma questão do banco.
 */
export async function addQuestionAttempt(
  attempt: Omit<QuestionAttempt, 'id'>
): Promise<number> {
  return (await db.questionAttempts.add(attempt as QuestionAttempt)) as number;
}

/**
 * Importa o mapeamento de IDs do Google Drive gerado pelo script.
 * Aceita tanto o formato objeto { lessons: {...}, volumes: {...} }
 * quanto arrays diretos.
 */
export async function importDriveMedia(
  data: DriveMediaImportData
): Promise<{ lessonsCount: number; volumesCount: number; apostilaItemsCount: number }> {
  const now = Date.now();
  const lessonsToSave: LessonMedia[] = [];
  const volumesToSave: VolumeMedia[] = [];
  const apostilaToSave: ApostilaMedia[] = [];

  if (data.lessons) {
    for (const [lessonId, item] of Object.entries(data.lessons)) {
      if (item && item.videoId) {
        lessonsToSave.push({
          lessonId,
          driveVideoId: item.videoId.trim(),
          videoName: item.videoName?.trim(),
          updatedAt: now,
        });
      }
    }
  }

  if (data.volumes) {
    for (const [volumeId, item] of Object.entries(data.volumes)) {
      if (item && item.pdfId) {
        volumesToSave.push({
          volumeId,
          drivePdfId: item.pdfId.trim(),
          pdfName: item.pdfName?.trim(),
          updatedAt: now,
        });
      }
    }
  }

  if (data.apostilaItems) {
    for (const [volumeId, pages] of Object.entries(data.apostilaItems)) {
      for (const [pageStr, driveFileId] of Object.entries(pages)) {
        const page = parseInt(pageStr, 10);
        if (!isNaN(page) && driveFileId) {
          apostilaToSave.push({ volumeId, page, driveFileId: driveFileId.trim(), updatedAt: now });
        }
      }
    }
  }

  await db.transaction('rw', [db.lessonMedia, db.volumeMedia, db.apostilaMedia], async () => {
    if (lessonsToSave.length > 0) {
      await db.lessonMedia.bulkPut(lessonsToSave);
    }
    if (volumesToSave.length > 0) {
      await db.volumeMedia.bulkPut(volumesToSave);
    }
    if (apostilaToSave.length > 0) {
      await db.apostilaMedia.bulkPut(apostilaToSave);
    }
  });

  return {
    lessonsCount: lessonsToSave.length,
    volumesCount: volumesToSave.length,
    apostilaItemsCount: apostilaToSave.length,
  };
}

/**
 * Limpa todos os links de mídia importados do Drive.
 */
export async function clearAllDriveMedia(): Promise<void> {
  await db.transaction('rw', [db.lessonMedia, db.volumeMedia], async () => {
    await db.lessonMedia.clear();
    await db.volumeMedia.clear();
  });
}

/**
 * Salva ou atualiza a mídia de uma aula específica.
 */
export async function saveLessonMedia(media: LessonMedia): Promise<void> {
  await db.lessonMedia.put({
    ...media,
    updatedAt: Date.now(),
  });
}

/**
 * Salva ou atualiza a mídia de um volume específico.
 */
export async function saveVolumeMedia(media: VolumeMedia): Promise<void> {
  await db.volumeMedia.put({
    ...media,
    updatedAt: Date.now(),
  });
}

/**
 * Exporta todos os dados do banco local no formato BackupData.
 */
export async function exportCurrentBackup(): Promise<BackupData> {
  const [
    settings,
    progress,
    volumeLinks,
    apostila,
    reviews,
    questionLogs,
    questionAttempts,
    lessonMedia,
    volumeMedia,
  ] = await Promise.all([
    db.settings.toArray(),
    db.progress.toArray(),
    db.volumeLinks.toArray(),
    db.apostila.toArray(),
    db.reviews.toArray(),
    db.questionLogs.toArray(),
    db.questionAttempts.toArray(),
    db.lessonMedia.toArray(),
    db.volumeMedia.toArray(),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      settings,
      progress,
      volumeLinks,
      apostila,
      reviews,
      questionLogs,
      questionAttempts,
      lessonMedia,
      volumeMedia,
    },
  };
}

/**
 * Aplica um conjunto de BackupData ao banco IndexedDB em uma transação segura.
 */
export async function applyBackupData(backup: BackupData): Promise<{
  progressCount: number;
  reviewsCount: number;
  questionsCount: number;
}> {
  const { data } = backup;

  await db.transaction(
    'rw',
    [
      db.settings,
      db.progress,
      db.volumeLinks,
      db.apostila,
      db.reviews,
      db.questionLogs,
      db.questionAttempts,
      db.lessonMedia,
      db.volumeMedia,
    ],
    async () => {
      await db.settings.clear();
      await db.progress.clear();
      await db.volumeLinks.clear();
      await db.apostila.clear();
      await db.reviews.clear();
      await db.questionLogs.clear();

      if (data.settings?.length) await db.settings.bulkPut(data.settings);
      if (data.progress?.length) await db.progress.bulkPut(data.progress);
      if (data.volumeLinks?.length) await db.volumeLinks.bulkPut(data.volumeLinks);
      if (data.apostila?.length) await db.apostila.bulkPut(data.apostila);
      if (data.reviews?.length) await db.reviews.bulkPut(data.reviews);
      if (data.questionLogs?.length) await db.questionLogs.bulkPut(data.questionLogs);

      if (data.questionAttempts) {
        await db.questionAttempts.clear();
        if (data.questionAttempts.length) {
          await db.questionAttempts.bulkPut(data.questionAttempts);
        }
      }

      if (data.lessonMedia) {
        await db.lessonMedia.clear();
        if (data.lessonMedia.length) await db.lessonMedia.bulkPut(data.lessonMedia);
      }

      if (data.volumeMedia) {
        await db.volumeMedia.clear();
        if (data.volumeMedia.length) await db.volumeMedia.bulkPut(data.volumeMedia);
      }
    }
  );

  return {
    progressCount: data.progress?.length || 0,
    reviewsCount: data.reviews?.length || 0,
    questionsCount: data.questionLogs?.length || 0,
  };
}

