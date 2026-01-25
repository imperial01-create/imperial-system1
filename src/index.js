import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const rootElement = document.getElementById('root');
const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);

// PWA 기능을 위해 서비스 워커를 등록합니다.
serviceWorkerRegistration.register();