const path = require('path');

const cssNext = require('postcss-cssnext');
const cssnano = require('cssnano');

const ExtractTextPlugin = require('extract-text-webpack-plugin');

module.exports = (env = {}) => {
  const extractCSS = new ExtractTextPlugin('css/main.css');

  return {
    entry: './_assets/js/main.js',
    output: {
      path: path.resolve(__dirname, 'assets'),
      filename: 'js/main.js'
    },
    plugins: [
      extractCSS
    ],
    module: {
      rules: [
        {
          test: /\.css$/,
          use: extractCSS.extract([
            {
              loader: 'css-loader',
              options: {
                minimize: !!env.prod,
                importLoaders: 1
              }
            },
            {
              loader: 'postcss-loader',
              options: {
                ident: 'postcss',
                plugins: [ cssNext() ]
              }
            }
          ])
        }
      ]
    },
    resolve: {
      // Treat symlinked modules as if they were actually in `node_modules`
      symlinks: false
    }
  };
};
