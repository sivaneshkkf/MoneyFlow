import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker registration is handled by vite-plugin-pwa (registerType:
// 'autoUpdate' in vite.config.js) — it injects its own registration script
// into the built index.html, so no manual navigator.serviceWorker.register
// call is needed here.
