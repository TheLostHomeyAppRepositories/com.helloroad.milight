'use strict';

const EventEmitter = require('events').EventEmitter;
const { MilightController } = require('node-milight-promise');

const Zone = require('../Zone');
const { BRIDGE_TYPE } = require('./../constants');

class Bridge extends EventEmitter {
  /**
   * Construct bridge object, needs
   * an ip and mac address.
   * * @param options
   */
  constructor({
    ip, mac, temp, log, error,
  }) {
    super();

    // Store bridge specific variable
    this.ip = ip;
    this.mac = mac;
    this.temp = temp;

    // Set log methods
    this.log = log;
    this.error = error;

    this.zones = {};
    this.online = true;
    this.unavailableCounter = 0;

    // Keep track of all Homey devices connected to this bridge
    this.registeredDevices = new Set();
  }

  /**
   * Method that creates new zone instances based on the specified zone configuration.
   */
  createZones() {
    // Create method that sends command to bridge
    this._createBridgeCommunicationMiddleware();

    // Read zone configuration
    const zoneConfiguration = this.zoneConfiguration;
    if (!Array.isArray(zoneConfiguration)) throw new Error('Invalid zone configuration');

    // Instantiate zone instances based on configuration
    zoneConfiguration.forEach(zoneDefinition => {
      this.zones[zoneDefinition.type] = [
        new Zone({
          bridgeType: this.type,
          zoneType: zoneDefinition.type,
          zoneNumber: zoneDefinition.number,
          zoneId: this.mac + zoneDefinition.number + zoneDefinition.type,
          bridgeCommands: this.commands,
          sendBridgeCommand: this._bridgeCommunicationMiddlewareMethod.bind(this),
          log: ((...args) => this.log(`[Zone (${zoneDefinition.type} ${zoneDefinition.number})]`, ...args)),
          error: ((...args) => this.error(`[Zone (${zoneDefinition.type} ${zoneDefinition.number})]`, ...args)),
        }),
      ].concat(this.zones[zoneDefinition.type] || []);
    });
  }

  /**
   * Update the IP address of the bridge and re-initiate the NodeMilightPromise object.
   * @param ip
   */
  updateIPAddress(ip) {
    this.ip = ip || this.ip;
    this.log(`updateIpAddress() -> ${ip}`);
    this.emit('ip-changed', ip);

    // Create new bridge communication middleware to updated ip
    this._createBridgeCommunicationMiddleware();
  }

  /**
   * Destroy this bridge object, emit 'destroy' event.
   */
  destroy() {
    if (!this.destroyed) this.emit('destroy', this);
    this.destroyed = true;
    this._bridgeCommunicationMiddleware.close();
    this._bridgeCommunicationMiddleware = null;
    this.zones = null;
    this.registeredDevices = null;
    this.log('destroyed');
  }

  /**
   * Add a device to the set to keep track of all connected devices.
   * @param deviceData
   */
  registerDevice(deviceData) {
    if (!deviceData.hasOwnProperty('zoneNumber')
      || !deviceData.hasOwnProperty('bridgeMacAddress')
      || !deviceData.hasOwnProperty('driverType')) return new Error('missing_device_data_property');
    this.registeredDevices.add(deviceData.bridgeMacAddress + deviceData.zoneNumber + deviceData.driverType);
  }

  /**
   * Remove device from set so that bridge can destroy itself once it becomes without devices.
   * @param deviceData
   */
  deregisterDevice(deviceData) {
    if (!deviceData.hasOwnProperty('zoneNumber')
      || !deviceData.hasOwnProperty('bridgeMacAddress')
      || !deviceData.hasOwnProperty('driverType')) return new Error('missing_device_data_property');
    this.registeredDevices.delete(deviceData.bridgeMacAddress + deviceData.zoneNumber + deviceData.driverType);
    if (this.registeredDevices.size === 0) this.destroy();
  }

  /**
   * Getter for the zones array
   * @returns {{}|Array|*[]}
   */
  getZones(type) {
    if (type) return this.zones[type] || [];
    return this.zones || {};
  }

  /**
   * Return specific zone
   * @param type
   * @param number
   * @returns {*}
   */
  getZone(type, number) {
    return this.zones[type].find(zone => zone.number === number);
  }

  /**
   * Method that creates a communication middleware method for the Milight Controller.
   * @private
   */
  _createBridgeCommunicationMiddleware() {
    if (typeof this.ip !== 'string') throw new Error('Can not create bridge communication middleware without ip');
    if (typeof this.type !== 'string') throw new Error('Can not create bridge communication middleware without type');

    this.log(`Create MilightController communication middleware (ip: ${this.ip}, type: ${this.type})`);

    // Important to destroy previous controller middleware, else it will keep using the wrong ip
    if (this._bridgeCommunicationMiddleware) {
      this._bridgeCommunicationMiddleware.close();
      this._bridgeCommunicationMiddleware = null;
    }

    // Create milight controller instance
    this._bridgeCommunicationMiddleware = new MilightController({
      ip: this.ip,
      type: (this.type === BRIDGE_TYPE.IBOX) ? 'v6' : 'legacy',
    });

    // Create middleware method that sends command to the milight controller
    this._bridgeCommunicationMiddlewareMethod = (commands) => new Promise((resolve, reject) => {
      this._bridgeCommunicationMiddleware
        .sendCommands(commands)
        .then(resolve)
        .catch(reject);
    });
  }
}

module.exports = Bridge;
