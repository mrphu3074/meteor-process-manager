import * as express from 'express';
import * as _ from 'lodash';
import { Application, Request, Response } from 'express';
var bodyParser = require('body-parser');
var multer = require('multer');
var auth = require('basic-auth');
import { deploy, reconfigure, pm2Command, execp } from './commands';

interface IRequest extends Request {
  body: any
}

export function initial(cli: ICli, option: IAppOption) {
  const app = express();
  const router = express.Router();
  var storage = multer.memoryStorage();
  var upload = multer({ dest: option.TMP_DIR });

  router.use(bodyParser.json());
  router.use(bodyParser.urlencoded({ extended: false }));
  // required authentication
  router.use(function (request: Request, response: Response, next: Function) {
    const credentials = auth(request);
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

  interface IDeployRequest extends Request {
    file: IMulterFile,
    body: {
      settings: string,
    }
  }

  router.post('/deploy', upload.single('bundle'), function (request: IDeployRequest, response: Response) {
    try {
      var appSettings = JSON.parse(request.body.settings);
      const start = new Date();
      deploy(cli, option, request.file.path, appSettings)
        .then(() => {
          const end = new Date();
          const duration = (end.getTime() - start.getTime()) / 1000;
          const msg = `Deploy success: duration ${duration} seconds`;
          console.log(msg);
          response.json({
            success: true,
            msg: ''
          });
        })
        .catch(e => {
          throw e;
        });
    } catch (e) {
      console.trace('Deploy failed', e);
      response.json({
        success: false,
        code: 400,
        msg: 'Invalid parameter'
      });
    }
  });

  interface IAppRequest extends Request {
    body: {
      action: 'start' | 'stop' | 'restart',
      settings: IAppSettings
    }
  }

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
  router.post('/app', function (request: IAppRequest, response: Response) {
    try {
      const action = request.body.action;
      const appSettings = request.body.settings;

      switch (action) {
        case 'start':
        case 'stop':
        case 'restart':
          pm2Command(cli, option, appSettings, action)
            .then(() => {
              response.json({
                success: true,
                code: 0,
                msg: `${action} success`
              });
            })
            .catch(e => {
              response.json({
                success: false,
                code: 400,
                msg: 'invalid parameter'
              });
            });
          break;
      }
    } catch (e) {
      response.end('ERROR');
    }
  });

  app.use('/api', router);


  /**
   * Api to deploy
   */
  app.post('/deploy', upload.single('bundle'), (req, res) => {
    var appSettings = JSON.parse(req.body.settings);
    const start = new Date();
    deploy(cli, option, req.file.path, appSettings)
      .then(() => {
        const end = new Date();
        const duration = (end.getTime() - start.getTime()) / 1000;
        const msg = `Deploy success: duration ${duration} seconds`;
        console.log(msg);
        res.end(msg);
      })
      .catch(e => {
        res.end('FAILED: ' + e.message);
      });
  });

  /**
   * Api to update app settings
   */
  app.post('/reconfigure', (req: IRequest, res) => {
    var appSettings = JSON.parse(req.body.settings);
    reconfigure(cli, option, appSettings)
      .then(() => res.end('ok'))
      .catch(e => {
        res.end('failed');
        console.log(e);
      });
  });

  /**
   * Api to restart app
   */
  app.post('/stop', function (req: IRequest, res: Response) {
    var appSettings = JSON.parse(req.body.settings);
    pm2Command(cli, option, appSettings, 'stop')
      .then(() => {
        res.end('Stop ok');
      })
      .catch(e => {
        res.end('Stop failed');
        console.log(e);
      })
  });

  /**
   * Api to restart app
   * 
   */
  app.post('/instance', function (req, res: Response) {
    var appSettings = JSON.parse(req.body.settings);
    var action = req.body.action;

    pm2Command(cli, option, appSettings, action)
      .then(() => {
        res.end(`${action} ok`);
      })
      .catch(e => {
        console.log(e);
        res.end(`${action} failed`);
      });
  });

  app.listen(option.PORT, function () {
    console.log('Meteor process manager listening on port %s!', option.PORT);
  });
}