import { rollupPluginHTML as html } from '@web/rollup-plugin-html';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

const isProd = process.env.NODE_ENV === 'prod';

export default {
  input: 'src/index.html',

  output: {
    dir: 'build',
    format: 'es',
    sourcemap: !isProd,
    entryFileNames: isProd ? '[name]-[hash].js' : '[name].js',
    chunkFileNames: isProd ? '[name]-[hash].js' : '[name].js',
  },

  preserveEntrySignatures: false,

  plugins: [
    html({
      minify: isProd,
    }),

    nodeResolve({
      browser: true,
      preferBuiltins: false,
    }),

    isProd &&
      terser({
        ecma: 2021,
        module: true,
      }),
  ].filter(Boolean),
};
