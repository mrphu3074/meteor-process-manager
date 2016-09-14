"use strict";
var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var Promise = require('bluebird');
var child_process_1 = require('child_process');
var tar = require('tar-fs');
var gunzip = require('gunzip-maybe');
var pm2 = require('pm2');
var jsonfile = require('jsonfile');
/**
 * execp - exec promise
 * @param  {array|string} cmd [description]
 */
function execp(cmd) {
    return new Promise(function (resolve, reject) {
        try {
            var cmdStr = _.isArray(cmd) ? cmd.join(' ') : cmd;
            child_process_1.exec(cmdStr, { maxBuffer: 500 * 1024 }, function (e, stdOut) {
                if (e)
                    return reject(e);
                return resolve(stdOut);
            });
        }
        catch (e) {
            return reject(e);
        }
    });
}
exports.execp = execp;
/**
 * Uncompress tarball file
 *
 * @param src {string} tarball file path
 * @param dest {string} destination path
 * @return Promise
 */
function uncompress(src, dest) {
    return new Promise(function (resolve, reject) {
        try {
            var stream = fs.createReadStream(src)
                .pipe(gunzip())
                .pipe(tar.extract(dest));
            stream.on('error', function (e) {
                reject(e);
            });
            stream.on('end', function () {
                resolve();
            });
            stream.on('finish', function () {
                resolve();
            });
        }
        catch (e) {
            return reject(e);
        }
    });
}
exports.uncompress = uncompress;
/**
 * Generate app configuration
 *
 * @return {Object}
 */
function generateAppConfig() {
    return {};
}
exports.generateAppConfig = generateAppConfig;
/**
 * Deploy an app with tarball file
 * Step 1: Prepare + validation
 * Step 2: Uncompress tarball
 * Step 3: Install dependencies
 * Step 4: Generate app settings file
 * Step 5: Remove unnecessary files (tarball, ...)
 * Step 6: Start new app
 */
function deploy(cli, option, tarFile, appSettings) {
    // Step 1
    var buildOption = {
        name: appSettings.name,
        version: appSettings.version,
        instanceName: [appSettings.name, 'rev', appSettings.version].join('_'),
        appDir: path.resolve(option.SOURCE_DIR, appSettings.name),
        verionDir: path.resolve(option.SOURCE_DIR, appSettings.name, 'rev_' + appSettings.version),
        settingFile: path.resolve(option.SOURCE_DIR, appSettings.name, 'rev_' + appSettings.version, 'app.json'),
    };
    // remove existing source before install
    var cleanUp = function () {
        return new Promise(function (resolve, reject) {
            cli.spinner('Step 1: Preparing');
            try {
                execp(['rm', '-rf', buildOption.verionDir])
                    .then(function () {
                    cli.spinner('Step 1: Preparing...Done', true);
                    resolve();
                })
                    .catch(function (e) {
                    cli.spinner('Step 1: Preparing...Failed', true);
                    reject(e);
                });
            }
            catch (e) {
                resolve();
            }
        });
    };
    // Step 2
    var uncompressTask = function () {
        return new Promise(function (resolve, reject) {
            cli.spinner('Step 2: Uncompressing tarball');
            uncompress(tarFile, buildOption.verionDir)
                .then(function () {
                cli.spinner('Step 2: Uncompressing tarball...Done', true);
                resolve();
            })
                .catch(function (e) {
                console.log(e);
                cli.spinner('Step 2: Uncompressing tarball...Failed', true);
                reject(e);
            });
        });
    };
    // Step 3
    var installDependencies = function () {
        return new Promise(function (resolve, reject) {
            var serverPath = buildOption.verionDir + '/bundle/programs/server';
            cli.spinner('Step 3: Installing dependencies');
            execp(['cd', serverPath, '&&', 'npm install --silent'])
                .then(function () {
                cli.spinner('Step 3: Installing dependencies...Done', true);
                resolve();
            })
                .catch(function (e) {
                cli.spinner('Step 3: Installing dependencies...Failed', true);
                reject(e);
            });
        });
    };
    // Step 4
    var generateAppSettings = function () {
        return new Promise(function (resolve, reject) {
            cli.spinner('Step 4: Generating app settings file');
            var env = {
                METEOR_SETTINGS: appSettings.settings
            };
            env = _.extend(appSettings.env, env);
            var settings = {
                name: buildOption.instanceName,
                cwd: path.resolve(buildOption.verionDir, 'bundle'),
                script: 'main.js',
                env: env,
                interpreter: '/usr/local/n/versions/node/4.5.0/bin/node'
            };
            jsonfile.writeFile(buildOption.settingFile, settings, { spaces: 2 }, function (e) {
                if (e) {
                    cli.spinner('Step 4: Generating app settings file...Failed', true);
                    return reject(e);
                }
                else {
                    cli.spinner('Step 4: Generating app settings file...Done', true);
                    return resolve();
                }
            });
        });
    };
    // Step 5
    var removeUnnecessary = function () {
        return new Promise(function (resolve, reject) {
            cli.spinner('Step 5: Remove unnecessary files');
            execp(['rm', '-f', tarFile])
                .then(function () {
                cli.spinner('Step 5: Remove unnecessary files...Done', true);
                resolve();
            })
                .catch(function (e) {
                cli.spinner('Step 5: Remove unnecessary files...Failed', true);
                reject(e);
            });
        });
    };
    // Step 6
    var startApp = function () {
        return new Promise(function (resolve, reject) {
            cli.spinner('Step 6: Starting app');
            execp(['pm2', 'restart', buildOption.settingFile])
                .then(function () {
                cli.spinner('Step 6: Starting app...Done', true);
                resolve();
            })
                .catch(function (e) {
                cli.spinner('Step 6: Starting app...Failed', true);
                reject(e);
            });
        });
    };
    return new Promise(function (resolve, reject) {
        cleanUp()
            .then(uncompressTask)
            .then(installDependencies)
            .then(generateAppSettings)
            .then(removeUnnecessary)
            .then(startApp)
            .then(function () { return resolve(); })
            .catch(function (e) { return reject(e); });
    });
}
exports.deploy = deploy;
/**
 * Update app settings
 *
 * Step : Re-generate app settings file
 * Step : Restart instance
 */
