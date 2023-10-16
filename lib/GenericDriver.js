'use strict';

const Homey = require('homey');
const onecolor = require('onecolor');

const MilightDevice = require('./GenericDevice');
const { BRIDGE_TYPE, ZONE_TYPE } = require('./constants');

class GenericDriver extends Homey.Driver {
  /**
   * Method that will be called when a driver is initialized. It will register Flow Cards
   * for the respective drivers. Options parameter should at least contain a driverType
   * property.
   * @param options {Object}
   * @returns {Error}
   */
  async onInit({ driverType }) {
    if (!driverType) return new Error('missing_driver_type');

    // Store driverType
    this.driverType = driverType;

    // Register Flow Cards for RGB, RGBW and RGBWW
    if (this.driverType.includes(ZONE_TYPE.RGB) || this.driverType === ZONE_TYPE.EIGHT_ZONE_CONTROLLER) {
      this.homey.flow
	.getActionCard('set_color_rgb')
        .registerRunListener(async (args) => {
          const myColor = onecolor(args.color);
          args.color = myColor.hue();
          return args.device.onCapabilityLightHue(args.color);
        });

      // Register Flow Cards for RGBW and RGBWW
      if (this.driverType.includes(ZONE_TYPE.RGBW) || this.driverType === ZONE_TYPE.EIGHT_ZONE_CONTROLLER) {
        this.homey.flow
	  .getActionCard('white_mode')
          .registerRunListener(async (args) => args.device.onCapabilityLightMode('temperature'));

        this.homey.flow
	  .getActionCard('disco_mode')
          .registerRunListener(async(args) => args.device.onCapabilityLightMode('disco'));

        this.homey.flow
	  .getActionCard('disco_mode_specific')
          .registerRunListener(async(args) => args.device.onCapabilityLightMode(Number(args.mode)));

        this.homey.flow
	  .getActionCard('enable_night_mode')
          .registerRunListener(async(args) => args.device.onCapabilityLightMode('night'));

        this.homey.flow
	  .getActionCard('disco_mode_faster')
          .registerRunListener(async(args) => args.device.onSetSceneSpeedUp());

        this.homey.flow
	  .getActionCard('disco_mode_slower')
          .registerRunListener(async(args) => args.device.onSetSceneSpeedDown());
      }
    }
  }

  /**
   * Method that will be called upon pairing. It handles discovering bridges for all types
   * of drivers. After pairing is ended it removes the bridges it found that were not added.
   * TODO: bridges in list devices view bug
   * @param socket
   */
  onPair(session) {
    let selectedBridge = null;
    let searchingBridges = false;

    // Store the bridge the user selected
    session.setHandler("list_bridges_selection", async (data) => {
      //callback();
      if (Array.isArray(data) && data.length > 0) {
        selectedBridge = data[0];
      }
      return;
    });

    // Received when a view has changed
    session.setHandler("showView", async (viewId) => {
      if (viewId === 'list_devices') {
        searchingBridges = false;
      }
      return;
    });

    // This gets called twice, first for listing bridges, then for devices
    session.setHandler("list_devices", async (data) => {
      // When 'list_devices' is called for the second time stop searching for bridges and return devices
      if (selectedBridge) {
        searchingBridges = false;
        try {
          const devices = await this._getDevices(selectedBridge);
          return devices;
        } catch (err) {
          this.error('Failed to get devices for list_devices', err.message || err.toString());
          return err;
        }
      }

      const listedDevices = [];
      try {
        // Get already discovered devices, this speeds up pairing significantly
        let registeredBridges = this.homey.app.BridgeManager.getRegisteredBridges();
        registeredBridges = registeredBridges
          .filter(this._filterLegacyBridgeIfNeeded.bind(this))
          .filter(registeredBridge => registeredBridge.online === true)
          .map(GenericDriver._parseBridgeObjectToDeviceObject.bind(this));

        // Add it to listed devices
        registeredBridges.forEach(registeredBridge => listedDevices.push(registeredBridge));

        session.emit('list_devices', registeredBridges);
      } catch (err) {
        // Do not abort pairing yet
        this.error('Failed to get registered bridges for list_devices', err);
      }

      // Stop searching bridges before pairing wizard times out
      setTimeout(() => searchingBridges = false, 25000);

      // When 'list_devices' is called for the first time start searching for bridges
      searchingBridges = true;

      // As long as we are allowed to search for bridges do so
      while (searchingBridges === true) {
        try {
          const discoveredDevices = await this._discoverBridges();
          for (const { name: discoveredDeviceName, data: discoveredDeviceData } of discoveredDevices) {
            const alreadyFound = listedDevices.find(({ data: listedDeviceData }) => listedDeviceData.bridgeMacAddress === discoveredDeviceData.bridgeMacAddress);
            if (!alreadyFound) listedDevices.push({
              name: discoveredDeviceName,
              data: discoveredDeviceData,
            });
          }
          // Extra check to account for the delay of the async getBridges() call
          if (searchingBridges === true) {
            session.emit('list_devices', discoveredDevices);
          }
        } catch (err) {
          // Do not abort pairing yet
          this.error('Error discovering bridges', err);
        }
      }

      // Finally callback the end result
      return listedDevices;
    });

    // Clean up after pairing session ended
    session.setHandler("disconnect", async () => {
      selectedBridge = null;
      searchingBridges = null;
      setTimeout(() => this.homey.app.BridgeManager.deregisterTempBridges, 30000);
      return;
    });
  }

