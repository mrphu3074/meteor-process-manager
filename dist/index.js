#!/usr/bin/env node
"use strict";
var fs = require('fs');
var cli = require('cli');
var routes_1 = require('./routes');
cli.parse({
    port: ['port', 'Listen on this port', 'number', 8701],
    user: ['u', 'Username', 'string', ''],
    password: ['p', 'Password', 'string', ''],
    sourceDir: ['source', 'Source location', 'path', '/Users/mrphu3074/Workspace/Testing/build'],
    tmpDir: ['tmp', 'Tmp dir', 'path', '/tmp']
});
cli.main(function (args, options) {
    var PORT = options.port;
    var appOption = {
        PORT: options.port,
        AUTH: {
            username: options.user,
            password: options.password
        },
        SOURCE_DIR: options.sourceDir,
        TMP_DIR: options.tmpDir
    };
    // initial app
    routes_1.initial(cli, appOption);
});
