import rawCurriculum from './curriculum.json';
import type { Curriculum } from '../types/curriculum';

export const curriculum: Curriculum = rawCurriculum as Curriculum;
export * from '../types/curriculum';
