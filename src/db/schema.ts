export type LessonStatus = 'nao_vista' | 'assistindo' | 'concluida';

export type ReviewRating = 'errei' | 'dificil' | 'bom' | 'facil';

export interface ReviewHistoryItem {
  date: string;
  rating: ReviewRating;
}

export interface UserSettings {
  id: string; // e.g. 'default'
  dailyNewLessons: number;
  dailyReviewCap: number;
  activeSubjects: string[];
  includeBonus: boolean;
  questionsUrlTemplate: string;
}

export interface LessonProgress {
  lessonId: string;
  status: LessonStatus;
  completedOn?: string;
  notes?: string;
  questionsUrl?: string;
  mastered?: boolean;
}

export interface VolumeLink {
  volumeId: string;
  questionsUrl: string;
}

export interface ApostilaProgress {
  volumeId: string;
  page: number;
  completed: boolean;
  completedAt?: string;
}

export interface LessonReview {
  lessonId: string;
  step: number;
  dueDate: string;
  mastered: boolean;
  history: ReviewHistoryItem[];
}

export interface QuestionLog {
  id?: number;
  lessonId: string;
  date: string;
  total: number;
  correct: number;
  note?: string;
}