function reconfigure(cli, option, appSettings) {
    return new Promise(function (resolve, reject) {
        // Step 1
        var buildOption = {
            name: appSettings.name,
            version: appSettings.version,
            instanceName: [appSettings.name, 'rev', appSettings.version].join('_'),
            appDir: path.resolve(option.SOURCE_DIR, appSettings.name),
            verionDir: path.resolve(option.SOURCE_DIR, appSettings.name, 'rev_' + appSettings.version),
            settingFile: path.resolve(option.SOURCE_DIR, appSettings.name, 'rev_' + appSettings.version, 'app.json'),
        };
        // Step
        var generateAppSettings = function () {
            return new Promise(function (resolve, reject) {
                cli.spinner('Step 4: Generating app settings file');
                var env = {
                    METEOR_SETTINGS: appSettings.settings
                };
                env = _.extend(appSettings.env, env);
                var settings = {
                    name: buildOption.instanceName,
                    cwd: path.resolve(buildOption.verionDir, 'bundle'),
                    script: 'main.js',
                    env: env
                };
                jsonfile.writeFile(buildOption.settingFile, settings, { spaces: 2 }, function (e) {
                    if (e) {
                        cli.spinner('Step 4: Generating app settings file...Failed', true);
                        return reject(e);
                    }
                    else {
                        cli.spinner('Step 4: Generating app settings file...Done', true);
                        return resolve();
                    }
                });
            });
        };
        var restartApp = function () {
            return new Promise(function (resolve, reject) {
                execp(['pm2', 'restart', buildOption.settingFile])
                    .then(function () { return resolve(); })
                    .catch(function (e) { return reject(e); });
            });
        };
        generateAppSettings()
            .then(restartApp)
            .then(function () { return resolve(); })
            .catch(function (e) { return reject(e); });
    });
}
exports.reconfigure = reconfigure;
function pm2Command(cli, option, appSettings, command, commandOption) {
    var buildOption = {
        name: appSettings.name,
        version: appSettings.version,
        instanceName: [appSettings.name, 'rev', appSettings.version].join('_'),
        appDir: path.resolve(option.SOURCE_DIR, appSettings.name),
        verionDir: path.resolve(option.SOURCE_DIR, appSettings.name, 'rev_' + appSettings.version),
        settingFile: path.resolve(option.SOURCE_DIR, appSettings.name, 'rev_' + appSettings.version, 'app.json'),
    };
    return new Promise(function (resolve, reject) {
        pm2.connect(function (err) {
            if (err) {
                return reject(err);
            }
            pm2.describe(buildOption.instanceName, function (err, info) {
                if (err)
                    return reject(err);
                if (!info.length)
                    return reject(new Error('App not found'));
                var status = info[0]['pm2_env']['status'];
                switch (command) {
                    case 'start':
                        if (status === 'online') {
                            return resolve();
                        }
                        else {
                            pm2.start(buildOption.settingFile, function (err) {
                                if (err)
                                    return reject(err);
                                resolve();
                            });
                        }
                        break;
                    case 'stop':
                        if (status === 'stopped') {
                            return resolve();
                        }
                        else {
                            pm2.stop(buildOption.instanceName, function (err) {
                                console.log(err);
                                if (err)
                                    return reject(err);
                                return resolve();
                            });
                        }
                        break;
                    case 'restart':
                        pm2.restart(buildOption.instanceName, function (err) {
                            if (err)
                                return reject(err);
                            return resolve();
                        });
                        break;
                    default:
                        resolve();
                        break;
                }
            });
        });
    });
}
exports.pm2Command = pm2Command;
