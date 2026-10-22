import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HojePage } from './pages/Hoje';
import { ConteudoPage } from './pages/Conteudo';
import { RevisoesPage } from './pages/Revisoes';
import { QuestoesPage } from './pages/Questoes';
import { MaisPage } from './pages/Mais';

export const App: React.FC = () => {
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
