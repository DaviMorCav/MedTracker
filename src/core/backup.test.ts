import { describe, it, expect } from 'vitest';
import { validateBackupJson } from './backup';

describe('Backup Validation (src/core/backup.ts)', () => {
  it('valida backup correto em formato estruturado', () => {
    const validJson = JSON.stringify({
      version: 1,
      exportedAt: '2026-10-22T00:00:00.000Z',
      data: {
        settings: [{ id: 'default', dailyNewLessons: 2, dailyReviewCap: 20, activeSubjects: [], includeBonus: false, questionsUrlTemplate: '' }],
        progress: [{ lessonId: 'aula-1', status: 'concluida' }],
        reviews: [],
        questionLogs: [],
      },
    });

    const res = validateBackupJson(validJson);
    expect(res.valid).toBe(true);
    expect(res.backup?.data.progress?.length).toBe(1);
  });

  it('rejeita arquivo vazio ou em branco', () => {
    expect(validateBackupJson('').valid).toBe(false);
    expect(validateBackupJson('   ').valid).toBe(false);
  });

  it('rejeita JSON mal formatado', () => {
    const res = validateBackupJson('{ chave: "sem valor fechado" ');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('JSON válido');
  });

  it('rejeita JSON que não contém nenhuma tabela do MedTracker', () => {
    const randomJson = JSON.stringify({
      usuario: 'alguem',
      tarefas: [1, 2, 3],
    });
    const res = validateBackupJson(randomJson);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('não contém dados reconhecíveis');
  });

  it('mantém as tentativas de questões quando o backup as contém', () => {
    const json = JSON.stringify({
      version: 1,
      data: {
        progress: [],
        questionAttempts: [
          { id: 1, questionId: 'q1', materia: 'cardiologia', date: '2026-10-25', answeredAt: 1, chosen: 'A', correct: true },
        ],
      },
    });
    const res = validateBackupJson(json);
    expect(res.valid).toBe(true);
    expect(res.backup?.data.questionAttempts).toHaveLength(1);
  });

  it('backup antigo, sem tentativas, deixa o campo ausente (não apaga as atuais)', () => {
    const res = validateBackupJson(JSON.stringify({ data: { progress: [] } }));
    expect(res.valid).toBe(true);
    expect(res.backup?.data.questionAttempts).toBeUndefined();
  });

  it('aceita backup que só tem tentativas de questões', () => {
    const res = validateBackupJson(JSON.stringify({ data: { questionAttempts: [] } }));
    expect(res.valid).toBe(true);
  });
});
