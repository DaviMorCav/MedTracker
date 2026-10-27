import { describe, it, expect } from 'vitest';
import {
  createInitialReview,
  evaluateReview,
  previewReview,
  spreadOverdueReviews,
  isLeeched,
  suggestRating,
  LADDER,
  EASE_MIN,
  EASE_MAX,
  EASE_START,
  REVIEW_RATINGS,
} from './srs';
import type { LessonReview } from '../db/schema';

describe('SRS Engine (src/core/srs.ts)', () => {
  const TODAY = '2026-10-22';
  const NO_FUZZ = { fuzz: false };

  describe('Casos obrigatórios da Seção 7 do PRD (today = 2026-10-22)', () => {
    it('Caso 1: Aula concluída hoje, passo 0, vence 2026-10-23', () => {
      const review = createInitialReview('aula-1', TODAY);
      expect(review.lessonId).toBe('aula-1');
      expect(review.step).toBe(0);
      expect(review.dueDate).toBe('2026-10-23');
      expect(review.mastered).toBe(false);
      expect(review.history).toEqual([]);
      expect(review.ease).toBe(EASE_START);
      expect(review.lapses).toBe(0);
      expect(review.leeched).toBe(false);
    });

    it('Caso 2: Passo 0, Bom, vence 2026-10-29 (passo 1, 7 dias)', () => {
      const initial: LessonReview = {
        lessonId: 'aula-1',
        step: 0,
        dueDate: '2026-10-22',
        mastered: false,
        history: [],
      };
      const result = evaluateReview(initial, 'bom', TODAY, NO_FUZZ);
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
      const result = evaluateReview(initial, 'facil', TODAY, NO_FUZZ);
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
      const result = evaluateReview(initial, 'errei', TODAY, NO_FUZZ);
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
      const result = evaluateReview(initial, 'dificil', TODAY, NO_FUZZ);
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
      const result = evaluateReview(initial, 'bom', TODAY, NO_FUZZ);
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
      const result = evaluateReview(review, 'facil', TODAY, NO_FUZZ);
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
      const result = evaluateReview(review, 'dificil', TODAY, NO_FUZZ);
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
      const result = evaluateReview(review, 'errei', TODAY, NO_FUZZ);
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
      const result = evaluateReview(review, 'dificil', TODAY, NO_FUZZ);
      expect(result.step).toBe(0);
      expect(result.dueDate).toBe('2026-10-23');
    });

    it('Acumula histórico de revisões sequenciais sem perder dados anteriores', () => {
      const r1 = createInitialReview('aula-seq', TODAY);
      const r2 = evaluateReview(r1, 'bom', TODAY, NO_FUZZ);
      const r3 = evaluateReview(r2, 'facil', '2026-10-29', NO_FUZZ);

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

  describe('Facilidade, erros e variação de data', () => {
    const base = (overrides: Partial<LessonReview> = {}): LessonReview => ({
      lessonId: 'aula-1',
      step: 2,
      dueDate: TODAY,
      mastered: false,
      history: [],
      ...overrides,
    });

    it('Com facilidade inicial 2.5, os intervalos são exatamente os da escada do PRD', () => {
      const preview = previewReview(base({ step: 2 }), TODAY, NO_FUZZ);
      expect(preview.errei.intervalDays).toBe(1);
      expect(preview.dificil.intervalDays).toBe(7);
      expect(preview.bom.intervalDays).toBe(30);
      expect(preview.facil.intervalDays).toBe(60);
      expect(preview.errei.easeAfter).toBe(2.3);
      expect(preview.bom.easeAfter).toBe(EASE_START);
    });

    it('Facilidade maior alonga e facilidade menor encurta o intervalo', () => {
      const step2 = base({ step: 2 });
      const low = previewReview({ ...step2, ease: EASE_MIN }, TODAY, NO_FUZZ).bom;
      const mid = previewReview(step2, TODAY, NO_FUZZ).bom;
      const high = previewReview({ ...step2, ease: EASE_MAX }, TODAY, NO_FUZZ).bom;

      expect(low.intervalDays).toBe(16); // 30 * 1.3 / 2.5 = 15.6
      expect(mid.intervalDays).toBe(30);
      expect(high.intervalDays).toBe(36); // 30 * 3.0 / 2.5
    });

    it('Facilidade não passa dos limites 1.3 e 3.0', () => {
      const down = evaluateReview(base({ step: 0, ease: EASE_MIN }), 'errei', TODAY, NO_FUZZ);
      expect(down.ease).toBe(EASE_MIN);

      const up = evaluateReview(base({ step: 0, ease: EASE_MAX }), 'facil', TODAY, NO_FUZZ);
      expect(up.ease).toBe(EASE_MAX);
    });

    it('Fácil aumenta a facilidade e o intervalo da revisão seguinte', () => {
      const easy = evaluateReview(base({ step: 2 }), 'facil', TODAY, NO_FUZZ);
      expect(easy.ease).toBe(2.65);

      const nextBom = previewReview({ ...easy, step: easy.step }, '2026-11-21', NO_FUZZ).bom;
      // Passo 4: 60 * 2.65 / 2.5 = 63.6 -> 64
      expect(nextBom.intervalDays).toBe(64);
    });

    it('Conta erros, marca leech após 4 e mantém a marca', () => {
      let review = base({ step: 2 });
      for (let i = 0; i < 4; i++) {
        review = evaluateReview(review, 'errei', TODAY, NO_FUZZ);
      }
      expect(review.lapses).toBe(4);
      expect(review.leeched).toBe(true);
      expect(review.step).toBe(0);

      const afterBom = evaluateReview(review, 'bom', TODAY, NO_FUZZ);
      expect(afterBom.lapses).toBe(4);
      expect(afterBom.leeched).toBe(true);
    });

    it('Difícil não conta como erro e não cria leech', () => {
      const review = evaluateReview(base({ lapses: 0 }), 'dificil', TODAY, NO_FUZZ);
      expect(review.lapses).toBe(0);
      expect(review.leeched).toBe(false);
    });

    it('Deriva erros do histórico em dados antigos (sem o campo lapses)', () => {
      const antiga = base({
        history: [
          { date: '2026-01-01', rating: 'errei' },
          { date: '2026-01-10', rating: 'bom' },
          { date: '2026-02-01', rating: 'errei' },
          { date: '2026-03-01', rating: 'errei' },
          { date: '2026-04-01', rating: 'errei' },
        ],
      });
      expect(antiga.lapses).toBeUndefined();
      expect(isLeeched(antiga)).toBe(true);
    });

    it('Passo inválido (fora de 0–4 ou NaN) não gera data inválida', () => {
      const casos: { step: number; nextStep: number; dueDate: string }[] = [
        { step: 99, nextStep: 4, dueDate: '2026-12-21' },
        { step: -3, nextStep: 1, dueDate: '2026-10-29' },
        { step: Number.NaN, nextStep: 1, dueDate: '2026-10-29' },
      ];

      for (const caso of casos) {
        const result = evaluateReview(base({ step: caso.step }), 'bom', TODAY, NO_FUZZ);
        expect(result.step).toBe(caso.nextStep);
        expect(result.dueDate).toBe(caso.dueDate);
        expect(result.dueDate).not.toContain('NaN');
      }
    });

    it('A variação de ±5% é determinística e fica dentro do limite', () => {
      const review = base({ step: 4 });
      const first = previewReview(review, TODAY).bom;
      const second = previewReview(review, TODAY).bom;

      expect(first.dueDate).toBe(second.dueDate);
      expect(first.intervalDays).toBeGreaterThanOrEqual(57);
      expect(first.intervalDays).toBeLessThanOrEqual(63);
    });

    it('Prévia e avaliação devolvem a mesma data para as 4 notas', () => {
      const review = base({ step: 2 });
      const preview = previewReview(review, TODAY);

      for (const rating of REVIEW_RATINGS) {
        const result = evaluateReview(review, rating, TODAY);
        expect(result.dueDate).toBe(preview[rating].dueDate);
        expect(result.step).toBe(preview[rating].nextStep);
        expect(result.ease).toBe(preview[rating].easeAfter);
      }
    });
  });

  describe('Sugestão de nota pelas questões', () => {
    it('aplica os cortes de 50, 70 e 90 por cento', () => {
      expect(suggestRating(0, 10)).toBe('errei');
      expect(suggestRating(49, 100)).toBe('errei');
      expect(suggestRating(50, 100)).toBe('dificil');
      expect(suggestRating(69, 100)).toBe('dificil');
      expect(suggestRating(70, 100)).toBe('bom');
      expect(suggestRating(89, 100)).toBe('bom');
      expect(suggestRating(90, 100)).toBe('facil');
      expect(suggestRating(10, 10)).toBe('facil');
    });

    it('sem questões respondidas não sugere nota', () => {
      expect(suggestRating(0, 0)).toBeNull();
      expect(suggestRating(3, 0)).toBeNull();
    });
  });
});
