import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { Buffer } from 'buffer'

export default defineConfig({
  resolve: {
    alias: {
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
      assert: 'assert',
      http: 'stream-http',
      https: 'https-browserify',
      os: 'os-browserify',
      url: 'url',
      util: 'util/', // Add an alias for the "util" module. For reasons I don't understand, without the '/' after, this throws errors
    },
  },
  plugins: [react()],
  server: {
    cors: false,
    proxy: {
      '/sandbox/:path*': {
        target: 'http://localhost:20000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sandbox/, ''),
      },
    },
  },
  // server: {
  //   port: 3000,
  //In case of a local sandbox, you will have to
  // },
  define: {
    'process.env': {},
    Buffer: [Buffer],
  },
})