  /**
   * Always use MilightDevice as device for this driver.
   * @returns {MilightDevice}
   */
  onMapDeviceClass() {
    return MilightDevice;
  }

  /**
   * Method that discovers bridges on the network and returns them as device objects.
   * @returns {Promise<*>}
   * @private
   */
  async _discoverBridges() {
    try {
      //const discoveredBridges = await this.homey.app.BridgeManager.discoverBridges({ temp: true });
      const discoveredBridges = await this.homey.app.BridgeManager.discoverBridges({ temp: true });
      return discoveredBridges
        .filter(this._filterLegacyBridgeIfNeeded.bind(this))
        .map(GenericDriver._parseBridgeObjectToDeviceObject);
    } catch (err) {
      this.error('Could not discover bridges', err);
      return [];
    }
  }

  /**
   * Method that gets the zones of a provided bridge and returns them as device objects.
   * @param selectedBridge
   * @returns {Promise<*>}
   * @private
   */
  async _getDevices(selectedBridge) {
    if (!selectedBridge || !selectedBridge.hasOwnProperty('data') || !selectedBridge.data.hasOwnProperty('bridgeMacAddress')) {
      throw new Error('Invalid selected bridge');
    }

    // Get bridge an corresponding zones
    const bridge = this.homey.app.BridgeManager.getBridge({ mac: selectedBridge.data.bridgeMacAddress });
    const zones = bridge.getZones(this.driverType).slice();
    if (!Array.isArray(zones)) return [];

    // Parse zones to device objects
    return zones
      .sort((a, b) => a.name.localeCompare(b.name)) // sort on name first
      .sort((a, b) => a.number - b.number) // then on ascending zone numbers
      .map(zone => ({
        name: (zone.type === ZONE_TYPE.BRIDGE) ? 'iBox Bridge' : `${zone.type} Zone ${zone.number}`,
        data: {
          id: zone.id,
          bridgeMacAddress: bridge.mac,
          zoneNumber: zone.number,
          driverType: zone.type,
        },
        settings: {
          bridge_zone_number: zone.number.toString(),
          bridge_driver_type: zone.type,
          bridge_mac_address: bridge.mac,
          bridge_ip_address: bridge.ip,
        },
      }));
  }

  /**
   * Method that creates a device object from a bridge object.
   * @param bridgeObj
   * @returns {{name: string, data: {bridgeMacAddress: *}}}
   * @private
   */
  static _parseBridgeObjectToDeviceObject(bridgeObj) {
    if (!bridgeObj || !bridgeObj.hasOwnProperty('type') || !bridgeObj.hasOwnProperty('mac')) {
      throw new Error('Invalid bridge object');
    }
    return {
      name: (bridgeObj.type === BRIDGE_TYPE.IBOX) ? `iBox Bridge (${bridgeObj.mac})` : `Bridge (${bridgeObj.mac})`,
      data: {
        bridgeMacAddress: bridgeObj.mac,
      },
    };
  }

  /**
   * Filter legacy bridges if driver type is not supported on it.
   * @param bridge
   * @returns {boolean}
   * @private
   */
  _filterLegacyBridgeIfNeeded(bridge) {
    if (this.driverType === ZONE_TYPE.EIGHT_ZONE_CONTROLLER || this.driverType === ZONE_TYPE.BRIDGE) {
      return bridge.type === BRIDGE_TYPE.IBOX;
    }
    return true;
  }
}

module.exports = GenericDriver;
