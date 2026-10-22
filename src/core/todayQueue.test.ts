import { describe, it, expect } from 'vitest';
import {
  calculateTodayReviewsQueue,
  getPendingQuestions,
  suggestNewLessons,
} from './todayQueue';
import type { LessonReview, LessonProgress, QuestionLog } from '../db/schema';
import type { Subject } from '../types/curriculum';

describe('Today Queue Logic (src/core/todayQueue.ts)', () => {
  const TODAY = '2026-10-22';

  describe('calculateTodayReviewsQueue', () => {
    it('ordena atrasadas primeiro (mais antigas no topo), depois as de hoje, excluindo futuras', () => {
      const reviews: LessonReview[] = [
        { lessonId: 'hoje-1', step: 1, dueDate: '2026-10-22', mastered: false, history: [] },
        { lessonId: 'atrasada-recente', step: 1, dueDate: '2026-10-20', mastered: false, history: [] },
        { lessonId: 'futura', step: 2, dueDate: '2026-10-25', mastered: false, history: [] },
        { lessonId: 'atrasada-antiga', step: 0, dueDate: '2026-10-15', mastered: false, history: [] },
      ];

      const res = calculateTodayReviewsQueue({ reviews, today: TODAY });

      expect(res.totalDueCount).toBe(3);
      expect(res.overdueCount).toBe(2);
      expect(res.todayCount).toBe(1);
      expect(res.remainingCount).toBe(0);

      // Ordem: atrasada-antiga -> atrasada-recente -> hoje-1
      expect(res.queue.map((r) => r.lessonId)).toEqual([
        'atrasada-antiga',
        'atrasada-recente',
        'hoje-1',
      ]);
    });

    it('ignora aulas dominadas (mastered: true), mesmo que vencidas', () => {
      const reviews: LessonReview[] = [
        { lessonId: 'dominada-atrasada', step: 4, dueDate: '2026-10-10', mastered: true, history: [] },
        { lessonId: 'ativa-hoje', step: 2, dueDate: '2026-10-22', mastered: false, history: [] },
      ];

      const res = calculateTodayReviewsQueue({ reviews, today: TODAY });
      expect(res.totalDueCount).toBe(1);
      expect(res.queue.map((r) => r.lessonId)).toEqual(['ativa-hoje']);
    });

    it('aplica dailyReviewCap e informa o restante (+N na fila)', () => {
      const reviews: LessonReview[] = [
        { lessonId: 'r1', step: 0, dueDate: '2026-10-20', mastered: false, history: [] },
        { lessonId: 'r2', step: 0, dueDate: '2026-10-21', mastered: false, history: [] },
        { lessonId: 'r3', step: 0, dueDate: '2026-10-22', mastered: false, history: [] },
        { lessonId: 'r4', step: 0, dueDate: '2026-10-22', mastered: false, history: [] },
      ];

      const res = calculateTodayReviewsQueue({
        reviews,
        today: TODAY,
        dailyReviewCap: 2,
      });

      expect(res.queue.length).toBe(2);
      expect(res.queue.map((r) => r.lessonId)).toEqual(['r1', 'r2']);
      expect(res.totalDueCount).toBe(4);
      expect(res.remainingCount).toBe(2);
    });
  });

  describe('getPendingQuestions', () => {
    it('retorna apenas aulas concluídas que não possuem registro de questões', () => {
      const progressList: LessonProgress[] = [
        { lessonId: 'aula-concluida-sem-questoes', status: 'concluida', completedOn: '2026-10-22' },
        { lessonId: 'aula-concluida-com-questoes', status: 'concluida', completedOn: '2026-10-21' },
        { lessonId: 'aula-assistindo', status: 'assistindo' },
        { lessonId: 'aula-nao-vista', status: 'nao_vista' },
      ];

      const questionLogs: QuestionLog[] = [
        { lessonId: 'aula-concluida-com-questoes', date: '2026-10-21', total: 10, correct: 9 },
      ];

      const pending = getPendingQuestions({ progressList, questionLogs });
      expect(pending.length).toBe(1);
      expect(pending[0].lessonId).toBe('aula-concluida-sem-questoes');
    });

    it('ordena por data de conclusão decrescente (mais recente primeiro)', () => {
      const progressList: LessonProgress[] = [
        { lessonId: 'aula-antiga', status: 'concluida', completedOn: '2026-10-18' },
        { lessonId: 'aula-recente', status: 'concluida', completedOn: '2026-10-22' },
      ];

      const pending = getPendingQuestions({ progressList, questionLogs: [] });
      expect(pending.map((p) => p.lessonId)).toEqual(['aula-recente', 'aula-antiga']);
    });
  });

  describe('suggestNewLessons', () => {
    const mockSubjects: Subject[] = [
      {
        id: 'cardio',
        name: 'Cardiologia',
        volumes: [
          {
            id: 'cardio-v1',
            name: 'Volume 1',
            pdf: 'v1.pdf',
            lessons: [
              { id: 'c-v1-a1', title: 'Cardio V1 A1', kind: 'aula' },
              { id: 'c-v1-a2', title: 'Cardio V1 A2', kind: 'aula' },
              { id: 'c-v1-b1', title: 'Cardio V1 Bônus 1', kind: 'bonus' },
            ],
            apostila: [1, 2],
          },
          {
            id: 'cardio-v2',
            name: 'Volume 2',
            pdf: 'v2.pdf',
            lessons: [
              { id: 'c-v2-a1', title: 'Cardio V2 A1', kind: 'aula' },
            ],
            apostila: [3],
          },
        ],
      },
      {
        id: 'cirurgia',
        name: 'Cirurgia',
        volumes: [
          {
            id: 'cirurgia-v1',
            name: 'Cirurgia V1',
            pdf: 'cir1.pdf',
            lessons: [
              { id: 's-v1-a1', title: 'Cirurgia V1 A1', kind: 'aula' },
              { id: 's-v1-a2', title: 'Cirurgia V1 A2', kind: 'aula' },
            ],
            apostila: [1],
          },
        ],
      },
      {
        id: 'pediatria',
        name: 'Pediatria',
        volumes: [
          {
            id: 'ped-v1',
            name: 'Pediatria V1',
            pdf: 'ped1.pdf',
            lessons: [
              { id: 'p-v1-a1', title: 'Pediatria V1 A1', kind: 'aula' },
            ],
            apostila: [1],
          },
        ],
      },
    ];

    it('faz rodízio entre as matérias ativas na ordem informada', () => {
      const suggested = suggestNewLessons({
        subjects: mockSubjects,
        activeSubjects: ['cardio', 'cirurgia', 'pediatria'],
        progressMap: new Map(),
        dailyNewLessons: 4,
        includeBonus: false,
      });

      // Rodízio 1: cardio (c-v1-a1), cirurgia (s-v1-a1), pediatria (p-v1-a1)
      // Rodízio 2: cardio (c-v1-a2)
      expect(suggested.map((l) => l.id)).toEqual([
        'c-v1-a1',
        's-v1-a1',
        'p-v1-a1',
        'c-v1-a2',
      ]);
    });

    it('respeita a ordem dos volumes (Volume 1 antes do Volume 2)', () => {
      const progressMap = new Map<string, LessonProgress>([
        ['c-v1-a1', { lessonId: 'c-v1-a1', status: 'concluida' }],
        ['c-v1-a2', { lessonId: 'c-v1-a2', status: 'concluida' }],
      ]);

      const suggested = suggestNewLessons({
        subjects: mockSubjects,
        activeSubjects: ['cardio'],
        progressMap,
        dailyNewLessons: 1,
        includeBonus: false,
      });

      // Como as aulas de v1 foram concluídas e includeBonus é false, pega a primeira de v2
      expect(suggested.map((l) => l.id)).toEqual(['c-v2-a1']);
    });

    it('bônus só entra se includeBonus estiver ativo e após as aulas do mesmo volume', () => {
      // Caso 1: Aulas de v1 ainda não concluídas -> bônus NÃO entra mesmo com includeBonus: true
      const progressMap1 = new Map<string, LessonProgress>([
        ['c-v1-a1', { lessonId: 'c-v1-a1', status: 'concluida' }],
        // c-v1-a2 NÃO concluída
      ]);

      const res1 = suggestNewLessons({
        subjects: mockSubjects,
        activeSubjects: ['cardio'],
        progressMap: progressMap1,
        dailyNewLessons: 1,
        includeBonus: true,
      });
      expect(res1[0].id).toBe('c-v1-a2');

      // Caso 2: Todas as aulas de v1 concluídas e includeBonus: true -> bônus é sugerido antes de v2
      const progressMap2 = new Map<string, LessonProgress>([
        ['c-v1-a1', { lessonId: 'c-v1-a1', status: 'concluida' }],
        ['c-v1-a2', { lessonId: 'c-v1-a2', status: 'concluida' }],
      ]);

      const res2 = suggestNewLessons({
        subjects: mockSubjects,
        activeSubjects: ['cardio'],
        progressMap: progressMap2,
        dailyNewLessons: 1,
        includeBonus: true,
      });
      expect(res2[0].id).toBe('c-v1-b1');
      expect(res2[0].kind).toBe('bonus');
    });

    it('teste de borda: matéria sem aulas restantes é ignorada no rodízio', () => {
      // Pediatria tem todas as aulas concluídas
      const progressMap = new Map<string, LessonProgress>([
        ['p-v1-a1', { lessonId: 'p-v1-a1', status: 'concluida' }],
      ]);

      const suggested = suggestNewLessons({
        subjects: mockSubjects,
        activeSubjects: ['cardio', 'pediatria', 'cirurgia'],
        progressMap,
        dailyNewLessons: 3,
        includeBonus: false,
      });

      // Pediatria é pulada; rodízio fica entre cardio e cirurgia
      expect(suggested.map((l) => l.id)).toEqual([
        'c-v1-a1',
        's-v1-a1',
        'c-v1-a2',
      ]);
    });

    it('teste de borda: aula dominada (mastered: true) não é sugerida como nova', () => {
      const progressMap = new Map<string, LessonProgress>([
        ['c-v1-a1', { lessonId: 'c-v1-a1', status: 'nao_vista', mastered: true }],
      ]);

      const suggested = suggestNewLessons({
        subjects: mockSubjects,
        activeSubjects: ['cardio'],
        progressMap,
        dailyNewLessons: 1,
      });

      // Pula c-v1-a1 porque está dominada e sugere c-v1-a2
      expect(suggested[0].id).toBe('c-v1-a2');
    });

    it('teste de borda: quando não há matérias ativas ou dailyNewLessons <= 0 retorna vazio', () => {
      expect(
        suggestNewLessons({
          subjects: mockSubjects,
          activeSubjects: [],
          progressMap: new Map(),
          dailyNewLessons: 2,
        })
      ).toEqual([]);

      expect(
        suggestNewLessons({
          subjects: mockSubjects,
          activeSubjects: ['cardio'],
          progressMap: new Map(),
          dailyNewLessons: 0,
        })
      ).toEqual([]);
    });

    it('teste de borda: quando todas as aulas ativas acabaram retorna o que estiver disponível', () => {
      const progressMap = new Map<string, LessonProgress>([
        ['p-v1-a1', { lessonId: 'p-v1-a1', status: 'concluida' }],
      ]);

      // Pediatria só tem 1 aula e já está concluída
      const suggested = suggestNewLessons({
        subjects: mockSubjects,
        activeSubjects: ['pediatria'],
        progressMap,
        dailyNewLessons: 3,
      });

      expect(suggested).toEqual([]);
    });
  });
});
