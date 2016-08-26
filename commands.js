var fs = require('fs');
var _ = require('lodash');
var Promise = require('bluebird');
var pm2 = require('pm2');
var jsonfile = require('jsonfile');
var exec = require('child_process').exec;
var utils = require('./utils');


/**
 * Initial config when deploy
 * @param  {[type]} cli      [description]
 * @param  {[type]} settings [description]
 * @param  {[type]} file     [description]
 * @return {[type]}          [description]
 */
function initDeploy(cli, cliOptions, appSettings, file) {
	var data = {
		cli: cli,
		appName: appSettings.name,
		appVersion: appSettings.version,
		buildName: utils.getBuildName(appSettings),
		appSettings: appSettings,
		getBinaryPath: function() {
			return file.path;
		},
		getAppPath: function() {
			return cliOptions.buildPath + '/' + utils.getBuildName(appSettings);
		}
	};

	return new Promise(function(resolve, reject) {
		return resolve(data);
	});
}

/**
 * Deploy command
 * @param  {[type]} config [description]
 * @return {[type]}        [description]
 */
function deploy(config) {
	return new Promise(function(resolve, reject) {
		try {
			var cli  = config.cli;
			var binaryPath = config.getBinaryPath();
			var appPath = config.getAppPath();
			var appSettings = config.appSettings;

			var uncompress = function() {
				return new Promise(function(resolve, reject) {
					try {
						cli.info('Step 1: Uncompress tarball');
						cli.spinner('Uncompessing...');
						utils.uncompress(binaryPath, appPath)
							.then(function() {
								cli.spinner('Step 1...Done', true);
								return resolve(config);
							})
							.catch(function(e) {
								cli.spinner('Step 1...Failed', true);
								return reject(e);
							});
					} catch (e) {
						return reject(e);
					}
				});
			}

			function removeBinary() {
				return new Promise(function(resolve, reject) {
					try {
						fs.unlink(binaryPath, function(e) {
							if (e) return reject(e);
							resolve();
						});
					} catch (e) {
						reject(e);
					}
				});
			}

			var installDependencies = function() {
				return new Promise(function(resolve, reject) {
					try {
						var serverPath = appPath + '/bundle/programs/server';

						var installFiber = function() {
							return new Promise(function(resolve, reject) {
								utils.execCMD(['cd', serverPath, '&&', 'npm install --silent'])
									.then(function() { resolve() })
									.catch(function(e) { reject(e) });
							});
						}

						var removeOldBcrypt = function() {
							return new Promise(function(resolve, reject) {
								var bcryptPath = serverPath + '/npm/node_modules/meteor/npm-bcrypt/node_modules/bcrypt';
								utils.execCMD(['rm', '-rf', bcryptPath])
									.then(function() { resolve() })
									.catch(function(e) { reject(e) });
							});
						}

						var installNewBcrypt = function() {
							return new Promise(function(resolve, reject) {
								var npmBcryptPath = serverPath + '/npm/node_modules/meteor/npm-bcrypt';
								utils.execCMD(['cd', npmBcryptPath, '&&', 'npm install bcrypt --silent'])
									.then(function() { resolve() })
									.catch(function(e) { reject(e) });
							});
						}

						cli.info('Step 2: Installation');
						cli.spinner('Installing...');
						Promise.resolve(null)
							.then(installFiber)
							.then(function() {
								cli.spinner('Installing...Done', true);
								resolve();
							})
							.catch(function(e) {
								cli.spinner('Installing...Failed', true);
								reject(e);
							});
					} catch (e) {
						return reject(e);
					}
				});
			}

			var initPm2Config = function() {
				return new Promise(function(resolve, reject) {
					cli.info('Step 3: Init config');
					cli.spinner('Init...');

					var configFile = appPath + '/app.json';
					var config = utils.getPm2Config(appPath + '/bundle', appSettings);
					jsonfile.writeFile(configFile, config, { spaces: 2 }, function(err) {
						if (err) {
							cli.spinner('Init...Failed', true);
							return reject(err);
						} else {
							cli.spinner('Init...Done', true);
							return resolve();
						}
					});
				});
			}


			Promise.resolve(null)
				.then(uncompress)
				.then(removeBinary)
				.then(installDependencies)
				.then(initPm2Config)
				.then(() => startApp(config))
				.then(function() {
					resolve();
				})
				.catch(function(e) {
					reject({
						name: config.appName,
						version: config.appVersion,
						error: e,
					});
				});
		} catch (e) {
			return reject(e);
		}
	});
}

/**
 * Start new bundle
 * @param  {[type]} app [description]
 * @return {[type]}     [description]
 */
function startApp(app) {
	return new Promise(function(resolve, reject) {
		try {
			var appFile = app.getAppPath() + '/app.json';

			app.cli.spinner('App starting...');
			utils.execCMD(['pm2', 'start', appFile])
				.then(function() {
					app.cli.spinner('App started', true);
					resolve(app);
				})
				.catch(function(e) {
					app.cli.spinner('App starting...Failed', true);
					reject(e);
				});
		} catch (e) {
			return reject(e);
		}
	});
}

function reconfigure(app) {
	return new Promise(function(resolve, reject) {
		try {
			var appSettings = app.appSettings;
			var settingFile = buildPath + '/settings.json';

			var pm2Connect = function() {
				return new Promise(function(resolve, reject) {
					pm2.connect(function(e) {
						if (e) return reject(e);
						return resolve();
					});
				});
			}

			var pm2ListInstances = function() {
				return new Promise(function(resolve, reject) {
					pm2.list(function(e, instances) {
						if (e) return reject(e);
						return resolve(instances);
					});
				});
			}

			var pm2GetAppInstance = function(instances) {
				return new Promise(function(resolve, reject) {
					var instance = _.find(apps, function(ins) {
						return ins.name == appSettings.name;
					});

					if (!instance) return reject(new Error('App not found'));
					return resolve(instance);
				});
			}

			var initSettings = function(instance) {
				return new Promise(function(resolve, reject) {
					var buildPath = instance.pm2_env.cwd;
					var env = appSettings.env;
					env.METEOR_SETTINGS = appSettings.settings;

					var settings = {
						name: appSettings.name,
						cwd: buildPath,
						script: 'main.js',
						env: env
					};
					jsonfile.writeFile(settingFile, settings, { spaces: 2 }, function(e) {
						if (e) return reject(e);
						resolve();
					});
				});
			}

			var restartInstance = function() {
				return new Promise(function(resolve, reject) {
					utils.execCMD(['pm2', 'start', settingFile])
						.then(function() {
							resolve();
						})
						.catch(function(e) {
							reject(e);
						});
				});
			}

			app.cli.spinner('App configuring...');
			pm2Connect()
				.then(pm2ListInstances)
				.then(pm2GetAppInstance)
				.then(initSettings)
				.then(restartInstance)
				.then(function() {
					app.cli.spinner('App configuring...Done', true);
					resolve(app);
				})
				.catch(function(e) {
					app.cli.spinner('App configuring...Failed', true);
					reject(e);
				});
		} catch (e) {
			return reject(e);
		}

	});
}

module.exports = {
	initDeploy: initDeploy,
	deploy: deploy,
	reconfigure: reconfigure,
};
