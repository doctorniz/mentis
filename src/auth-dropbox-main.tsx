import '@/node-globals'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DropboxCallback } from '@/auth/dropbox-callback'

import '@/globals.css'
import '@/fonts.css'

// No <Toaster /> here: this route does not go through AppRoot, and Next's root
// layout did not mount one either.
const container = document.getElementById('root')
if (!container) throw new Error('#root not found')

createRoot(container).render(
  <StrictMode>
    <DropboxCallback />
  </StrictMode>,
)
