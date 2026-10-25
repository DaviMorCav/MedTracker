import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HojePage } from './pages/Hoje';
import { ConteudoPage } from './pages/Conteudo';
import { RevisoesPage } from './pages/Revisoes';
import { QuestoesPage } from './pages/Questoes';
import { MaisPage } from './pages/Mais';
import { AuthGate } from './components/AuthGate';
import { db, importDriveMedia } from './db';

export const App: React.FC = () => {
  // Carga inicial automática dos links do Google Drive se ainda não estiverem no banco local
  useEffect(() => {
    async function seedDriveMediaIfEmpty() {
      try {
        const count = await db.lessonMedia.count();
        if (count === 0) {
          const resp = await fetch('/drive_links.json');
          if (resp.ok) {
            const json = await resp.json();
            await importDriveMedia(json);
          }
        }
      } catch {
        // Silencioso se estiver offline ou se o arquivo não existir
      }
    }
    seedDriveMediaIfEmpty();
  }, []);

  return (
    <AuthGate>
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
    </AuthGate>
  );
};

export default App;
