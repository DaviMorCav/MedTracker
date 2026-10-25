/**
 * Formato do pacote de questões gerado por gerar_pacote.py
 * (public/questoes/index.json e public/questoes/<matéria>.json).
 */
export type Confidence = 'certa' | 'alta' | 'dupla';

export interface BankQuestion {
  id: string;
  n: number; // número na lista de origem
  e: string; // enunciado
  a: string[]; // textos das alternativas (A, B, C...)
  g: string; // gabarito (letra)
  c: Confidence; // confiança de que a matéria está certa
  t?: string[]; // temas do banco por matéria (só nas questões "certa")
  i?: string[]; // imagens antes das alternativas
  ia?: string[]; // imagens depois das alternativas
  p?: string[]; // provas onde a questão caiu (ex.: "UFMT 2023")
  ms?: string[]; // todas as matérias, quando há mais de uma
  rv?: 1; // texto pode ter falha de leitura do PDF
}

export interface BankSubjectMeta {
  id: string;
  nome: string;
  arquivo: string;
  total: number;
  certas: number;
  temas: { nome: string; total: number }[];
}

export interface BankIndex {
  versao: number;
  gerado_em: string;
  total: number;
  materias: BankSubjectMeta[];
}
