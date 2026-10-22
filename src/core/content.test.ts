import { describe, it, expect } from 'vitest';
import { getLocalDateString, formatDateBr } from './dates';
import {
  resolveQuestionsUrl,
  calculateAccuracy,
  calculateSubjectProgress,
  isReviewOverdue,
  calculateSubjectAccuracyRankings,
  calculateOverallQuestionsStats,
} from './content';
import type { Lesson } from '../types/curriculum';
import type { LessonProgress } from '../db/schema';

describe('dates', () => {
  it('formats Date to local YYYY-MM-DD string', () => {
    const d = new Date(2026, 9, 22); // Note: month index 9 is October
    expect(getLocalDateString(d)).toBe('2026-10-22');
  });

  it('formats YYYY-MM-DD to DD/MM/YYYY', () => {
    expect(formatDateBr('2026-10-22')).toBe('22/10/2026');
    expect(formatDateBr('')).toBe('');
  });
});

describe('content logic', () => {
  describe('resolveQuestionsUrl', () => {
    it('prioritizes lessonUrl over volumeUrl and template', () => {
      const url = resolveQuestionsUrl({
        lessonUrl: 'https://questoes.exemplo/aula-1',
        volumeUrl: 'https://questoes.exemplo/vol-1',
        template: 'https://questoes.exemplo/?m={materia}&a={aula}',
        subjectName: 'Cardiologia',
        volumeName: 'Volume 1',
        lessonTitle: 'Arritmias',
      });
      expect(url).toBe('https://questoes.exemplo/aula-1');
    });

    it('uses volumeUrl if lessonUrl is missing', () => {
      const url = resolveQuestionsUrl({
        volumeUrl: 'https://questoes.exemplo/vol-1',
        template: 'https://questoes.exemplo/?m={materia}',
        subjectName: 'Cardiologia',
      });
      expect(url).toBe('https://questoes.exemplo/vol-1');
    });

    it('interpolates template if lessonUrl and volumeUrl are missing', () => {
      const url = resolveQuestionsUrl({
        template: 'https://questoes.exemplo/?m={materia}&v={volume}&a={aula}',
        subjectName: 'Cardio & Vascular',
        volumeName: 'Vol 1',
        lessonTitle: 'Aula ECG #1',
      });
      expect(url).toBe(
        `https://questoes.exemplo/?m=${encodeURIComponent('Cardio & Vascular')}&v=${encodeURIComponent('Vol 1')}&a=${encodeURIComponent('Aula ECG #1')}`
      );
    });

    it('returns empty string if no url or template provided', () => {
      const url = resolveQuestionsUrl({});
      expect(url).toBe('');
    });
  });

  describe('calculateAccuracy', () => {
    it('marks lesson as weak when accuracy is below 60%', () => {
      const result = calculateAccuracy([
        { total: 10, correct: 5 }, // 50%
      ]);
      expect(result.total).toBe(10);
      expect(result.correct).toBe(5);
      expect(result.percentage).toBe(50);
      expect(result.isWeak).toBe(true);
    });

    it('does not mark lesson as weak when accuracy is 60% or above', () => {
      const result = calculateAccuracy([
        { total: 10, correct: 6 }, // 60%
      ]);
      expect(result.percentage).toBe(60);
      expect(result.isWeak).toBe(false);
    });

    it('handles multiple logs combined', () => {
      const result = calculateAccuracy([
        { total: 10, correct: 8 },
        { total: 10, correct: 3 },
      ]);
      expect(result.total).toBe(20);
      expect(result.correct).toBe(11);
      expect(result.percentage).toBe(55);
      expect(result.isWeak).toBe(true);
    });

    it('returns not weak if no logs exist', () => {
      const result = calculateAccuracy([]);
      expect(result.total).toBe(0);
      expect(result.percentage).toBe(0);
      expect(result.isWeak).toBe(false);
    });
  });

  describe('calculateSubjectProgress', () => {
    const sampleLessons: Lesson[] = [
      { id: 'l1', title: 'Aula 1', kind: 'aula' },
      { id: 'l2', title: 'Aula 2', kind: 'aula' },
      { id: 'l3', title: 'Aula 3', kind: 'aula' },
      { id: 'b1', title: 'Bonus 1', kind: 'bonus' },
    ];

    it('calculates progress correctly', () => {
      const progressMap = new Map<string, LessonProgress>([
        ['l1', { lessonId: 'l1', status: 'concluida' }],
        ['l2', { lessonId: 'l2', status: 'assistindo' }],
        ['b1', { lessonId: 'b1', status: 'concluida' }],
      ]);

      const res = calculateSubjectProgress(sampleLessons, progressMap);
      expect(res.totalAulas).toBe(3);
      expect(res.completedAulas).toBe(1);
      expect(res.totalBonus).toBe(1);
      expect(res.completedBonus).toBe(1);
      expect(res.percentAulas).toBe(33);
    });
  });

  describe('isReviewOverdue', () => {
    it('detects past due date as overdue', () => {
      expect(isReviewOverdue('2026-10-21', '2026-10-22')).toBe(true);
      expect(isReviewOverdue('2026-10-22', '2026-10-22')).toBe(false);
      expect(isReviewOverdue('2026-10-23', '2026-10-22')).toBe(false);
    });
  });

  describe('calculateSubjectAccuracyRankings', () => {
    it('ordena as matérias da menor porcentagem para a maior porcentagem', () => {
      const subjects = [
        { id: 'cardio', name: 'Cardiologia' },
        { id: 'cirurgia', name: 'Cirurgia' },
        { id: 'pediatria', name: 'Pediatria' },
      ];

      const lessonSubjectMap = new Map([
        ['c1', 'cardio'],
        ['s1', 'cirurgia'],
        ['p1', 'pediatria'],
      ]);

      const logs = [
        { lessonId: 'c1', date: '2026-10-22', total: 10, correct: 9 }, // 90%
        { lessonId: 's1', date: '2026-10-22', total: 10, correct: 5 }, // 50% (fraca)
        { lessonId: 'p1', date: '2026-10-22', total: 10, correct: 7 }, // 70%
      ];

      const ranked = calculateSubjectAccuracyRankings(subjects, logs, lessonSubjectMap);
      expect(ranked.map((r) => r.subjectId)).toEqual(['cirurgia', 'pediatria', 'cardio']);
      expect(ranked[0].percentage).toBe(50);
      expect(ranked[0].isWeak).toBe(true);
      expect(ranked[1].percentage).toBe(70);
      expect(ranked[1].isWeak).toBe(false);
      expect(ranked[2].percentage).toBe(90);
    });
  });

  describe('calculateOverallQuestionsStats', () => {
    it('calcula o resumo total de questões feitas, acertos e porcentagem', () => {
      const logs = [
        { lessonId: 'l1', date: '2026-10-20', total: 10, correct: 8 },
        { lessonId: 'l2', date: '2026-10-21', total: 20, correct: 16 },
      ];

      const stats = calculateOverallQuestionsStats(logs);
      expect(stats.totalQuestions).toBe(30);
      expect(stats.totalCorrect).toBe(24);
      expect(stats.percentage).toBe(80);
      expect(stats.totalSessions).toBe(2);
    });

    it('retorna zeros caso não existam logs', () => {
      const stats = calculateOverallQuestionsStats([]);
      expect(stats.totalQuestions).toBe(0);
      expect(stats.totalCorrect).toBe(0);
      expect(stats.percentage).toBe(0);
      expect(stats.totalSessions).toBe(0);
    });
  });
});

