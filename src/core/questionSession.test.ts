import { describe, it, expect } from 'vitest';
import {
  summarizeAttempts,
  filterPool,
  poolCounts,
  pickSession,
  statsBySubject,
  letterOf,
} from './questionSession';
import type { BankQuestion } from '../types/questionBank';

const q = (id: string, c: BankQuestion['c'], t?: string[]): BankQuestion => ({
  id,
  n: 1,
  e: 'Enunciado',
  a: ['x', 'y', 'z', 'w'],
  g: 'A',
  c,
  ...(t ? { t } : {}),
});

const bank = [
  q('1', 'certa', ['Bradiarritmias']),
  q('2', 'certa', ['Choque']),
  q('3', 'alta'),
  q('4', 'dupla'),
  q('5', 'certa', ['Bradiarritmias']),
];

const att = (questionId: string, correct: boolean, answeredAt: number) => ({
  questionId,
  correct,
  answeredAt,
});

describe('summarizeAttempts', () => {
  it('conta tentativas e guarda o resultado da mais recente', () => {
    const m = summarizeAttempts([att('1', false, 100), att('1', true, 300), att('1', false, 200)]);
    expect(m.get('1')).toEqual({ total: 3, lastCorrect: true, lastAt: 300 });
  });

  it('não inventa questões sem tentativa', () => {
    expect(summarizeAttempts([]).size).toBe(0);
  });
});

describe('filterPool', () => {
  const summaries = summarizeAttempts([att('1', true, 1), att('2', false, 1), att('5', false, 1), att('5', true, 2)]);

  it('modo novas: só questões nunca respondidas', () => {
    const r = filterPool(bank, { tema: null, confidence: 'todas', mode: 'novas' }, summaries);
    expect(r.map((x) => x.id)).toEqual(['3', '4']);
  });

  it('modo erradas: só as que a última resposta foi erro', () => {
    const r = filterPool(bank, { tema: null, confidence: 'todas', mode: 'erradas' }, summaries);
    expect(r.map((x) => x.id)).toEqual(['2']);
  });

  it('filtra por tema e ignora questões sem tema', () => {
    const r = filterPool(bank, { tema: 'Bradiarritmias', confidence: 'todas', mode: 'todas' }, summaries);
    expect(r.map((x) => x.id)).toEqual(['1', '5']);
  });

  it('filtra pela classificação da matéria', () => {
    const f = (confidence: 'certas' | 'certas_altas' | 'todas') =>
      filterPool(bank, { tema: null, confidence, mode: 'todas' }, summaries).map((x) => x.id);
    expect(f('certas')).toEqual(['1', '2', '5']);
    expect(f('certas_altas')).toEqual(['1', '2', '3', '5']);
    expect(f('todas')).toEqual(['1', '2', '3', '4', '5']);
  });
});

describe('poolCounts', () => {
  it('conta todas, novas e erradas com tema e classificação aplicados', () => {
    const summaries = summarizeAttempts([att('1', true, 1), att('2', false, 1)]);
    expect(poolCounts(bank, null, 'todas', summaries)).toEqual({ todas: 5, novas: 3, erradas: 1 });
    expect(poolCounts(bank, 'Choque', 'todas', summaries)).toEqual({ todas: 1, novas: 0, erradas: 1 });
  });
});

describe('pickSession', () => {
  it('devolve no máximo o tamanho pedido, sem repetir e sem alterar a lista original', () => {
    const pool = [1, 2, 3, 4, 5, 6];
    const copy = pool.slice();
    const r = pickSession(pool, 4);
    expect(r).toHaveLength(4);
    expect(new Set(r).size).toBe(4);
    expect(pool).toEqual(copy);
  });

  it('se pedir mais do que existe, devolve tudo', () => {
    expect(pickSession([1, 2, 3], 10)).toHaveLength(3);
    expect(pickSession([], 5)).toEqual([]);
    expect(pickSession([1, 2], 0)).toEqual([]);
  });

  it('usa o gerador de números informado (resultado previsível)', () => {
    const r = pickSession([1, 2, 3, 4], 2, () => 0);
    expect(r).toEqual([1, 2]);
  });
});

describe('statsBySubject', () => {
  it('calcula total, acertos e porcentagem por matéria', () => {
    const m = statsBySubject([
      { materia: 'cardiologia', correct: true },
      { materia: 'cardiologia', correct: false },
      { materia: 'cardiologia', correct: true },
      { materia: 'pediatria', correct: false },
    ]);
    expect(m.get('cardiologia')).toEqual({ total: 3, correct: 2, percentage: 67 });
    expect(m.get('pediatria')).toEqual({ total: 1, correct: 0, percentage: 0 });
  });
});

describe('letterOf', () => {
  it('converte índice em letra', () => {
    expect([0, 1, 4].map(letterOf)).toEqual(['A', 'B', 'E']);
  });
});
