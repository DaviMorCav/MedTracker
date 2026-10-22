import { describe, it, expect } from 'vitest';
import {
  createInitialReview,
  evaluateReview,
  spreadOverdueReviews,
  LADDER,
} from './srs';
import type { LessonReview } from '../db/schema';

describe('SRS Engine (src/core/srs.ts)', () => {
  const TODAY = '2026-10-22';

  describe('Casos obrigatórios da Seção 7 do PRD (today = 2026-10-22)', () => {
    it('Caso 1: Aula concluída hoje, passo 0, vence 2026-10-23', () => {
      const review = createInitialReview('aula-1', TODAY);
      expect(review.lessonId).toBe('aula-1');
      expect(review.step).toBe(0);
      expect(review.dueDate).toBe('2026-10-23');
      expect(review.mastered).toBe(false);
      expect(review.history).toEqual([]);
    });

    it('Caso 2: Passo 0, Bom, vence 2026-10-29 (passo 1, 7 dias)', () => {
      const initial: LessonReview = {
        lessonId: 'aula-1',
        step: 0,
        dueDate: '2026-10-22',
        mastered: false,
        history: [],
      };
      const result = evaluateReview(initial, 'bom', TODAY);
      expect(result.step).toBe(1);
      expect(result.dueDate).toBe('2026-10-29');
      expect(result.history).toEqual([{ date: TODAY, rating: 'bom' }]);
    });

    it('Caso 3: Passo 1, Fácil, vence 2026-11-21 (passo 3, 30 dias)', () => {
      const initial: LessonReview = {
        lessonId: 'aula-1',
        step: 1,
        dueDate: '2026-10-22',
        mastered: false,
        history: [],
      };
      const result = evaluateReview(initial, 'facil', TODAY);
      expect(result.step).toBe(3);
      expect(result.dueDate).toBe('2026-11-21');
      expect(result.history).toEqual([{ date: TODAY, rating: 'facil' }]);
    });

    it('Caso 4: Passo 3, Errei, vence 2026-10-23 (passo 0, 1 dia)', () => {
      const initial: LessonReview = {
        lessonId: 'aula-1',
        step: 3,
        dueDate: '2026-10-22',
        mastered: false,
        history: [],
      };
      const result = evaluateReview(initial, 'errei', TODAY);
      expect(result.step).toBe(0);
      expect(result.dueDate).toBe('2026-10-23');
      expect(result.history).toEqual([{ date: TODAY, rating: 'errei' }]);
    });

    it('Caso 5: Passo 2, Difícil, vence 2026-10-29 (passo 2, metade de 15 = 7 dias)', () => {
      const initial: LessonReview = {
        lessonId: 'aula-1',
        step: 2,
        dueDate: '2026-10-22',
        mastered: false,
        history: [],
      };
      const result = evaluateReview(initial, 'dificil', TODAY);
      expect(result.step).toBe(2);
      expect(result.dueDate).toBe('2026-10-29');
      expect(result.history).toEqual([{ date: TODAY, rating: 'dificil' }]);
    });

    it('Caso 6: Passo 4, Bom, vence 2026-12-21 (permanece no passo 4, 60 dias)', () => {
      const initial: LessonReview = {
        lessonId: 'aula-1',
        step: 4,
        dueDate: '2026-10-22',
        mastered: false,
        history: [],
      };
      const result = evaluateReview(initial, 'bom', TODAY);
      expect(result.step).toBe(4);
      expect(result.dueDate).toBe('2026-12-21');
      expect(result.history).toEqual([{ date: TODAY, rating: 'bom' }]);
    });

    it('Caso 7a: Espalhar 7 atrasadas com cap 3 por dia: 3 em +1, 2 em +2, 2 em +3', () => {
      const overdue: LessonReview[] = Array.from({ length: 7 }, (_, i) => ({
        lessonId: `aula-${i + 1}`,
        step: 1,
        dueDate: `2026-10-${10 + i}`, // vencimentos antigos
        mastered: false,
        history: [],
      }));

      const spread = spreadOverdueReviews(overdue, 3, TODAY);
      expect(spread.length).toBe(7);

      const d1 = spread.filter((r) => r.dueDate === '2026-10-23');
      const d2 = spread.filter((r) => r.dueDate === '2026-10-24');
      const d3 = spread.filter((r) => r.dueDate === '2026-10-25');

      expect(d1.length).toBe(3);
      expect(d2.length).toBe(2);
      expect(d3.length).toBe(2);
    });

    it('Caso 7b: Espalhar 10 atrasadas com cap 3: usa 4 dias (3, 3, 2, 2)', () => {
      const overdue: LessonReview[] = Array.from({ length: 10 }, (_, i) => ({
        lessonId: `aula-${i + 1}`,
        step: 1,
        dueDate: `2026-10-${10 + i}`,
        mastered: false,
        history: [],
      }));

      const spread = spreadOverdueReviews(overdue, 3, TODAY);
      expect(spread.length).toBe(10);

      const d1 = spread.filter((r) => r.dueDate === '2026-10-23');
      const d2 = spread.filter((r) => r.dueDate === '2026-10-24');
      const d3 = spread.filter((r) => r.dueDate === '2026-10-25');
      const d4 = spread.filter((r) => r.dueDate === '2026-10-26');

      expect(d1.length).toBe(3);
      expect(d2.length).toBe(3);
      expect(d3.length).toBe(2);
      expect(d4.length).toBe(2);
    });
  });

  describe('Testes de borda do motor SRS', () => {
    it('Último passo (passo 4) com Fácil permanece no passo 4 e repete a cada 60 dias', () => {
      const review: LessonReview = {
        lessonId: 'aula-max',
        step: 4,
        dueDate: '2026-10-22',
        mastered: false,
        history: [],
      };
      const result = evaluateReview(review, 'facil', TODAY);
      expect(result.step).toBe(4);
      expect(result.dueDate).toBe('2026-12-21');
    });

    it('Último passo (passo 4) com Difícil divide o intervalo de 60 por 2 (30 dias)', () => {
      const review: LessonReview = {
        lessonId: 'aula-max',
        step: 4,
        dueDate: '2026-10-22',
        mastered: false,
        history: [],
      };
      const result = evaluateReview(review, 'dificil', TODAY);
      expect(result.step).toBe(4);
      expect(result.dueDate).toBe('2026-11-21'); // 30 dias
    });

    it('Último passo (passo 4) com Errei reinicia para o passo 0 (1 dia)', () => {
      const review: LessonReview = {
        lessonId: 'aula-max',
        step: 4,
        dueDate: '2026-10-22',
        mastered: false,
        history: [],
      };
      const result = evaluateReview(review, 'errei', TODAY);
      expect(result.step).toBe(0);
      expect(result.dueDate).toBe('2026-10-23');
    });

    it('Passo 0 com Difícil garante intervalo mínimo de 1 dia (max(1, floor(1/2)))', () => {
      const review: LessonReview = {
        lessonId: 'aula-0',
        step: 0,
        dueDate: '2026-10-22',
        mastered: false,
        history: [],
      };
      const result = evaluateReview(review, 'dificil', TODAY);
      expect(result.step).toBe(0);
      expect(result.dueDate).toBe('2026-10-23');
    });

    it('Acumula histórico de revisões sequenciais sem perder dados anteriores', () => {
      const r1 = createInitialReview('aula-seq', TODAY);
      const r2 = evaluateReview(r1, 'bom', TODAY);
      const r3 = evaluateReview(r2, 'facil', '2026-10-29');

      expect(r3.history.length).toBe(2);
      expect(r3.history[0]).toEqual({ date: TODAY, rating: 'bom' });
      expect(r3.history[1]).toEqual({ date: '2026-10-29', rating: 'facil' });
    });

    it('Espalhar atrasadas ordena a mais antiga primeiro e distribui corretamente', () => {
      const overdue: LessonReview[] = [
        { lessonId: 'recente', step: 1, dueDate: '2026-10-20', mastered: false, history: [] },
        { lessonId: 'muito-antiga', step: 1, dueDate: '2026-10-01', mastered: false, history: [] },
        { lessonId: 'antiga', step: 1, dueDate: '2026-10-15', mastered: false, history: [] },
      ];

      // Com cap 1, cada dia recebe 1
      const spread = spreadOverdueReviews(overdue, 1, TODAY);
      expect(spread[0].lessonId).toBe('muito-antiga');
      expect(spread[0].dueDate).toBe('2026-10-23');
      expect(spread[1].lessonId).toBe('antiga');
      expect(spread[1].dueDate).toBe('2026-10-24');
      expect(spread[2].lessonId).toBe('recente');
      expect(spread[2].dueDate).toBe('2026-10-25');
    });

    it('Espalhar array vazio retorna vazio', () => {
      expect(spreadOverdueReviews([], 5, TODAY)).toEqual([]);
    });

    it('Constante LADDER possui os 5 passos estritos', () => {
      expect(LADDER).toEqual([1, 7, 15, 30, 60]);
    });
  });
});
