import Dexie, { type Table } from 'dexie';
import type {
  UserSettings,
  LessonProgress,
  VolumeLink,
  ApostilaProgress,
  LessonReview,
  QuestionLog,
  QuestionAttempt,
  LessonMedia,
  VolumeMedia,
  ApostilaMedia,
} from './schema';

export * from './schema';
export * from './operations';
export * from './useLiveQuery';
import { notifyChange } from './operations';

export class MedTrackerDB extends Dexie {
  settings!: Table<UserSettings, string>;
  progress!: Table<LessonProgress, string>;
  volumeLinks!: Table<VolumeLink, string>;
  apostila!: Table<ApostilaProgress, [string, number]>;
  reviews!: Table<LessonReview, string>;
  questionLogs!: Table<QuestionLog, number>;
  questionAttempts!: Table<QuestionAttempt, number>;
  lessonMedia!: Table<LessonMedia, string>;
  volumeMedia!: Table<VolumeMedia, string>;
  apostilaMedia!: Table<ApostilaMedia, [string, number]>;

  constructor() {
    super('MedTrackerDB');
    this.version(1).stores({
      settings: 'id',
      progress: 'lessonId, status, completedOn',
      volumeLinks: 'volumeId',
      apostila: '[volumeId+page], volumeId',
      reviews: 'lessonId, dueDate, step, mastered',
      questionLogs: '++id, lessonId, date',
    });
    // v2: respostas a questões individuais do banco de questões
    this.version(2).stores({
      questionAttempts: '++id, questionId, materia, date',
    });
    // v3: vinculação de vídeos de aulas e apostilas em PDF do Google Drive
    this.version(3).stores({
      lessonMedia: 'lessonId',
      volumeMedia: 'volumeId',
    });
    // v4: links individuais de itens de apostila no Google Drive
    this.version(4).stores({
      apostilaMedia: '[volumeId+page], volumeId',
    });
  }
}

export const db = new MedTrackerDB();

// Monitora alterações para acionar sincronização em nuvem automática
const monitoredTables = [
  db.progress,
  db.reviews,
  db.questionLogs,
  db.questionAttempts,
  db.apostila,
  db.settings,
];

monitoredTables.forEach((table) => {
  table.hook('creating', () => {
    notifyChange();
  });
  table.hook('updating', () => {
    notifyChange();
  });
  table.hook('deleting', () => {
    notifyChange();
  });
});
