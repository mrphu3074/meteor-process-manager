declare module 'cli' {
  export function parse(args: Object): void;
  export function main(handler: Function): void;
  export function exec(cmd: string, callback: Function, errorCallback: Function): void;
  export function debug(msg: string): void;
  export function error(msg: string): void;
  export function fatal(msg: string): void;
  export function info(msg: string): void;
  export function ok(msg: string): void;
  export function progress(percent: number): void;
  export function spinner(messages: string, completed?: boolean): void;
}

interface ICli {
  parse(args: Object): void;
  main(handler: Function): void;
  exec(cmd: string, callback: Function, errorCallback: Function): void;
  debug(msg: string): void;
  error(msg: string): void;
  fatal(msg: string): void;
  info(msg: string): void;
  ok(msg: string): void;
  progress(percent: number): void;
  spinner(messages: string, completed?: boolean): void;
}


interface IAppOption {
  PORT: number;
  AUTH?: {
    username: string,
    password: string
  },
  SOURCE_DIR: string,
  TMP_DIR: string
}

interface IAppSettings {
  name: string;
  version: number;
  env: Object; // runtime settings
  settings: Object; // meteor settings
}

interface IMulterFile {
  fieldname: string,	//Field name specified in the form	
  originalname: string, //Name of the file on the user's computer	
  encoding: string,	//Encoding type of the file	
  mimetype: string,	//Mime type of the file	
  size: number, 	//Size of the file in bytes	
  destination: string,	//The folder to which the file has been saved	DiskStorage
  filename: string,	//The name of the file within the destination	DiskStorage
  path: string,	//The full path to the uploaded file	DiskStorage
  buffer: Buffer
}