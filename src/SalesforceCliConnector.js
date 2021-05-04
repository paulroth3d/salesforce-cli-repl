/** jsforce - connection to salesforce */
const JsForce = require('jsforce');

/** child process to execute the cli */
const childProcess = require('child_process');

/** process to read / write files. */
const fs = require('fs-extra');

/** library to resolve paths */
const path = require('path');

/** logging library */
const logger = require('pino')({
  prettyPrint: true
});

/** Error level: none @type {Number} */
const ERROR_LEVEL_NONE = -1;

/** Error level: Basic @type {Number} */
const ERROR_LEVEL_BASIC = 0;

/** Error level: Detail @type {Number} */
const ERROR_LEVEL_DETAIL = 1; // eslint-disable-line no-unused-vars

/**
 * A result from within Org Detail
 * @typedef {Object} OrgDetailResult
 * @property {string} username -
 * @property {string} id -
 * @property {string} connectedStatus -
 * @property {string} accessToken -
 * @property {string} instanceUrl -
 * @property {string} clientId -
 * @property {string} alias -
 */

/**
 * The raw response from Org Detail
 * @typedef {Object} OrgDetail
 * @property {number} status -
 * @property {string} message - error message provided
 * @property {string} stack - the stack of the problem
 * @property {OrgDetailResult} result
 */

/**
 * Reprsents a developer error
 */
class DeveloperError {
  /**
   * @param {string} message - the client readable message
   * @param {string} detailMessage - the debug level message
   * @param {string} stack - the stack trace
   */
  constructor(message, detailMessage, stack) {
    /**
     * Client readable message
     * @type {string}
     */
    this.message = message;

    /**
     * Detail message
     * @type {string}
     */
    this.detailMessage = detailMessage;

    /**
     * Stack
     * @type {string}
     */
    this.stack = stack;
  }

  /**
   * Creates a Developer Error from a standard error
   * @param {Error} err -
   */
  static importError(err) {
    if (err instanceof DeveloperError) {
      return (err);
    }
    return new DeveloperError(err.message, 'unhandled exception', err.stack);
  }

  /**
   * Logs the message based on the trace level
   * @param {number} traceLevel
   */
  log(traceLevel) {
    if (traceLevel > ERROR_LEVEL_NONE) {
      if (traceLevel === ERROR_LEVEL_BASIC) {
        logger.error('Error occurred:%s', this.message);
      } else if (traceLevel > ERROR_LEVEL_BASIC) {
        logger.error('Error occurred:%s \n %s \n %o', this.message, this.detailMessage, this.stack);
      }
    }
  }
}

/**
 * Simple class that returns a jsForce connection based
 * based on an alias.
 */
class SalesforceCliConnector {
  /**
   * Constructor
   */
  constructor() {
    this.setOptions({});
  }

  /**
   * Flags to send for the connector
   * @public
   * @param {Object} options -
   */
  setOptions(options) {
    const defaults = {
      traceLevel: ERROR_LEVEL_BASIC
    };

    //-- check environment variables
    if (process.env.hasOwnProperty('TRACE_LEVEL')) { // eslint-disable-line no-prototype-builtins
      const envTraceLevel = Number.parseInt(process.env.TRACE_LEVEL, 10);
      if (Number.isSafeInteger(envTraceLevel)) {
        defaults.traceLevel = envTraceLevel;
      }
    }

    const cleanOptions = Object.assign(defaults, options);

    /**
     * The level that we will be tracing the output.
     * (By default - 0, no trace.)
     * @type {number}
     */
    this.traceLevel = cleanOptions.traceLevel;
  }

  /**
   * Gets a jsforce connection to an org based on an alias.
   * @public
   * @param {string} alias - the alias to use - or the default if blank is sent
   * @return {JsForce.Connection} - connection
   */
  async getConnection(alias) {
    let self = this;
    return new Promise(async (resolve, reject) => { // eslint-disable-line no-async-promise-executor, no-unused-vars
      try {
        /** @type {OrgDetailResult} */
        const connectionInfo = await self.getConnectionDetail(alias);

        resolve(new JsForce.Connection({
          serverUrl: connectionInfo.instanceUrl,
          sessionId: connectionInfo.accessToken
        })); // eslint-disable-line padded-blocks

      } catch (err) {
        const cleanedErr = DeveloperError.importError(err);
        cleanedErr.log(this.traceLevel);

        //-- just resolve to null for now
        resolve(null);
      }
    });
  }

