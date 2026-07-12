import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import vueA11y from 'eslint-plugin-vuejs-accessibility'

export default [
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  ...vueA11y.configs['flat/recommended'],
  {
    files: ['**/*.{js,mjs,ts,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'vuejs-accessibility/label-has-for': 'warn',
      'vuejs-accessibility/click-events-have-key-events': 'warn',
      'no-unused-vars': 'off',
    },
  },
  {
    ignores: ['.output/**', 'node_modules/**', '.nuxt/**'],
  },
]
