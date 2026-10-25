import Dexie, { type Table } from 'dexie';
import type {
  UserSettings,
  LessonProgress,
  VolumeLink,
  ApostilaProgress,
  LessonReview,
  QuestionLog,
  QuestionAttempt,
} from './schema';

export * from './schema';
export * from './operations';
export * from './useLiveQuery';

export class MedTrackerDB extends Dexie {
  settings!: Table<UserSettings, string>;
  progress!: Table<LessonProgress, string>;
  volumeLinks!: Table<VolumeLink, string>;
  apostila!: Table<ApostilaProgress, [string, number]>;
  reviews!: Table<LessonReview, string>;
  questionLogs!: Table<QuestionLog, number>;
  questionAttempts!: Table<QuestionAttempt, number>;

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
  }
}

export const db = new MedTrackerDB();
