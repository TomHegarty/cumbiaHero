import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Served from https://<user>.github.io/cumbiaHero/ on GitHub Pages.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/cumbiaHero/',
  plugins: [react()],
})
