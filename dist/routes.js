"use strict";
var express = require('express');
var _ = require('lodash');
var bodyParser = require('body-parser');
var multer = require('multer');
var auth = require('basic-auth');
var commands_1 = require('./commands');
function initial(cli, option) {
    var app = express();
    var router = express.Router();
    var storage = multer.memoryStorage();
    var upload = multer({ dest: option.TMP_DIR });
    router.use(bodyParser.json());
    router.use(bodyParser.urlencoded({ extended: false }));
    // required authentication
    router.use(function (request, response, next) {
        var credentials = auth(request);
        if (!_.isEmpty(option.AUTH.username) && !_.isEmpty(option.AUTH.password)) {
            if (!credentials || credentials.name !== option.AUTH.username || credentials.pass !== option.AUTH.password) {
                response.statusCode = 401;
                response.setHeader('WWW-Authenticate', 'Basic realm="Access denied"');
                response.json({
                    success: false,
                    code: 401,
                    msg: 'Access denied'
                });
            }
        }
        next();
    });
    router.post('/deploy', upload.single('bundle'), function (request, response) {
        try {
            var appSettings = JSON.parse(request.body.settings);
            var start_1 = new Date();
            commands_1.deploy(cli, option, request.file.path, appSettings)
                .then(function () {
                var end = new Date();
                var duration = (end.getTime() - start_1.getTime()) / 1000;
                var msg = "Deploy success: duration " + duration + " seconds";
                console.log(msg);
                response.json({
                    success: true,
                    msg: ''
                });
            })
                .catch(function (e) {
                throw e;
            });
        }
        catch (e) {
            console.trace('Deploy failed', e);
            response.json({
                success: false,
                code: 400,
                msg: 'Invalid parameter'
            });
        }
    });
    /**
     * App apis
     * + start
     * + stop
     * + restart
     * + logs
     * + reconfigure
     * + info : get current version info
     * + versions
     * + use --version
     */
    router.post('/app', function (request, response) {
        try {
            var action_1 = request.body.action;
            var appSettings = JSON.parse(request.body.settings);
            switch (action_1) {
                case 'start':
                case 'stop':
                case 'restart':
                    commands_1.instance(cli, option, appSettings, action_1)
                        .then(function () {
                        response.json({
                            success: true,
                            code: 0,
                            msg: action_1 + " success"
                        });
                    })
                        .catch(function (e) {
                        response.json({
                            success: false,
                            code: 400,
                            msg: 'invalid parameter'
                        });
                    });
                    break;
                case 'configure':
                    commands_1.reconfigure(cli, option, appSettings)
                        .then(function () { return response.end('ok'); })
                        .catch(function (e) {
                        response.end('failed');
                        console.log(e);
                    });
                    break;
            }
        }
        catch (e) {
            response.end('ERROR');
        }
    });
    app.use('/api', router);
    /**
     * Api to deploy
     */
    app.post('/deploy', upload.single('bundle'), function (req, res) {
        var appSettings = JSON.parse(req.body.settings);
        var start = new Date();
        commands_1.deploy(cli, option, req.file.path, appSettings)
            .then(function () {
            var end = new Date();
            var duration = (end.getTime() - start.getTime()) / 1000;
            var msg = "Deploy success: duration " + duration + " seconds";
            console.log(msg);
            res.end(msg);
        })
            .catch(function (e) {
            res.end('FAILED: ' + e.message);
        });
    });
    /**
     * Api to update app settings
     */
    app.post('/reconfigure', function (req, res) {
        var appSettings = JSON.parse(req.body.settings);
        commands_1.reconfigure(cli, option, appSettings)
            .then(function () { return res.end('ok'); })
            .catch(function (e) {
            res.end('failed');
            console.log(e);
        });
    });
    /**
     * Api to restart app
     */
    app.post('/stop', function (req, res) {
        var appSettings = JSON.parse(req.body.settings);
        commands_1.instance(cli, option, appSettings, 'stop')
            .then(function () {
            res.end('Stop ok');
        })
            .catch(function (e) {
            res.end('Stop failed');
            console.log(e);
        });
    });
    /**
     * Api to restart app
     *
     */
    app.post('/instance', function (req, res) {
        var appSettings = JSON.parse(req.body.settings);
        var action = req.body.action;
        commands_1.instance(cli, option, appSettings, action)
            .then(function () {
            res.end(action + " ok");
        })
            .catch(function (e) {
            console.log(e);
            res.end(action + " failed");
        });
    });
    app.listen(option.PORT, function () {
        console.log('Meteor process manager listening on port %s!', option.PORT);
    });
}
exports.initial = initial;
