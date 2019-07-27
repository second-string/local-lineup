const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');
const paths = require('./config/paths');
const CleanWebpackPlugin = require('clean-webpack-plugin');

process.env.NODE_ENV = 'development';

module.exports = {
	mode: 'development',
	entry: {
		// common: [
		// 	'webpack/hot/dev-server',
	 //    	'webpack-hot-middleware/client'
  //   	],
		app: paths.appIndexJs,
		spotify: paths.spotifySearchJs,
    venue: paths.venueSearchJs
	},
	devServer: {
		publicPath: '/',
		hot: true,
		// https: true,
		open: true
	},
	module: {
		rules: [
			// application JS.
            //  JSX, Flow, TypeScript, and some ESnext features.
            {
              test: /\.(js|mjs|jsx|ts|tsx)$/,
              include: paths.appSrc,
              loader: require.resolve('babel-loader'),
              /*
              options: {
                customize: require.resolve(
                  'babel-preset-react-app/webpack-overrides'
                ),
                plugins: [
                  [
                    require.resolve('babel-plugin-named-asset-import'),
                    {
                      loaderMap: {
                        svg: {
                          ReactComponent:
                            '@svgr/webpack?-prettier,-svgo![path]',
                        },
                      },
                    },
                  ],
                ],
                // This is a feature of `babel-loader` for webpack (not Babel itself).
                // It enables caching results in ./node_modules/.cache/babel-loader/
                // directory for faster rebuilds.
                cacheDirectory: true,
                cacheCompression: isEnvProduction,
                compact: isEnvProduction,
              },
              */
            },
            // CSS
            {
            	test: /\.css$/,
            	use: [
	            	'style-loader',
	            	'css-loader'
            	]
            }
    	]
    },
    output: {
    	path: paths.devBuild,
    	pathinfo: true,
    	filename: 'static/js/[name].js',
    	chunkFilename: 'static/js/[name].chunk.js',
    	publicPath: '/'
    },
	plugins: [
		new CleanWebpackPlugin(),
		new HtmlWebpackPlugin({
			template: paths.appHtml,
			filename: 'index.html',
			chunks: ['app'],
			inject: true
		}),
		new HtmlWebpackPlugin({
			template: paths.spotifyHtml,
			filename: 'spotify-search.html',
			chunks: ['spotify'],
			inject: true
		}),
		new HtmlWebpackPlugin({
			template: 'public/show-finder.html',
			filename: 'show-finder.html',
			chunks: [],
		}),
    new HtmlWebpackPlugin({
      template: paths.venueHtml,
      filename: 'venue-search.html',
      chunks: ['venue'],
      inject: true
    }),
    new HtmlWebpackPlugin({
      template: paths.emailDeleteSuccessHtml,
      filename: 'email-delete-success.html',
      chunks: [],
    })
	]
};