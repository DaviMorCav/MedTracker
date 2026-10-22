import rawCurriculum from './curriculum.json';
import type { Curriculum, Lesson, Subject, Volume } from '../types/curriculum';

export const curriculum: Curriculum = rawCurriculum as Curriculum;
export * from '../types/curriculum';

export interface FlatLesson extends Lesson {
  subjectId: string;
  subjectName: string;
  volumeId: string;
  volumeName: string;
}

export interface VolumeWithSubject extends Volume {
  subjectId: string;
  subjectName: string;
}

export const subjectById = new Map<string, Subject>();
export const volumeById = new Map<string, VolumeWithSubject>();
export const lessonById = new Map<string, FlatLesson>();
export const allLessons: FlatLesson[] = [];
export const lessonsBySubjectId = new Map<string, FlatLesson[]>();
export const lessonsByVolumeId = new Map<string, FlatLesson[]>();

for (const subject of curriculum.subjects) {
  subjectById.set(subject.id, subject);
  const subjectFlatLessons: FlatLesson[] = [];

  for (const volume of subject.volumes) {
    const volWithSub: VolumeWithSubject = {
      ...volume,
      subjectId: subject.id,
      subjectName: subject.name,
    };
    volumeById.set(volume.id, volWithSub);

    const volumeFlatLessons: FlatLesson[] = [];
    for (const lesson of volume.lessons) {
      const flat: FlatLesson = {
        ...lesson,
        subjectId: subject.id,
        subjectName: subject.name,
        volumeId: volume.id,
        volumeName: volume.name,
      };
      allLessons.push(flat);
      subjectFlatLessons.push(flat);
      volumeFlatLessons.push(flat);
      lessonById.set(flat.id, flat);
    }
    lessonsByVolumeId.set(volume.id, volumeFlatLessons);
  }
  lessonsBySubjectId.set(subject.id, subjectFlatLessons);
}
