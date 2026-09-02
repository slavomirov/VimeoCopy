// import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
// Base sheet FIRST. It was imported last, which put the reset, tokens and utility
// classes at the END of the cascade — so `.container { max-width: 1200px }` silently
// beat every equal-specificity component rule in App.css and ferry.css that tried to
// override it. Base, then components, is the order the rest of the CSS assumes.
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './theme/ThemeProvider.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  // <React.StrictMode>
  <BrowserRouter>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </BrowserRouter>
  // </React.StrictMode>,
)
