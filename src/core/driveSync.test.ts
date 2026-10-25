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
          { lessonId: 'aula-1', status: 'completed', completedOn: '2026-10-25' },
          { lessonId: 'aula-2', status: 'pending' },
        ],
      },
    };

    const remoteBackup: BackupData = {
      version: 1,
      exportedAt: '2026-10-25T12:00:00.000Z',
      data: {
        progress: [
          { lessonId: 'aula-2', status: 'completed', completedOn: '2026-10-25' },
          { lessonId: 'aula-3', status: 'completed', completedOn: '2026-10-25' },
        ],
      },
    };

    const merged = mergeBackupData(localBackup, remoteBackup);
    const progress = merged.data.progress || [];

    expect(progress).toHaveLength(3);
    expect(progress.find((p) => p.lessonId === 'aula-1')?.status).toBe('completed');
    expect(progress.find((p) => p.lessonId === 'aula-2')?.status).toBe('completed');
    expect(progress.find((p) => p.lessonId === 'aula-3')?.status).toBe('completed');
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
            intervalDays: 7,
            mastered: false,
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
            intervalDays: 15,
            mastered: false,
          },
        ],
      },
    };

    const merged = mergeBackupData(localBackup, remoteBackup);
    expect(merged.data.reviews?.[0].step).toBe(3);
    expect(merged.data.reviews?.[0].intervalDays).toBe(15);
  });

  it('faz união de apostilas lidas e deduplicação de logs de questões', () => {
    const localBackup: BackupData = {
      version: 1,
      exportedAt: '2026-10-25T10:00:00.000Z',
      data: {
        apostila: [{ volumeId: 'v1', page: 1, read: true }],
        questionLogs: [
          { lessonId: 'aula-1', date: '2026-10-25', questionsDone: 10, questionsCorrect: 9 },
        ],
      },
    };

    const remoteBackup: BackupData = {
      version: 1,
      exportedAt: '2026-10-25T12:00:00.000Z',
      data: {
        apostila: [{ volumeId: 'v1', page: 2, read: true }],
        questionLogs: [
          // Mesmo log (duplicata de sincronização anterior)
          { lessonId: 'aula-1', date: '2026-10-25', questionsDone: 10, questionsCorrect: 9 },
          // Log novo
          { lessonId: 'aula-2', date: '2026-10-25', questionsDone: 15, questionsCorrect: 12 },
        ],
      },
    };

    const merged = mergeBackupData(localBackup, remoteBackup);
    expect(merged.data.apostila).toHaveLength(2);
    expect(merged.data.questionLogs).toHaveLength(2);
  });
});
