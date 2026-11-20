import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';
import { MiniPlayerApp } from './components/MiniPlayerApp';

const isMiniPlayer =
  typeof window !== 'undefined' && window.location.hash.startsWith('#miniplayer');

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isMiniPlayer ? <MiniPlayerApp /> : <App />}</StrictMode>,
);
