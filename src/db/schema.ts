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
  updatedAt?: number;
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
  updatedAt?: number;
}

export interface LessonReview {
  lessonId: string;
  step: number;
  dueDate: string;
  mastered: boolean;
  history: ReviewHistoryItem[];
  updatedAt?: number;
}

export interface QuestionLog {
  id?: number;
  lessonId: string;
  date: string;
  total: number;
  correct: number;
  note?: string;
}

/**
 * Uma resposta dada a uma questão do banco (tela Questões > Resolver).
 * `materia` é o id da matéria em que a questão foi resolvida (ex.: 'cardiologia').
 */
export interface QuestionAttempt {
  id?: number;
  questionId: string;
  materia: string;
  tema?: string;
  date: string; // YYYY-MM-DD, fuso local
  answeredAt: number; // Date.now()
  chosen: string; // letra marcada
  correct: boolean;
}

export interface LessonMedia {
  lessonId: string;
  driveVideoId: string;
  videoName?: string;
  updatedAt?: number;
}

export interface VolumeMedia {
  volumeId: string;
  drivePdfId: string;
  pdfName?: string;
  updatedAt?: number;
}

export interface DriveMediaImportData {
  lessons?: Record<string, { videoId: string; videoName?: string }>;
  volumes?: Record<string, { pdfId: string; pdfName?: string }>;
}
