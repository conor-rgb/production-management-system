import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DraftProvider } from './store/draftStore.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DraftProvider>
      <App />
    </DraftProvider>
  </StrictMode>,
)
