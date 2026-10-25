import type { BankIndex, BankQuestion } from '../types/questionBank';

/**
 * Carrega o pacote de questões (public/questoes). Cada matéria é baixada só
 * quando é aberta e fica na memória até fechar a aba.
 */

export class QuestionBankUnavailableError extends Error {
  constructor(detail?: string) {
    super(detail ? `Pacote de questões indisponível: ${detail}` : 'Pacote de questões indisponível');
    this.name = 'QuestionBankUnavailableError';
  }
}

function baseUrl(): string {
  const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
  const base = env?.BASE_URL ?? '/';
  return `${base.endsWith('/') ? base : `${base}/`}questoes/`;
}

export function bankImageUrl(path: string): string {
  return `${baseUrl()}${path}`;
}

async function fetchJson<T>(file: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${file}`);
  } catch {
    throw new QuestionBankUnavailableError('sem conexão com o servidor do app');
  }
  if (!res.ok) throw new QuestionBankUnavailableError(`${file} (${res.status})`);
  // Em modo dev o Vite devolve a página do app (HTML) quando o arquivo não existe.
  if ((res.headers.get('content-type') || '').includes('text/html')) {
    throw new QuestionBankUnavailableError(`${file} não encontrado`);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new QuestionBankUnavailableError(`${file} está corrompido`);
  }
}

let indexPromise: Promise<BankIndex> | null = null;
const subjectPromises = new Map<string, Promise<BankQuestion[]>>();

export function loadBankIndex(): Promise<BankIndex> {
  if (!indexPromise) {
    indexPromise = fetchJson<BankIndex>('index.json').catch((err) => {
      indexPromise = null; // permite tentar de novo
      throw err;
    });
  }
  return indexPromise;
}

export function loadBankSubject(arquivo: string): Promise<BankQuestion[]> {
  let p = subjectPromises.get(arquivo);
  if (!p) {
    p = fetchJson<{ materia: string; questoes: BankQuestion[] }>(arquivo)
      .then((d) => d.questoes)
      .catch((err) => {
        subjectPromises.delete(arquivo);
        throw err;
      });
    subjectPromises.set(arquivo, p);
  }
  return p;
}
