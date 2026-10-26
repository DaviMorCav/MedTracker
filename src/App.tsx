import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HojePage } from './pages/Hoje';
import { ConteudoPage } from './pages/Conteudo';
import { RevisoesPage } from './pages/Revisoes';
import { QuestoesPage } from './pages/Questoes';
import { MaisPage } from './pages/Mais';
import { db, importDriveMedia } from './db';
import { syncSharedHistory } from './services/sharedSync';

export const App: React.FC = () => {
  // Garante persistência permanente do IndexedDB no navegador e carrega mídias
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {});
    }

    async function seedDriveMediaIfEmpty() {
      try {
        const count = await db.lessonMedia.count();
        const apostilaCount = await db.apostilaMedia.count();
        if (count === 0 || apostilaCount === 0) {
          const resp = await fetch('/drive_links.json');
          if (resp.ok) {
            const json = await resp.json();
            await importDriveMedia(json);
          }
        }
      } catch {
        // Silencioso se estiver offline ou se o arquivo não existir
      }

      // Sincroniza automaticamente o histórico compartilhado da nuvem
      syncSharedHistory({ silent: true }).catch(() => {});
    }
    seedDriveMediaIfEmpty();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HojePage />} />
          <Route path="/conteudo" element={<ConteudoPage />} />
          <Route path="/revisoes" element={<RevisoesPage />} />
          <Route path="/questoes" element={<QuestoesPage />} />
          <Route path="/mais" element={<MaisPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
