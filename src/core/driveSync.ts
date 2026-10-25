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
 * garantindo que nenhum estudo, revisão ou progresso seja perdido
 * e que alterações recentes (incluindo desmarcações e anotações) sejam respeitadas.
 */
export function mergeBackupData(local: BackupData, remote: BackupData): BackupData {
  const localData = local.data || {};
  const remoteData = remote.data || {};

  const localProgressList = localData.progress || [];
  const remoteProgressList = remoteData.progress || [];

  // Mapa com todos os lessonIds conhecidos
  const allLessonIds = new Set<string>([
    ...localProgressList.map((p) => p.lessonId),
    ...remoteProgressList.map((p) => p.lessonId),
  ]);

  const localProgMap = new Map(localProgressList.map((p) => [p.lessonId, p]));
  const remoteProgMap = new Map(remoteProgressList.map((p) => [p.lessonId, p]));

  // 1. Mesclagem de Progresso das Aulas
  const progressMap = new Map<string, LessonProgress>();

  for (const lessonId of allLessonIds) {
    const loc = localProgMap.get(lessonId);
    const rem = remoteProgMap.get(lessonId);

    if (loc && !rem) {
      progressMap.set(lessonId, loc);
      continue;
    }
    if (!loc && rem) {
      progressMap.set(lessonId, rem);
      continue;
    }
    if (loc && rem) {
      const locTime = loc.updatedAt || 0;
      const remTime = rem.updatedAt || 0;

      let chosen: LessonProgress;

      if (locTime > 0 || remTime > 0) {
        // Quem tiver o timestamp mais recente vence
        chosen = locTime >= remTime ? { ...loc } : { ...rem };
        // Preserva anotações se o escolhido não tiver e o outro tiver
        if (!chosen.notes?.trim() && (loc.notes?.trim() || rem.notes?.trim())) {
          chosen.notes = (loc.notes?.trim() || rem.notes?.trim());
        }
      } else {
        // Fallback sem timestamps:
        // Se um é concluído e o outro não, mantém concluído
        if (loc.status === 'concluida' && rem.status !== 'concluida') {
          chosen = { ...loc };
        } else if (rem.status === 'concluida' && loc.status !== 'concluida') {
          chosen = { ...rem };
        } else if (loc.status === 'assistindo' && rem.status === 'nao_vista') {
          chosen = { ...loc };
        } else if (rem.status === 'assistindo' && loc.status === 'nao_vista') {
          chosen = { ...rem };
        } else {
          // Mantém data mais recente ou local
          const dateA = loc.completedOn || '';
          const dateB = rem.completedOn || '';
          chosen = dateA >= dateB ? { ...loc } : { ...rem };
        }

        // Não perde anotações nem estado de dominado
        if (!chosen.notes?.trim() && (loc.notes?.trim() || rem.notes?.trim())) {
          chosen.notes = loc.notes?.trim() || rem.notes?.trim();
        }
        if (loc.mastered || rem.mastered) {
          chosen.mastered = true;
        }
      }

      progressMap.set(lessonId, chosen);
    }
  }

  // 2. Mesclagem de Revisões Espaçadas
  const localReviewsList = localData.reviews || [];
  const remoteReviewsList = remoteData.reviews || [];

  const allReviewLessonIds = new Set<string>([
    ...localReviewsList.map((r) => r.lessonId),
    ...remoteReviewsList.map((r) => r.lessonId),
  ]);

  const localRevMap = new Map(localReviewsList.map((r) => [r.lessonId, r]));
  const remoteRevMap = new Map(remoteReviewsList.map((r) => [r.lessonId, r]));

  const reviewsMap = new Map<string, LessonReview>();

  for (const lessonId of allReviewLessonIds) {
    const prog = progressMap.get(lessonId);
    // Se a aula foi desmarcada e não está concluída, não deve ter revisão ativa
    if (prog && prog.status !== 'concluida') {
      continue;
    }

    const loc = localRevMap.get(lessonId);
    const rem = remoteRevMap.get(lessonId);

    if (loc && !rem) {
      reviewsMap.set(lessonId, loc);
      continue;
    }
    if (!loc && rem) {
      reviewsMap.set(lessonId, rem);
      continue;
    }
    if (loc && rem) {
      const locTime = loc.updatedAt || 0;
      const remTime = rem.updatedAt || 0;

      if (locTime > 0 || remTime > 0) {
        // O mais recente vence (respeita avaliação feita hoje com "Errei", "Difícil" ou avanço de passo)
        reviewsMap.set(lessonId, locTime >= remTime ? loc : rem);
      } else {
        // Fallback sem timestamps:
        // Prefere quem tiver mais histórico de revisões; se igual, maior step
        const histLoc = loc.history?.length || 0;
        const histRem = rem.history?.length || 0;
        if (histLoc > histRem) {
          reviewsMap.set(lessonId, loc);
        } else if (histRem > histLoc) {
          reviewsMap.set(lessonId, rem);
        } else {
          reviewsMap.set(lessonId, (loc.step || 0) >= (rem.step || 0) ? loc : rem);
        }
      }
    }
  }

  // 3. Progresso de Apostilas
  const localApostila = localData.apostila || [];
  const remoteApostila = remoteData.apostila || [];

  const allApostilaKeys = new Set<string>([
    ...localApostila.map((a) => `${a.volumeId}-${a.page}`),
    ...remoteApostila.map((a) => `${a.volumeId}-${a.page}`),
  ]);

  const localAposMap = new Map(localApostila.map((a) => [`${a.volumeId}-${a.page}`, a]));
  const remoteAposMap = new Map(remoteApostila.map((a) => [`${a.volumeId}-${a.page}`, a]));

  const apostilaMap = new Map<string, ApostilaProgress>();

  for (const key of allApostilaKeys) {
    const loc = localAposMap.get(key);
    const rem = remoteAposMap.get(key);

    if (loc && !rem) {
      apostilaMap.set(key, loc);
      continue;
    }
    if (!loc && rem) {
      apostilaMap.set(key, rem);
      continue;
    }
    if (loc && rem) {
      const locTime = loc.updatedAt || 0;
      const remTime = rem.updatedAt || 0;

      if (locTime > 0 || remTime > 0) {
        // Respeita a última alteração (inclusive se o usuário desmarcou recentemente)
        apostilaMap.set(key, locTime >= remTime ? loc : rem);
      } else {
        // Se concluiu em qualquer um, fica marcado como concluído
        if (loc.completed || rem.completed) {
          apostilaMap.set(key, {
            ...loc,
            completed: true,
            completedAt: loc.completedAt || rem.completedAt,
          });
        } else {
          apostilaMap.set(key, loc);
        }
      }
    }
  }

  // 4. Logs de Questões: união sem duplicatas
  const questionLogs: QuestionLog[] = [];
  const logSignatures = new Set<string>();
  for (const log of [...(localData.questionLogs || []), ...(remoteData.questionLogs || [])]) {
    const sig = `${log.lessonId || ''}_${log.date}_${log.total}_${log.correct}_${log.note || ''}`;
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
