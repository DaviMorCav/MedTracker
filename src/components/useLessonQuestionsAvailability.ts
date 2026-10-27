import { useEffect, useMemo, useState } from 'react';
import { lessonById } from '../data/curriculum';
import { loadBankIndex } from '../core/questionBank';
import { hasQuestionTheme } from '../core/lessonQuestions';

/**
 * Disponibilidade de questões por aula, checada só com o index.json (18 KB).
 * Não baixa o JSON das matérias: é uma checagem barata para desabilitar o botão.
 * Quando o índice não carrega, devolve 'error' e o botão continua habilitado
 * (o erro real aparece ao abrir a sessão).
 */
export type QuestionAvailability = 'checking' | 'yes' | 'no' | 'error';

const cache = new Map<string, 'yes' | 'no'>();

export function useLessonQuestionsAvailability(
  lessonIds: string[]
): Record<string, QuestionAvailability> {
  // Chave estável: a identidade do array muda a cada render.
  const key = useMemo(() => [...lessonIds].sort().join('|'), [lessonIds]);
  const [state, setState] = useState<Record<string, QuestionAvailability>>({});

  useEffect(() => {
    const ids = key ? key.split('|') : [];
    if (ids.length === 0) {
      setState({});
      return;
    }

    const known: Record<string, QuestionAvailability> = {};
    const pending: string[] = [];
    for (const id of ids) {
      const cached = cache.get(id);
      if (cached) {
        known[id] = cached;
      } else {
        known[id] = 'checking';
        pending.push(id);
      }
    }
    setState(known);

    if (pending.length === 0) return;

    let cancelled = false;
    loadBankIndex()
      .then((index) => {
        if (cancelled) return;
        const next = { ...known };
        for (const id of pending) {
          const lesson = lessonById.get(id);
          const ok = lesson ? hasQuestionTheme(index, lesson) : false;
          cache.set(id, ok ? 'yes' : 'no');
          next[id] = ok ? 'yes' : 'no';
        }
        setState(next);
      })
      .catch(() => {
        if (cancelled) return;
        const next = { ...known };
        for (const id of pending) next[id] = 'error';
        setState(next);
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return useMemo(() => {
    const ids = key ? key.split('|') : [];
    const result: Record<string, QuestionAvailability> = {};
    for (const id of ids) result[id] = state[id] ?? 'checking';
    return result;
  }, [key, state]);
}