  /**
   * Gets the connection details for an org using a salesforce cli alias.
   * @param private - can be called for detail / debugging
   * @param {string} alias - the alias to use - or the current default (if blank)
   * @return {JsForce.Connection}
   */
  async getConnectionDetail(alias) {
    const self = this;
    return new Promise(async (resolve, reject) => { // eslint-disable-line no-async-promise-executor
      let conn;
      /** @type {OrgDetail} */
      let connObj;

      try {
        conn = await self.getOrgDetail(alias);
      } catch (err) {
        return reject(err);
      }

      if (self.traceLevel > ERROR_LEVEL_BASIC) {
        logger.info('captured result: %o', conn);
      }

      try {
        connObj = JSON.parse(conn);
      } catch (err) {
        return reject(new DeveloperError(
          `Unable to get connection:${alias || 'default'}`,
          err.message,
          err.stack
        ));
      }

      if (connObj.status === 0) {
        //-- success, let it through.
        return resolve(connObj.result);
      }

      //-- not a success
      return reject(new DeveloperError(
        `Unable to find connection:${alias || 'default'}`,
        connObj.message,
        connObj.stack
      ));
    });
  }

  /**
   * Get a salesforce org detail for a given alias
   * @param private - can be called for detail / debugging
   * @param {string} alias - the connection alias to use.
   * @return {Object}
   */
  getOrgDetail(alias) {
    let options = {
      encoding: 'utf8',
    };
    let args = ['force:org:display', '--json'];

    if (alias) {
      args.push('-u', alias);
    }

    let results = '';
    let streamError = null;

    return new Promise((resolve, reject) => {
      const proc = childProcess.spawn('sfdx', args, options);

      //-- its done
      proc.stdout.on('close', (code) => { // eslint-disable-line no-unused-vars
        // console.log(`completed with exit code ${code}`);
        if (streamError) {
          return reject(new DeveloperError(
            `Error occurred while asking the salesforce cli for alias:${alias || 'default'}, is the salesforce cli installed?`,
            streamError.message,
            streamError.stack
          ));
        }
        resolve(results);
      });

      //-- normal std out
      proc.stdout.on('data', (data) => {
        // console.log('err:' + data.toString());
        results += data.toString();
      });

      //-- error
      proc.stderr.on('data', (data) => {
        // console.log('dat:' + data.toString());
        results += data.toString();
      });

      proc.on('error', (err) => {
        // console.error('error occurred');
        streamError = err;
      });
    });
  }

  //-- static utility methods

  /**
   * Read JSON file
   * @param {string} filePath - path of the file to load
   */
  readJSON(filePath) {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      logger.error('File does not exist: %s', resolvedPath);
      return;
    }

    try {
      const result = fs.readJsonSync(resolvedPath, { encoding: 'utf-8' });
      return result;
    } catch (err) {
      (new DeveloperError(
        `unable to read file: ${resolvedPath}`,
        err.message,
        err.stack
      )).log(this.traceLevel);
    }
  }

  /**
   * Reads a file in a text
   * @param {String} filePath - path of the file to load
   * @returns {String}
   */
  readFile(filePath) {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      logger.error('File does not exist: %s', resolvedPath);
      return;
    }

    try {
      const result = fs.readFileSync(resolvedPath, { encoding: 'utf-8' });
      return result;
    } catch (err) {
      (new DeveloperError(
        `unable to read file: ${resolvedPath}`,
        err.message,
        err.stack
      )).log(this.traceLevel);
    }
  }

  /**
   * Writes to a file
   * @param {string} filePath - path of the file to write
   * @param {string} contents - contents of the file
   */
  writeFile(filePath, contents) {
    //-- if it isn't desired, simply pass as a string.
    const jsonContents = JSON.stringify(contents, null, 2);

    // const resolvedPath = path.resolve(filePath);
    try {
      fs.writeFileSync(filePath, jsonContents, { encoding: 'utf-8' });
    } catch (err) {
      (new DeveloperError(
        `unable to write to file: ${filePath}`,
        err.message,
        err.stack
      )).log(this.traceLevel);
    }
  }

  /**
   * List files in a directory
   * @param {String} directoryPath - path of the directory to list
   */
  listFiles(directoryPath) {
    const resolvedPath = path.resolve(directoryPath);
    if (!fs.existsSync(resolvedPath)) {
      logger.error('Path does not exist: %s', resolvedPath);
      return;
    } else if (fs.ensureDirSync(resolvedPath)) { // eslint-disable-line no-else-return
      logger.error(`Path is not a directory:${resolvedPath}`);
      return;
    }

    try {
      let results = fs.readdirSync(resolvedPath);
      return results;
    } catch (err) {
      (new DeveloperError(
        `unable to read directory: ${resolvedPath}`,
        err.message,
        err.stack
      )).log(this.traceLevel);
    }
  }

  /**
   * Converts a jsForce function to a promise
   * @private -
   * @example
   * const accountDescribe = await CliConnection.promisify(conn.describeSObject)('Account');
   * @param {Function} fn - the function to promisify
   * @returns {Function} - a wrapper for function, that when executed, the last argument will be a promise callback
   */
  promisify(fn) {
    return (...args) => { // eslint-disable-line arrow-body-style
      return new Promise((resolve, reject) => {
        function customCallback(err, ...results) {
          if (err) {
            return reject(err);
          }
          return resolve.apply(this, results);
        }
        args.push(customCallback);
        fn.apply(this, args);
      });
    };
  }
}

module.exports = new SalesforceCliConnector();
