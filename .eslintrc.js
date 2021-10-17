module.exports = {
  root: true,
  parser: 'babel-eslint',
  plugins: ['prettier'],
  extends: ['prettier'],
  rules: {
    'prettier/prettier': 'error',
  },
};
