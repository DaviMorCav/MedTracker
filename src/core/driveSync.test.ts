import { describe, it, expect } from 'vitest';
import { mergeBackupData } from './driveSync';
import type { BackupData } from './backup';

describe('mergeBackupData', () => {
  it('combina aulas concluídas de dispositivos diferentes sem perder nada', () => {
    const localBackup: BackupData = {
      version: 1,
      exportedAt: '2026-10-25T10:00:00.000Z',
      data: {
        progress: [
          { lessonId: 'aula-1', status: 'concluida', completedOn: '2026-10-25' },
          { lessonId: 'aula-2', status: 'nao_vista' },
        ],
      },
    };

    const remoteBackup: BackupData = {
      version: 1,
      exportedAt: '2026-10-25T12:00:00.000Z',
      data: {
        progress: [
          { lessonId: 'aula-2', status: 'concluida', completedOn: '2026-10-25' },
          { lessonId: 'aula-3', status: 'concluida', completedOn: '2026-10-25' },
        ],
      },
    };

    const merged = mergeBackupData(localBackup, remoteBackup);
    const progress = merged.data.progress || [];

    expect(progress).toHaveLength(3);
    expect(progress.find((p) => p.lessonId === 'aula-1')?.status).toBe('concluida');
    expect(progress.find((p) => p.lessonId === 'aula-2')?.status).toBe('concluida');
    expect(progress.find((p) => p.lessonId === 'aula-3')?.status).toBe('concluida');
  });

  it('mantém a revisão mais avançada (maior step)', () => {
    const localBackup: BackupData = {
      version: 1,
      exportedAt: '2026-10-25T10:00:00.000Z',
      data: {
        reviews: [
          {
            lessonId: 'aula-1',
            dueDate: '2026-10-26',
            step: 2,
            mastered: false,
            history: [{ date: '2026-10-25', rating: 'bom' }],
          },
        ],
      },
    };

    const remoteBackup: BackupData = {
      version: 1,
      exportedAt: '2026-10-25T12:00:00.000Z',
      data: {
        reviews: [
          {
            lessonId: 'aula-1',
            dueDate: '2026-11-05',
            step: 3,
            mastered: false,
            history: [
              { date: '2026-10-20', rating: 'bom' },
              { date: '2026-10-25', rating: 'facil' },
            ],
          },
        ],
      },
    };

    const merged = mergeBackupData(localBackup, remoteBackup);
    expect(merged.data.reviews?.[0].step).toBe(3);
    expect(merged.data.reviews?.[0].dueDate).toBe('2026-11-05');
  });

  it('faz união de apostilas lidas e deduplicação de logs de questões', () => {
    const localBackup: BackupData = {
      version: 1,
      exportedAt: '2026-10-25T10:00:00.000Z',
      data: {
        apostila: [{ volumeId: 'v1', page: 1, completed: true }],
        questionLogs: [
          { lessonId: 'aula-1', date: '2026-10-25', total: 10, correct: 9 },
        ],
      },
    };

    const remoteBackup: BackupData = {
      version: 1,
      exportedAt: '2026-10-25T12:00:00.000Z',
      data: {
        apostila: [{ volumeId: 'v1', page: 2, completed: true }],
        questionLogs: [
          // Mesmo log (duplicata de sincronização anterior)
          { lessonId: 'aula-1', date: '2026-10-25', total: 10, correct: 9 },
          // Log novo
          { lessonId: 'aula-2', date: '2026-10-25', total: 15, correct: 12 },
        ],
      },
    };

    const merged = mergeBackupData(localBackup, remoteBackup);
    expect(merged.data.apostila).toHaveLength(2);
    expect(merged.data.questionLogs).toHaveLength(2);
  });

  it('respeita timestamps para atualizações recentes e não apaga anotações locais', () => {
    const localBackup: BackupData = {
      version: 1,
      exportedAt: '2026-10-25T14:00:00.000Z',
      data: {
        progress: [
          {
            lessonId: 'aula-1',
            status: 'concluida',
            completedOn: '2026-10-25',
            notes: 'Anotações importantes feitas hoje',
            updatedAt: 2000,
          },
        ],
        reviews: [
          {
            lessonId: 'aula-1',
            step: 0, // acabou de errar na revisão local
            dueDate: '2026-10-26',
            mastered: false,
            history: [{ date: '2026-10-25', rating: 'errei' }],
            updatedAt: 2000,
          },
        ],
      },
    };

    const remoteBackup: BackupData = {
      version: 1,
      exportedAt: '2026-10-25T12:00:00.000Z',
      data: {
        progress: [
          {
            lessonId: 'aula-1',
            status: 'concluida',
            completedOn: '2026-10-20',
            updatedAt: 1000,
          },
        ],
        reviews: [
          {
            lessonId: 'aula-1',
            step: 2, // step antigo antes do erro local
            dueDate: '2026-10-30',
            mastered: false,
            history: [{ date: '2026-10-20', rating: 'bom' }],
            updatedAt: 1000,
          },
        ],
      },
    };

    const merged = mergeBackupData(localBackup, remoteBackup);
    expect(merged.data.progress?.[0].notes).toBe('Anotações importantes feitas hoje');
    expect(merged.data.reviews?.[0].step).toBe(0);
    expect(merged.data.reviews?.[0].dueDate).toBe('2026-10-26');
  });
});
