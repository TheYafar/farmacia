import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter, MemoryRouter } from 'react-router-dom';
import App from './App';
import './index.css';

try {
  const t = localStorage.getItem('theme');
  if (t) document.documentElement.dataset.theme = t;
} catch { /* sin almacenamiento */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* demo: una sola página que navega en memoria · pages: GitHub Pages, rutas con # para que recargar funcione */}
    {import.meta.env.MODE === 'demo' ? <MemoryRouter><App /></MemoryRouter>
      : import.meta.env.MODE === 'pages' ? <HashRouter><App /></HashRouter>
      : <BrowserRouter><App /></BrowserRouter>}
  </StrictMode>,
);
