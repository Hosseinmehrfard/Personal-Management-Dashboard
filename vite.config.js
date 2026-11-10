import { defineConfig } from 'vite';
export default defineConfig({server:{host:'127.0.0.1',port:5173,strictPort:true,allowedHosts:['localhost','127.0.0.1'],fs:{strict:true},proxy:{'/api':{target:'http://127.0.0.1:4173',changeOrigin:false},'/health':'http://127.0.0.1:4173'}},build:{outDir:'dist',sourcemap:false},esbuild:{jsx:'automatic'}});
