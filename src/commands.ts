import * as fs from 'fs';
import * as path from 'path';
import * as _ from 'lodash';
import * as Promise from 'bluebird';
import { exec } from 'child_process';

var tar = require('tar-fs');
var gunzip = require('gunzip-maybe');
var pm2 = require('pm2');
var jsonfile = require('jsonfile');

/**
 * execp - exec promise
 * @param  {array|string} cmd [description]
 */
export function execp(cmd: string | string[]): Promise<Object> {
  return new Promise(function (resolve, reject) {
    try {
      const cmdStr = _.isArray(cmd) ? cmd.join(' ') : cmd;
      exec(cmdStr, { maxBuffer: 500 * 1024 }, function (e, stdOut) {
        if (e) return reject(e);
        return resolve(stdOut);
      });
    } catch (e) {
      return reject(e);
    }
  });
}

/**
 * Uncompress tarball file
 * 
 * @param src {string} tarball file path
 * @param dest {string} destination path
 * @return Promise
 */
export function uncompress(src: string, dest: string): Promise<Object> {
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
    } catch (e) {
      return reject(e);
    }
  });
}

/**
 * Generate app configuration
 * 
 * @return {Object}
 */
export function generateAppConfig(): Object {
  return {};
}

/**
 * Deploy an app with tarball file
 * Step 1: Prepare + validation
 * Step 2: Uncompress tarball
 * Step 3: Install dependencies
 * Step 4: Generate app settings file
 * Step 5: Remove unnecessary files (tarball, ...)
 * Step 6: Start new app
 */
export function deploy(cli: ICli, option: IAppOption, tarFile: string, appSettings: IAppSettings): Promise<Object> {
  // Step 1
  const buildOption = {
    name: appSettings.name,
    version: appSettings.version,
    instanceName: [appSettings.name, 'rev', appSettings.version].join('_'),
    appDir: path.resolve(option.SOURCE_DIR, appSettings.name),
    verionDir: path.resolve(option.SOURCE_DIR, appSettings.name, 'rev_' + appSettings.version),
    settingFile: path.resolve(option.SOURCE_DIR, appSettings.name, 'rev_' + appSettings.version, 'app.json'),
  };

  // remove existing source before install
  const cleanUp = function () {
    return new Promise((resolve, reject) => {
      cli.spinner('Step 1: Preparing');
      try {
        execp(['rm', '-rf', buildOption.verionDir])
          .then(() => {
            cli.spinner('Step 1: Preparing...Done', true);
            resolve();
          })
          .catch(e => {
            cli.spinner('Step 1: Preparing...Failed', true);
            reject(e);
          });
      } catch (e) {
        resolve();
      }
    });
  }

  // Step 2
  const uncompressTask = function () {
    return new Promise((resolve, reject) => {
      cli.spinner('Step 2: Uncompressing tarball');
      uncompress(tarFile, buildOption.verionDir)
        .then(() => {
          cli.spinner('Step 2: Uncompressing tarball...Done', true);
          resolve();
        })
        .catch(e => {
          console.log(e);
          cli.spinner('Step 2: Uncompressing tarball...Failed', true);
          reject(e);
        });
    });
  }

  // Step 3
  const installDependencies = function () {
    return new Promise((resolve, reject) => {
      var serverPath = buildOption.verionDir + '/bundle/programs/server';
      cli.spinner('Step 3: Installing dependencies');
      execp(['cd', serverPath, '&&', 'npm install --silent'])
        .then(() => {
          cli.spinner('Step 3: Installing dependencies...Done', true);
          resolve();
        })
        .catch(e => {
          cli.spinner('Step 3: Installing dependencies...Failed', true);
          reject(e);
        });
    });
  }

  // Step 4
  const generateAppSettings = function () {
    return new Promise((resolve, reject) => {
      cli.spinner('Step 4: Generating app settings file');

      let env: Object = {
        METEOR_SETTINGS: appSettings.settings
      };
      env = _.extend(appSettings.env, env);

      const settings = {
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
        } else {
          cli.spinner('Step 4: Generating app settings file...Done', true);
          return resolve();
        }
      });
    });
  }

  // Step 5
  const removeUnnecessary = function () {
    return new Promise((resolve, reject) => {
      cli.spinner('Step 5: Remove unnecessary files');
      execp(['rm', '-f', tarFile])
        .then(() => {
          cli.spinner('Step 5: Remove unnecessary files...Done', true);
          resolve();
        })
        .catch(e => {
          cli.spinner('Step 5: Remove unnecessary files...Failed', true);
          reject(e);
        })
    });
  }

  // Step 6
  const startApp = function () {
    return new Promise((resolve, reject) => {
      cli.spinner('Step 6: Starting app');
      execp(['pm2', 'restart', buildOption.settingFile])
        .then(() => {
          cli.spinner('Step 6: Starting app...Done', true);
          resolve();
        })
        .catch(e => {
          cli.spinner('Step 6: Starting app...Failed', true);
          reject(e);
        });
    });
  }

  return new Promise((resolve, reject) => {
    cleanUp()
      .then(uncompressTask)
      .then(installDependencies)
      .then(generateAppSettings)
      .then(removeUnnecessary)
      .then(startApp)
      .then(() => resolve())
      .catch(e => reject(e));
  });
}

