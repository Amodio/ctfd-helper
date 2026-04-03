import { rollupPluginHTML as html } from '@web/rollup-plugin-html';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.html',

  output: {
    dir: 'build',
    format: 'es',
    sourcemap: true,
  },

  plugins: [
    html({
      minify: true, // built-in HTML minification (safe replacement)
    }),

    nodeResolve(),

    terser({
      ecma: 2021,
      module: true,
    }),
  ],
};
