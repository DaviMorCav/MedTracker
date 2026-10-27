import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  stemOf,
  titleStems,
  findBankSubject,
  matchTemas,
  searchByText,
  findLessonQuestions,
  buildLessonSession,
  hasQuestionTheme,
} from './lessonQuestions';
import type { BankIndex, BankQuestion } from '../types/questionBank';

let seq = 0;
const q = (e: string, t?: string[], c: BankQuestion['c'] = 'certa'): BankQuestion => ({
  id: `q${++seq}`,
  n: seq,
  e,
  a: ['Observar', 'Cardioversão elétrica', 'Amiodarona', 'Adenosina'],
  g: 'A',
  c,
  ...(t ? { t } : {}),
});

const many = (n: number, text: (i: number) => string, t?: string[]) =>
  Array.from({ length: n }, (_, i) => q(text(i), t));

// Banco de mentira: 12 de taquiarritmias com tema, 3 sobre o mesmo assunto sem tema,
// 12 de bradiarritmias e 30 de assuntos variados.
const taqui = many(12, (i) => `Paciente ${i} com taquiarritmia de QRS estreito e instabilidade`, ['Taquiarritmias']);
const taquiSemTema = many(3, (i) => `Caso ${i}: taquiarritmias supraventriculares no pronto-socorro`);
const bradi = many(12, (i) => `Paciente ${i} com bradiarritmia e síncope`, ['Bradiarritmias']);
const outras = many(30, (i) => `Paciente ${i} com dor torácica e dispneia, avalie a conduta`, ['Síndromes Coronarianas']);
const bank = [...taqui, ...taquiSemTema, ...bradi, ...outras];

const temas = [
  { nome: 'Taquiarritmias' },
  { nome: 'Bradiarritmias' },
  { nome: 'Síndromes Coronarianas' },
];

describe('normalização e radicais', () => {
  it('tira acento, maiúscula e pontuação', () => {
    expect(normalizeText('  Fibrilação e Flutter Atrial! ')).toBe('fibrilacao e flutter atrial');
  });

  it('o erro de digitação do título ("Taquiarritimias") dá o mesmo radical do tema', () => {
    expect(stemOf('taquiarritimias')).toBe(stemOf('taquiarritmias'));
    expect(stemOf('pancreatie')).toBe(stemOf('pancreatite'));
  });

  it('ignora palavras genéricas, números e palavras curtas, mas guarda siglas', () => {
    expect(titleStems('Medidas de Saúde Coletiva - Bloco 2')).toEqual(['medida', 'saude', 'coletiv']);
    expect(titleStems('Complicações Pós-IAM')).toContain('iam');
    expect(titleStems('Conceitos Iniciais')).toEqual([]);
  });
});

describe('findBankSubject', () => {
  const index: BankIndex = {
    versao: 1,
    gerado_em: '2026-10-25',
    total: 3,
    materias: [
      { id: 'cardiologia', nome: 'Cardiologia', arquivo: 'cardiologia.json', total: 1, certas: 1, temas: [] },
      { id: 'cirurgia-geral', nome: 'Cirurgia Geral', arquivo: 'cirurgia.json', total: 1, certas: 1, temas: [] },
      { id: 'gastroenterologia', nome: 'Gastroenterologia', arquivo: 'gastro.json', total: 1, certas: 1, temas: [] },
    ],
  };

  it('acha por id ou nome', () => {
    expect(findBankSubject(index, 'cardiologia', 'Cardiologia')?.arquivo).toBe('cardiologia.json');
  });
  it('acha quando um nome contém o outro', () => {
    expect(findBankSubject(index, 'cirurgia', 'Cirurgia')?.arquivo).toBe('cirurgia.json');
  });
  it('usa os apelidos (gastrologia → gastroenterologia)', () => {
    expect(findBankSubject(index, 'gastrologia', 'Gastrologia')?.arquivo).toBe('gastro.json');
  });
  it('devolve null quando a matéria não existe no banco', () => {
    expect(findBankSubject(index, 'dermatologia', 'Dermatologia')).toBeNull();
  });
});

describe('hasQuestionTheme', () => {
  const index: BankIndex = {
    versao: 1,
    gerado_em: '2026-10-25',
    total: 12,
    materias: [
      {
        id: 'cardiologia',
        nome: 'Cardiologia',
        arquivo: 'cardiologia.json',
        total: 12,
        certas: 12,
        temas: [
          { nome: 'Taquiarritmias', total: 12 },
          { nome: 'Bradiarritmias', total: 0 },
        ],
      },
    ],
  };

  it('true quando o tema existe e tem questões', () => {
    expect(
      hasQuestionTheme(index, {
        title: 'Taquiarritmias',
        subjectId: 'cardiologia',
        subjectName: 'Cardiologia',
      })
    ).toBe(true);
  });

  it('false quando o tema existe mas está sem questões', () => {
    expect(
      hasQuestionTheme(index, {
        title: 'Bradiarritmias',
        subjectId: 'cardiologia',
        subjectName: 'Cardiologia',
      })
    ).toBe(false);
  });

  it('false quando a matéria não existe no banco', () => {
    expect(
      hasQuestionTheme(index, {
        title: 'Taquiarritmias',
        subjectId: 'dermatologia',
        subjectName: 'Dermatologia',
      })
    ).toBe(false);
  });

  it('false quando nenhum tema casa com o título', () => {
    expect(
      hasQuestionTheme(index, {
        title: 'Hanseníase',
        subjectId: 'cardiologia',
        subjectName: 'Cardiologia',
      })
    ).toBe(false);
  });
});