/**
 * Update app settings
 * 
 * Step : Re-generate app settings file
 * Step : Restart instance
 */
export function reconfigure(cli: ICli, option: IAppOption, appSettings: IAppSettings): Promise<Object> {
  return new Promise((resolve, reject) => {
    // Step 1
    const buildOption = {
      name: appSettings.name,
      version: appSettings.version,
      instanceName: [appSettings.name, 'rev', appSettings.version].join('_'),
      appDir: path.resolve(option.SOURCE_DIR, appSettings.name),
      verionDir: path.resolve(option.SOURCE_DIR, appSettings.name, 'rev_' + appSettings.version),
      settingFile: path.resolve(option.SOURCE_DIR, appSettings.name, 'rev_' + appSettings.version, 'app.json'),
    };

    // Step
    const generateAppSettings = function () {
      return new Promise((resolve, reject) => {
        cli.spinner('Step 4: Generating app settings file');

        let env: Object = {
          METEOR_SETTINGS: appSettings.settings
        };
        env = _.extend(appSettings.env, env);

        const settings = {
          name: buildOption.instanceName,
          cwd: path.resolve(buildOption.verionDir, 'bundle'),
          script: 'main.js',
          env: env
        };

        jsonfile.writeFile(buildOption.settingFile, settings, { spaces: 2 }, function (e) {
          if (e) {
            cli.spinner('Step 4: Generating app settings file...Failed', true);
            return reject(e);
          } else {
            cli.spinner('Step 4: Generating app settings file...Done', true);
            return resolve();
          }
        });
      });
    }

    const restartApp = function () {
      return new Promise((resolve, reject) => {
        execp(['pm2', 'restart', buildOption.settingFile])
          .then(() => resolve())
          .catch(e => reject(e));
      });
    }

    generateAppSettings()
      .then(restartApp)
      .then(() => resolve())
      .catch(e => reject(e))
  });
}

type IPm2Command = 'start' | 'stop' | 'restart' | 'logs';

export function pm2Command(cli: ICli, option: IAppOption, appSettings: IAppSettings, command: IPm2Command, commandOption?: string[]) {
  const buildOption = {
    name: appSettings.name,
    version: appSettings.version,
    instanceName: [appSettings.name, 'rev', appSettings.version].join('_'),
    appDir: path.resolve(option.SOURCE_DIR, appSettings.name),
    verionDir: path.resolve(option.SOURCE_DIR, appSettings.name, 'rev_' + appSettings.version),
    settingFile: path.resolve(option.SOURCE_DIR, appSettings.name, 'rev_' + appSettings.version, 'app.json'),
  };


  return new Promise((resolve, reject) => {
    pm2.connect((err) => {
      if (err) {
        return reject(err);
      }
      pm2.describe(buildOption.instanceName, (err, info) => {
        if (err) return reject(err);
        if (!info.length) return reject(new Error('App not found'));
        const status = info[0]['pm2_env']['status'];
        switch (command) {
          case 'start':
            if (status === 'online') {
              return resolve();
            } else {
              pm2.start(buildOption.settingFile, err => {
                if (err) return reject(err);
                resolve();
              });
            }
            break;

          case 'stop':
            if (status === 'stopped') {
              return resolve();
            } else {
              pm2.stop(buildOption.instanceName, err => {
                console.log(err)
                if (err) return reject(err);
                return resolve();
              });
            }
            break;

          case 'restart':
            pm2.restart(buildOption.instanceName, err => {
              if (err) return reject(err);
              return resolve();
            });
            break;
          default:
            resolve();
            break;
        }
      });
    });
  })
}