import '@/node-globals'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppRoot } from '@/components/app-root'

import '@/globals.css'
import '@/fonts.css'

const container = document.getElementById('root')
if (!container) throw new Error('#root not found')

createRoot(container).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
)
