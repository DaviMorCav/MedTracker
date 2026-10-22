export type LessonKind = 'aula' | 'bonus';

export interface Lesson {
  id: string;
  title: string;
  kind: LessonKind;
}

export interface Volume {
  id: string;
  name: string;
  pdf: string;
  lessons: Lesson[];
  apostila: number[];
}

export interface Subject {
  id: string;
  name: string;
  volumes: Volume[];
}

export interface Curriculum {
  version: number;
  source: string;
  subjects: Subject[];
}
