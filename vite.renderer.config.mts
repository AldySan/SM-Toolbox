// SPDX-License-Identifier: GPL-3.0-or-later
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react()],
});
