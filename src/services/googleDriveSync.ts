/**
 * Serviço de sincronização com o Google Drive via Google Identity Services (GIS).
 * 100% executado no navegador do usuário, sem nenhum servidor intermediário.
 * Utiliza o escopo seguro `drive.file` (só acessa o arquivo criado pelo próprio app).
 */

import type { BackupData } from '../core/backup';

const SYNC_FILENAME = 'medtracker_sync.json';
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => {
            requestAccessToken: (options?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

/** Carrega o script Google Identity Services se ainda não estiver presente */
export function loadGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.getElementById('google-gis-script');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar Google GIS')));
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-gis-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar script do Google.'));
    document.head.appendChild(script);
  });
}

/** Solicita token de acesso OAuth ao usuário */
export async function requestGoogleAccessToken(clientId: string): Promise<string> {
  await loadGsiScript();

  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services não está disponível.');
  }

  return new Promise((resolve, reject) => {
    const tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_FILE_SCOPE,
      callback: (res) => {
        if (res.error) {
          reject(new Error(`Erro de autenticação Google: ${res.error}`));
        } else if (res.access_token) {
          resolve(res.access_token);
        } else {
          reject(new Error('Nenhum token retornado pelo Google.'));
        }
      },
    });

    tokenClient.requestAccessToken({ prompt: '' });
  });
}

/** Localiza o ID do arquivo medtracker_sync.json no Google Drive */
export async function findSyncFileId(accessToken: string): Promise<string | null> {
  const query = encodeURIComponent(`name = '${SYNC_FILENAME}' and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Falha ao buscar arquivo no Drive: ${err}`);
  }

  const data = await res.json();
  const file = data.files?.[0];
  return file ? file.id : null;
}

/** Baixa os dados de backup do Google Drive */
export async function downloadSyncFromDrive(
  accessToken: string,
  fileId: string
): Promise<BackupData | null> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error('Não foi possível ler o arquivo de sincronização do Drive.');
  }

  const json = await res.json();
  return json as BackupData;
}

/** Envia os dados de backup para o Google Drive (cria novo ou substitui existente) */
export async function uploadSyncToDrive(
  accessToken: string,
  backupData: BackupData,
  existingFileId: string | null
): Promise<string> {
  const bodyContent = JSON.stringify(backupData, null, 2);

  if (existingFileId) {
    // Atualiza arquivo existente
    const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`;
    const res = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: bodyContent,
    });

    if (!res.ok) {
      throw new Error('Falha ao atualizar arquivo no Google Drive.');
    }

    const data = await res.json();
    return data.id || existingFileId;
  } else {
    // Cria novo arquivo com multipart
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: SYNC_FILENAME,
      mimeType: 'application/json',
    };

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      bodyContent +
      closeDelimiter;

    const createUrl =
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const res = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    if (!res.ok) {
      throw new Error('Falha ao criar arquivo de sincronização no Google Drive.');
    }

    const data = await res.json();
    return data.id;
  }
}
