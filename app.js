'use strict';

const Homey = require('homey');
const Log = require('homey-log').Log;

const BridgeManager = require('./lib/BridgeManager');

// TODO: iBox and 8-Zone Controller images and icons.
class MilightApp extends Homey.App {
  onInit() {
    this.log(`${this.id} running...`);
    this._BridgeManager = new BridgeManager({
      log: ((...args) => this.log('[BridgeManager]', ...args)),
      error: ((...args) => this.error('[BridgeManager]', ...args)),
    });
    this.homey.on('unload', this.onUnload.bind(this));
  }

  get BridgeManager() {
    return this._BridgeManager;
  }

  onUnload() {
    this.log('destroyed');
    this.BridgeManager.destroy();
  }
}

module.exports = MilightApp;
