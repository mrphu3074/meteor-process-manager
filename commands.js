var fs = require('fs');
var _ = require('lodash');
var Promise = require('bluebird');
var pm2 = require('pm2');
var jsonfile = require('jsonfile');
var tarGz = require('tar.gz');
var tar = require('tar-fs');
var gunzip = require('gunzip-maybe');
var exec = require('child_process').exec;

/**
 * Promise func to execute command
 * @param  {array|string} cmd [description]
 */
function execCMD(cmd) {
	return new Promise(function(resolve, reject) {
		try {
			cmd = _.isArray(cmd) ? cmd.join(' ') : cmd;
			exec(cmd, { maxBuffer: 500 * 1024 }, function(e, stdOut) {
				if (e) return reject(e);
				return resolve(stdOut);
			});
		} catch (e) {
			return reject(e);
		}
	});
}

/**
 * Promise function to uncompress tarball
 * @param  {string} filePath
 * @param  {string} destPath
 */
function uncompress(filePath, destPath) {
	return new Promise(function(resolve, reject) {
		try {
			var stream = fs.createReadStream(filePath)
				.pipe(gunzip())
				.pipe(tar.extract(destPath));

			stream.on('error', function(e) {
				reject(e);
			});
			stream.on('end', function() {
				resolve();
			});
			stream.on('finish', function() {
				resolve();
			});
		} catch (e) {
			return reject(e);
		}
	});
}

/**
 * Move tarball
 * @param  {[type]} app [description]
 * @return {[type]}     [description]
 */
function moveTarball(app) {
	return new Promise(function(resolve, reject) {
		var src = app.getFileSource();
		var dest = app.getBinaryPath();
		try {
			fs.rename(src, dest, function(err) {
				if (err) {
					return reject(err);
				} else {
					return resolve(app);
				}
			});
		} catch (e) {
			return reject(e);
		}
	});
}

/**
 * Task uncompress tarball
 */
function unCompress(app) {
	return new Promise(function(resolve, reject) {
		try {
			var src = app.getBinaryPath();
			var dest = app.config.BUILD_DIR;
			app.cli.spinner('Uncompessing...');
			uncompress(src, dest)
				.then(function() {
					app.cli.spinner('Uncompessing...Done', true);
					return resolve(app);
				})
				.catch(function(e) {
					app.cli.spinner('Uncompessing...Failed', true);
					return reject(e);
				});
		} catch (e) {
			return reject(e);
		}
	});
}

function removeBinary(app) {
	return new Promise(function(resolve, reject) {
		try {
			var src = app.getBinaryPath();
			fs.unlink(src, function(e) {
				if(e) return reject(e);
				resolve(app);
			});

		} catch(e) {
			reject(e);
		}
	});
}

function renameBundle(app) {
	return new Promise(function(resolve, reject) {
		try {
			var src = app.config.BUILD_DIR + '/bundle';
			var dest = app.getBuildPath();
			fs.rename(src, dest, function(err) {
				if (err) {
					return reject(err);
				}
				return resolve(app);
			});
		} catch (e) {
			return reject(e);
		}
	});
}

/**
 * Install dependencies
 * @param  {[type]} app [description]
 * @return {[type]}     [description]
 */
function installBundle(app) {
	return new Promise(function(resolve, reject) {
		try {
			var buildPath = app.getBuildPath();
			var serverPath = buildPath + '/programs/server';

			var installFiber = function() {
				return new Promise(function(resolve, reject) {
					execCMD(['cd', serverPath, '&&', 'npm install --silent'])
						.then(function() { resolve() })
						.catch(function(e) { reject(e) });
				});
			}

			var removeOldBcrypt = function() {
				return new Promise(function(resolve, reject) {
					var bcryptPath = serverPath + '/npm/node_modules/meteor/npm-bcrypt/node_modules/bcrypt';
					execCMD(['rm', '-rf', bcryptPath])
						.then(function() { resolve() })
						.catch(function(e) { reject(e) });
				});
			}

			var installNewBcrypt = function() {
				return new Promise(function(resolve, reject) {
					var npmBcryptPath = serverPath + '/npm/node_modules/meteor/npm-bcrypt';
					execCMD(['cd', npmBcryptPath, '&&', 'npm install bcrypt --silent'])
						.then(function() { resolve() })
						.catch(function(e) { reject(e) });
				});
			}

			app.cli.spinner('Installing...');
			Promise.resolve(null)
				.then(installFiber)
				.then(removeOldBcrypt)
				.then(installNewBcrypt)
				.then(function() {
					app.cli.spinner('Installing...Done', true);
					resolve(app);
				})
				.catch(function(e) {
					app.cli.spinner('Installing...Failed', true);
					reject(e);
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
function startBundle(app) {
	return new Promise(function(resolve, reject) {
		try {
			var appFile = app.getBuildPath() + '/settings.json';

			app.cli.spinner('App starting...');
			execCMD(['pm2', 'start', appFile])
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

/**
 * Create pm2 settings file
 * @param  {[type]} app [description]
 * @return {[type]}     [description]
 */
function initSettings(app) {
	return new Promise(function(resolve, reject) {
		try {
			var buildPath = app.getBuildPath();
			var settingFile = app.getBuildPath() + '/settings.json';
			var appSettings = app.appSettings;
			var env = appSettings.env;
			env.METEOR_SETTINGS = appSettings.settings;

			var settings = {
				name: appSettings.name,
				cwd: buildPath,
				script: 'main.js',
				env: env
			};

			jsonfile.writeFile(settingFile, settings, { spaces: 2 }, function(err) {
				if (err) {
					return reject(err);
				} else {
					return resolve(app);
				}
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
					execCMD(['pm2', 'start', settingFile])
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
	moveTarball: moveTarball,
	unCompress: unCompress,
	renameBundle: renameBundle,
	removeBinary: removeBinary,
	installBundle: installBundle,
	initSettings: initSettings,
	startBundle: startBundle,
	reconfigure: reconfigure,
};
