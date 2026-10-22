import Dexie, { type Table } from 'dexie';
import type {
  UserSettings,
  LessonProgress,
  VolumeLink,
  ApostilaProgress,
  LessonReview,
  QuestionLog,
} from './schema';

export * from './schema';

export class MedTrackerDB extends Dexie {
  settings!: Table<UserSettings, string>;
  progress!: Table<LessonProgress, string>;
  volumeLinks!: Table<VolumeLink, string>;
  apostila!: Table<ApostilaProgress, [string, number]>;
  reviews!: Table<LessonReview, string>;
  questionLogs!: Table<QuestionLog, number>;

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
  }
}

export const db = new MedTrackerDB();
