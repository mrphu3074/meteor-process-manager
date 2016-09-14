#!/usr/bin/env node
var fs = require('fs');
import * as cli from 'cli';
import * as _ from 'lodash';
import * as Promise from 'bluebird';
import { initial } from './routes';

cli.parse({
  port: ['port', 'Listen on this port', 'number', 8701],
  user: ['u', 'Username', 'string', ''],
  password: ['p', 'Password', 'string', ''],
  sourceDir: ['source', 'Source location', 'path', '/Users/mrphu3074/Workspace/Testing/build'],
  tmpDir: ['tmp', 'Tmp dir', 'path', '/tmp']
});

cli.main(function (args, options) {
  const PORT = options.port;
  const appOption = {
    PORT: options.port,
    AUTH: {
      username: options.user,
      password: options.password
    },
    SOURCE_DIR: options.sourceDir,
    TMP_DIR: options.tmpDir
  };

  // initial app
  initial(cli, appOption);
});