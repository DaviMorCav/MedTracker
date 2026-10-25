import type { BackupData } from './backup';
import type {
  LessonProgress,
  LessonReview,
  ApostilaProgress,
  QuestionLog,
  QuestionAttempt,
  LessonMedia,
  VolumeMedia,
} from '../db/schema';

/**
 * Mescla de forma inteligente dois backups (local e remoto da nuvem),
 * garantindo que nenhum estudo, revisão ou progresso seja perdido.
 */
export function mergeBackupData(local: BackupData, remote: BackupData): BackupData {
  const localData = local.data;
  const remoteData = remote.data;

  // 1. Progresso das aulas (progress): se qualquer um marcou como 'concluida', mantém 'concluida'
  const progressMap = new Map<string, LessonProgress>();
  for (const p of [...(localData.progress || []), ...(remoteData.progress || [])]) {
    const existing = progressMap.get(p.lessonId);
    if (!existing) {
      progressMap.set(p.lessonId, p);
    } else {
      if (p.status === 'concluida' && existing.status !== 'concluida') {
        progressMap.set(p.lessonId, p);
      } else if (p.status === 'concluida' && existing.status === 'concluida') {
        // Mantém a data de conclusão mais recente ou a que existir
        const dateA = p.completedOn || '';
        const dateB = existing.completedOn || '';
        if (dateA >= dateB) {
          progressMap.set(p.lessonId, p);
        }
      } else if (p.status === 'assistindo' && existing.status === 'nao_vista') {
        progressMap.set(p.lessonId, p);
      }
    }
  }

  // 2. Revisões espaçadas (reviews): mantém o maior step ou histórico mais extenso
  const reviewsMap = new Map<string, LessonReview>();
  for (const r of [...(localData.reviews || []), ...(remoteData.reviews || [])]) {
    const existing = reviewsMap.get(r.lessonId);
    if (!existing) {
      reviewsMap.set(r.lessonId, r);
    } else {
      const stepA = r.step || 0;
      const stepB = existing.step || 0;
      if (stepA > stepB) {
        reviewsMap.set(r.lessonId, r);
      } else if (stepA === stepB) {
        const histA = r.history?.length || 0;
        const histB = existing.history?.length || 0;
        if (histA >= histB) {
          reviewsMap.set(r.lessonId, r);
        }
      }
    }
  }

  // 3. Progresso de Apostilas: se concluiu em qualquer um, fica marcado como concluído
  const apostilaMap = new Map<string, ApostilaProgress>();
  for (const a of [...(localData.apostila || []), ...(remoteData.apostila || [])]) {
    const key = `${a.volumeId}-${a.page}`;
    const existing = apostilaMap.get(key);
    if (!existing) {
      apostilaMap.set(key, a);
    } else {
      if (a.completed || existing.completed) {
        apostilaMap.set(key, {
          ...existing,
          completed: true,
          completedAt: a.completedAt || existing.completedAt,
        });
      }
    }
  }

  // 4. Logs de Questões: união sem duplicatas
  const questionLogs: QuestionLog[] = [];
  const logSignatures = new Set<string>();
  for (const log of [...(localData.questionLogs || []), ...(remoteData.questionLogs || [])]) {
    const sig = `${log.lessonId || ''}_${log.date}_${log.total}_${log.correct}`;
    if (!logSignatures.has(sig)) {
      logSignatures.add(sig);
      questionLogs.push(log);
    }
  }

  // 5. Tentativas individuais de questões (questionAttempts)
  const questionAttempts: QuestionAttempt[] = [];
  const attemptSignatures = new Set<string>();
  for (const att of [...(localData.questionAttempts || []), ...(remoteData.questionAttempts || [])]) {
    const sig = `${att.questionId}_${att.date}_${att.chosen}_${att.answeredAt}`;
    if (!attemptSignatures.has(sig)) {
      attemptSignatures.add(sig);
      questionAttempts.push(att);
    }
  }

  // 6. Mídias (lessonMedia e volumeMedia): união por ID
  const lessonMediaMap = new Map<string, LessonMedia>();
  for (const m of [...(localData.lessonMedia || []), ...(remoteData.lessonMedia || [])]) {
    lessonMediaMap.set(m.lessonId, m);
  }

  const volumeMediaMap = new Map<string, VolumeMedia>();
  for (const m of [...(localData.volumeMedia || []), ...(remoteData.volumeMedia || [])]) {
    volumeMediaMap.set(m.volumeId, m);
  }

  // 7. Configurações e Links de volume: prevalece o do backup com exportedAt mais recente
  const isRemoteNewer = (remote.exportedAt || '') > (local.exportedAt || '');
  const preferredSettings = isRemoteNewer
    ? remoteData.settings || localData.settings
    : localData.settings || remoteData.settings;
  const preferredVolumeLinks = isRemoteNewer
    ? remoteData.volumeLinks || localData.volumeLinks
    : localData.volumeLinks || remoteData.volumeLinks;

  return {
    version: Math.max(local.version || 1, remote.version || 1),
    exportedAt: new Date().toISOString(),
    data: {
      settings: preferredSettings,
      progress: Array.from(progressMap.values()),
      volumeLinks: preferredVolumeLinks,
      apostila: Array.from(apostilaMap.values()),
      reviews: Array.from(reviewsMap.values()),
      questionLogs,
      questionAttempts,
      lessonMedia: Array.from(lessonMediaMap.values()),
      volumeMedia: Array.from(volumeMediaMap.values()),
    },
  };
}
