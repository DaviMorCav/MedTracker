import type {
  UserSettings,
  LessonProgress,
  VolumeLink,
  ApostilaProgress,
  LessonReview,
  QuestionLog,
} from '../db/schema';

export interface BackupData {
  version: number;
  exportedAt: string;
  data: {
    settings?: UserSettings[];
    progress?: LessonProgress[];
    volumeLinks?: VolumeLink[];
    apostila?: ApostilaProgress[];
    reviews?: LessonReview[];
    questionLogs?: QuestionLog[];
  };
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  backup?: BackupData;
}

/**
 * Valida a estrutura de um arquivo JSON de backup antes da importação.
 */
export function validateBackupJson(jsonString: string): ValidationResult {
  if (!jsonString || !jsonString.trim()) {
    return { valid: false, error: 'O arquivo de backup está vazio.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { valid: false, error: 'O arquivo não é um JSON válido.' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { valid: false, error: 'Estrutura de dados inválida.' };
  }

  const obj = parsed as Record<string, unknown>;

  // Aceita tanto formato embrulhado em "data" quanto direto
  const dataBlock =
    typeof obj.data === 'object' && obj.data !== null
      ? (obj.data as Record<string, unknown>)
      : obj;

  const hasAnyKnownTable =
    Array.isArray(dataBlock.progress) ||
    Array.isArray(dataBlock.reviews) ||
    Array.isArray(dataBlock.settings) ||
    Array.isArray(dataBlock.questionLogs) ||
    Array.isArray(dataBlock.apostila) ||
    Array.isArray(dataBlock.volumeLinks);

  if (!hasAnyKnownTable) {
    return {
      valid: false,
      error: 'O arquivo não contém dados reconhecíveis do MedTracker.',
    };
  }

  const normalizedBackup: BackupData = {
    version: typeof obj.version === 'number' ? obj.version : 1,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    data: {
      settings: Array.isArray(dataBlock.settings) ? dataBlock.settings : [],
      progress: Array.isArray(dataBlock.progress) ? dataBlock.progress : [],
      volumeLinks: Array.isArray(dataBlock.volumeLinks) ? dataBlock.volumeLinks : [],
      apostila: Array.isArray(dataBlock.apostila) ? dataBlock.apostila : [],
      reviews: Array.isArray(dataBlock.reviews) ? dataBlock.reviews : [],
      questionLogs: Array.isArray(dataBlock.questionLogs) ? dataBlock.questionLogs : [],
    },
  };

  return { valid: true, backup: normalizedBackup };
}