describe('matchTemas', () => {
  it('"Eletrocardiograma das Taquiarritimias" casa com o tema Taquiarritmias', () => {
    expect(matchTemas('Eletrocardiograma das Taquiarritimias', temas)).toEqual(['Taquiarritmias']);
  });
  it('não casa com tema de outro assunto', () => {
    expect(matchTemas('Estenose Aórtica', temas)).toEqual([]);
  });
  it('prefere o tema que cobre mais palavras do título', () => {
    const t = [{ nome: 'Insuficiência Cardíaca' }, { nome: 'Insuficiência Aórtica' }, { nome: 'Insuficiência Cardíaca Aguda' }];
    expect(matchTemas('Insuficiência Cardíaca 1', t)).toEqual(['Insuficiência Cardíaca']);
  });
});

describe('searchByText', () => {
  it('acha questões que falam do assunto, mesmo sem tema', () => {
    const r = searchByText('Taquiarritimias', bank);
    const ids = new Set(r.map((x) => x.id));
    expect(taquiSemTema.every((x) => ids.has(x.id))).toBe(true);
    expect(bradi.some((x) => ids.has(x.id))).toBe(false);
  });
  it('ignora palavra que aparece em quase todas as questões', () => {
    expect(searchByText('Paciente', bank)).toEqual([]);
  });
  it('título só com palavras genéricas não traz nada', () => {
    expect(searchByText('Conceitos Iniciais', bank)).toEqual([]);
  });
});

describe('findLessonQuestions', () => {
  it('usa o tema quando ele tem questões suficientes', () => {
    const r = findLessonQuestions('Eletrocardiograma das Taquiarritimias', temas, bank);
    expect(r.via).toBe('tema');
    expect(r.temas).toEqual(['Taquiarritmias']);
    expect(r.questions.length).toBeGreaterThanOrEqual(12);
    expect(r.questions.some((x) => bradi.includes(x))).toBe(false);
  });

  it('completa com a busca no texto quando o tema tem poucas questões', () => {
    const poucas = [...taqui.slice(0, 4), ...taquiSemTema, ...bradi, ...outras];
    const r = findLessonQuestions('Taquiarritimias', temas, poucas);
    expect(r.via).toBe('tema');
    expect(r.fromText).toBe(3);
    expect(r.questions).toHaveLength(7);
  });

  it('sem tema no banco, resolve só pela busca no texto', () => {
    const r = findLessonQuestions('Taquiarritimias', [], bank);
    expect(r.via).toBe('texto');
    expect(r.questions.length).toBeGreaterThan(0);
  });

  it('devolve "nenhum" quando não acha nada', () => {
    const r = findLessonQuestions('Hanseníase', temas, bank);
    expect(r.via).toBe('nenhum');
    expect(r.questions).toEqual([]);
  });

  it('o ajuste manual por aula manda no casamento automático', () => {
    const r = findLessonQuestions('Qualquer título', temas, bank, ['Bradiarritmias']);
    expect(r.via).toBe('tema');
    expect(r.questions).toHaveLength(12);
  });
});

describe('buildLessonSession', () => {
  const pool = [q('a'), q('b'), q('c'), q('d'), q('e')];
  const sum = (lastCorrect: boolean) => ({ total: 1, lastCorrect, lastAt: 1 });

  it('começa pelas novas, depois as erradas, depois as acertadas', () => {
    const summaries = new Map([
      [pool[0].id, sum(true)],
      [pool[1].id, sum(false)],
    ]);
    const r = buildLessonSession(pool, summaries, 5, new Set(), () => 0);
    const ids = r.map((x) => x.id);
    expect(new Set(ids.slice(0, 3))).toEqual(new Set([pool[2].id, pool[3].id, pool[4].id]));
    expect(ids[3]).toBe(pool[1].id);
    expect(ids[4]).toBe(pool[0].id);
  });

  it('respeita o tamanho pedido e não repete questão', () => {
    const r = buildLessonSession(pool, new Map(), 3);
    expect(r).toHaveLength(3);
    expect(new Set(r.map((x) => x.id)).size).toBe(3);
  });

  it('não devolve as que já foram feitas nesta rodada', () => {
    const r = buildLessonSession(pool, new Map(), 5, new Set([pool[0].id, pool[1].id]));
    expect(r).toHaveLength(3);
    expect(r.some((x) => x.id === pool[0].id)).toBe(false);
  });

  it('deixa de fora as de matéria duvidosa quando há outras', () => {
    const mixed = [q('x', undefined, 'dupla'), q('y')];
    expect(buildLessonSession(mixed, new Map(), 5).map((x) => x.e)).toEqual(['y']);
    const soDupla = [q('x', undefined, 'dupla')];
    expect(buildLessonSession(soDupla, new Map(), 5)).toHaveLength(1);
  });
});
