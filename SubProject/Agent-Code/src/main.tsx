import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AgentCodeApp } from './app/AgentCodeApp';
import './styles/tokens.css';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AgentCodeApp />
  </StrictMode>,
);
