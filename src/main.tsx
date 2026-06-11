import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { browserApiMock } from './lib/browser-api-mock'

// ブラウザモードでは Electron preload が走らないため window.api が存在しない
if (!window.api) {
  window.api = browserApiMock
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
