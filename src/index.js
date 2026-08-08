import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import { runLayoutDebug } from './utils/layoutDebug';

const rootElement = document.getElementById('root');
const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);

// 주소 끝에 ?debug=layout 을 붙였을 때만 동작합니다. 평소에는 아무 일도 하지 않습니다.
runLayoutDebug();

// PWA 기능을 위해 서비스 워커를 등록합니다.
serviceWorkerRegistration.unregister();