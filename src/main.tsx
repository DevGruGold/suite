import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App from './App.tsx'
import './index.css'
import { memoryVectorizationWorker } from './services/memoryVectorizationWorker'
import { CredentialSessionProvider } from './contexts/CredentialSessionContext'

// Start the memory vectorization background worker
memoryVectorizationWorker.start();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <CredentialSessionProvider>
      <App />
    </CredentialSessionProvider>
  </HelmetProvider>
);
