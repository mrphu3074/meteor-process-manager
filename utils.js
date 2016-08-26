var fs = require('fs')
var path = require('path')
var Promise = require('bluebird');
var tar = require('tar-fs');
var gunzip = require('gunzip-maybe');
var exec = require('child_process').exec;
var _ = require('lodash');

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


function getBuildName(settings) {
  return [settings.name, settings.version].join('_');
}

function getPm2Config(appPath, settings) {
  var env = settings.env;
  env.METEOR_SETTINGS = settings.settings;

  var settings = {
    name: getBuildName(settings),
    cwd: appPath,
    script: 'main.js',
    env: env
  };
  return settings;
}

module.exports = {
  getBuildName: getBuildName,
  execCMD: execCMD,
  uncompress: uncompress,
  getPm2Config: getPm2Config,
};
