module.exports = {
  env: {
    commonjs: true,
    es2021: true,
    node: true,
  },
  extends: [
    'airbnb-base',
  ],
  parserOptions: {
    ecmaVersion: 12,
  },
  rules: {
  	"max-len": "off",
  	"comma-dangle": "off",
  	"no-console": "off",
  	"spaced-comment": "off",
  	"consistent-return": "off",
  	"prefer-const": "off",
  	"class-methods-use-this": "off",
  	"max-classes-per-file": "off"
  },
};
