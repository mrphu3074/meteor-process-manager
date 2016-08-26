#!/usr/bin/env node
var _ = require('lodash');
var fs = require('fs');
var cli = require('cli');
var Promise = require('bluebird');
var commands = require('./commands');

cli.parse({
  log: ['l', 'Enable logging'],
  port: ['p', 'Listen on this port', 'number', 8701],
  buildPath: ['b', 'Build path', 'path', '/Users/mrphu3074/Workspace/Testing/build']
});

cli.main(function(args, options) {
  var express = require('express');
  var bodyParser = require('body-parser');
  var multer = require('multer');
  var upload = multer({ dest: './uploads' });


  var app = express();
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));

  var PORT = options.port;
  var BINARY_DIR = '/Users/mrphu3074/Workspace/Testing/deploy/binary';
  var BUILD_DIR = options.sourceDir;
  var ENV = {
    PORT: 5000,
    ROOT_URL: 'http://localhost:5000',
    MONGO_URL: 'mongodb://admin:quangcuong@ds019482.mlab.com:19482/thongoc',
  };

  function init(file, settings) {
    var data = {
      cli: cli,
      config: {
        BINARY_DIR: BINARY_DIR,
        BUILD_DIR: BUILD_DIR,
      },
      appSettings: settings,
      getFileSource: function() {
        return file.path;
      },
      getBinaryPath: function() {
        return BINARY_DIR + '/' + file.filename + '.tar.gz';
      },
      getBuildPath: function() {
        return BUILD_DIR + '/' + file.filename;
      }
    };

    return new Promise(function(resolve, reject) {
      return resolve(data);
    });
  }

  app.post('/deploy', upload.single('bundle'), function(req, res) {
    var appSettings = JSON.parse(req.body.settings);
    var startTime = new Date();
    commands
      .initDeploy(cli, options, appSettings, req.file)
      .then(commands.deploy)
      .then(function() {
        var endTime = new Date();
        var duration = (endTime.getTime() - startTime.getTime()) / 1000;
        var successMsg = 'Deploy time: ' + duration + ' seconds';
        cli.info(successMsg);
        res.end('OK |' + successMsg);
      })
      .catch(function(e) {
        cli.fatal(e);
        res.end('Deploy failed');
      });
  });

  app.post('/configure', function(req, res) {
    var settings = JSON.parse(req.body.settings);
    Promise.resolve({cli: cli, appSettings: settings})
      .then(commands.reconfigure)
    res.end();
  });

  app.listen(PORT, function() {
    console.log('Example app listening on port %s!', PORT);
  });
});
