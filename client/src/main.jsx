import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { getActiveOrganization } from './config/organizations.js'

document.documentElement.lang = 'ru'
document.title = `MedSign — ${getActiveOrganization().shortName}`

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
