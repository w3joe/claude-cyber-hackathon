import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { archifyPlugin } from './server/archify.mjs';
export default defineConfig({ plugins: [react(), archifyPlugin()], base: './' });
