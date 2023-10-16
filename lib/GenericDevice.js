'use strict';

const Homey = require('homey');
const onecolor = require('onecolor');

const { ZONE_TYPE } = require('./constants');

class GenericDevice extends Homey.Device {
  /**
   * Method that will be called when a device is initialized. It will bind the capability
   * listeners specific to the driverType, and it will fetch/search a bridge and stores
   * a reference to that bridge.
   */
  async onInit() {
    this.log(`onInit() -> ${this.getData().bridgeMacAddress} - ${this.getData().driverType} - ${this.getData().zoneNumber}`);

    //Get Settings
    const settings = this.getSettings();

    // Start discovery or retrieve already discovered bridge
    try {
      this.bridge = this.homey.app.BridgeManager.findBridge(this.getData().bridgeMacAddress);
      this.bridge = await this.bridge;
    } catch (err) {
      this.setUnavailable(this.homey.__('no_response'));
      this.error(`onInit() -> ${this.getData().bridgeMacAddress} - ${this.getData().driverType} - ${this.getData().zoneNumber} -> findBridge() error`, err);

      // Retry initialization later, abort for now
      return setTimeout(() => this.onInit(), 10000);
    }

    // Register that this bridge is being used to prevent it from being destroyed
    this.homey.app.BridgeManager.registerBridge(this.bridge, false);

    // Register this device with the bridge
    this.bridge.registerDevice(this.getData());

    // Set available and unavailable when bridge is down
    this.bridge
      .on('offline', () => this.setUnavailable(Homey.__('no_response')))
      .on('online', () => this.setAvailable())
      .on('ip-changed', newAddress => this.setSettings({ bridge_ip_address: newAddress }));

    this.setSettings({
      bridge_ip_address: this.bridge.ip,
      bridge_mac_address: this.bridge.mac,
      //bridge_zone_number: this.getData().zoneNumber.toString(),
      bridge_driver_type: this.getData().driverType,
    });

    // Store additional properties
    this.name = `Zone ${settings.bridge_zone_number} ${this.getData().driverType}`;

    // General capability listeners
    this.registerCapabilityListener('onoff', this.onCapabilityOnOff.bind(this));
    this.registerCapabilityListener('dim', this.onCapabilityDim.bind(this));

    // Driver specific capability listeners
    if (this.hasCapability('light_temperature')) {
      this.registerCapabilityListener('light_temperature', this.onCapabilityLightTemperature.bind(this));
    }
    if (this.hasCapability('light_mode')) {
      this.registerCapabilityListener('light_mode', this.onCapabilityLightMode.bind(this));
    }
    if (this.hasCapability('light_hue') && this.hasCapability('light_saturation')) {
      this.registerMultipleCapabilityListener(['light_hue', 'light_saturation'], async (valueObj) => {
        await this.onCapabilitiesLightHueAndLightSaturation({
          hue: valueObj.light_hue || this.getCapabilityValue('light_hue'),
          saturation: valueObj.light_saturation || this.getCapabilityValue('light_saturation'),
        });
        return Promise.resolve();
      }, 500);
    } else if (this.hasCapability('light_hue')) {
      this.registerCapabilityListener('light_hue', this.onCapabilityLightHue.bind(this));
    }
    if (this.hasCapability('enableWhiteMode')) {
      this.registerCapabilityListener('enableWhiteMode', () => {
        if (this.hasCapability('light_temperature')) {
          const lightTemperature = this.getCapabilityValue('light_temperature');
          return this.zone.enableWhiteMode(typeof lightTemperature === 'number' ? lightTemperature : 1);
        }
        return this.zone.enableWhiteMode();
      });
    }
    if (this.hasCapability('enableNightMode')) {
      this.registerCapabilityListener('enableNightMode', () => this.zone.enableNightMode());
    }
    if (this.hasCapability('toggleScene')) {
      this.registerCapabilityListener('toggleScene', () => this.zone.toggleScene());
    }

    this.log(`onInit() -> ${this.getData().bridgeMacAddress} - ${this.getData().driverType} - ${this.getData().zoneNumber} -> succeeded`);
    this.setAvailable();
  }

  /**
   * Override getData() to parse older data objects and add missing properties.
   * @returns {Object} deviceData
   */
  getData() {
    const deviceData = super.getData();

    // Parse mac address from old device object
    if (!deviceData.hasOwnProperty('bridgeMacAddress') && deviceData.hasOwnProperty('bridgeID')) {
      if (deviceData.bridgeID.includes(':')) {
        deviceData.bridgeMacAddress = deviceData.bridgeID;
      } else {
        // Handle Base64 encoded mac address
        const buf = new Buffer(deviceData.bridgeID, 'base64');
        deviceData.bridgeMacAddress = buf.toString('utf8');
      }
    }

    // Add driver type property
    //if (!deviceData.hasOwnProperty('driverType')) deviceData.driverType = this.getDriver().driverType;
    if (!deviceData.hasOwnProperty('driverType')) deviceData.driverType = this.driver.driverType;

    // driverType migration
    if (deviceData.driverType === 'BRIDGE' || deviceData.driverType === 'WHITE') {
      deviceData.driverType = deviceData.driverType.toLowerCase();
      deviceData.driverType = deviceData.driverType.charAt(0).toUpperCase() + deviceData.driverType.slice(1);
    }
    return deviceData;
  }

  /**
   * Getter for bridge zone.
   * @returns {Zone}
   */
  get zone() {
    // LEGACY: created specific ZONE_TYPE for bridge
    if (this.getData().driverType === ZONE_TYPE.RGBW && this.getData().zoneNumber === 5) {
      return this.bridge.getZone(ZONE_TYPE.BRIDGE, 1);
    }
    
    return this.bridge.getZone(this.getData().driverType, parseInt(this.getSetting("bridge_zone_number")));
  }

  /**
   * This method will be called when the onoff state needs to be changed.
   * @param onoff
   * @returns {Promise}
   */
  async onCapabilityOnOff(onoff) {
    await this.bridge;

    if (onoff) return this.zone.turnOn();
    return this.zone.turnOff();
  }

  /**
   * This method will be called when the dim needs to be changed.
   * @param dim
   * @returns {Promise}
   */
  async onCapabilityDim(dim) {
    await this.bridge;

    this.setCapabilityValue('dim', dim);
    if (dim < 0.01) this.setCapabilityValue('onoff', false);
    else this.setCapabilityValue('onoff', true);
    return this.zone.setBrightness(dim);
  }

  /**
   * This method will be called when the light hue needs to be changed.
   * @param hue
   * @returns {Promise}
   */
  async onCapabilityLightHue(hue) {
    await this.bridge;

    this.setCapabilityValue('light_hue', hue);
    if (this.getSetting('invert_red_and_green') === true) {
      const red = onecolor(`hsl(${hue * 360}, 1, 1)`).red();
      const green = onecolor(`hsl(${hue * 360}, 1, 1)`).green();
      const blue = onecolor(`hsl(${hue * 360}, 1, 1)`).blue();
      const color = onecolor(`rgb(${green},${red},${blue})`);
      this.setCapabilityValue('onoff', true);
      if (this.hasCapability('light_mode')) this.setCapabilityValue('light_mode', 'color');
      return this.zone.setHue(GenericDevice.calibrateHue(color.hue(), this.getSetting('hue_calibration')));
    }
    this.setCapabilityValue('onoff', true);
    if (this.hasCapability('light_mode')) this.setCapabilityValue('light_mode', 'color');
    return this.zone.setHue(GenericDevice.calibrateHue(hue, this.getSetting('hue_calibration')));
  }

  // /**
  //  * This method will be called when the light saturation needs to be changed.
  //  * @param saturation
  //  * @returns {Promise}
  //  */
  // onCapabilityLightSaturation(saturation) {
  //   this.setCapabilityValue('onoff', true);
  //   this.setCapabilityValue('light_saturation', saturation);
  //   if (this.hasCapability('light_mode')) this.setCapabilityValue('light_mode', 'color');
  //   return this.zone.setSaturation(saturation);
  // }

  async onCapabilitiesLightHueAndLightSaturation({ hue, saturation }) {
    await this.bridge;

    this.setCapabilityValue('light_hue', hue);
    this.setCapabilityValue('light_saturation', saturation);
    if (this.getSetting('invert_red_and_green') === true) {
      const red = onecolor(`hsl(${hue * 360}, 1, 1)`).red();
      const green = onecolor(`hsl(${hue * 360}, 1, 1)`).green();
      const blue = onecolor(`hsl(${hue * 360}, 1, 1)`).blue();
      const color = onecolor(`rgb(${green},${red},${blue})`);
      this.setCapabilityValue('onoff', true);
      if (this.hasCapability('light_mode')) this.setCapabilityValue('light_mode', 'color');
      return this.zone.setHueAndSaturation(GenericDevice.calibrateHue(color.hue(), this.getSetting('hue_calibration')), saturation);
    }
    this.setCapabilityValue('onoff', true);
    if (this.hasCapability('light_mode')) this.setCapabilityValue('light_mode', 'color');
    return this.zone.setHueAndSaturation(GenericDevice.calibrateHue(hue, this.getSetting('hue_calibration')), saturation);
  }

  /**
   * This method will be called when the light temperature needs to be changed.
   * @param temperature
   * @returns {Promise}
   */
  async onCapabilityLightTemperature(temperature) {
    await this.bridge;

    // LEGACY: RGBW does not actually support light_temperature
    if (this.getData().driverType === 'RGBW') {
      return this.setCapabilityValue('light_temperature', 0.5);
    }

    this.setCapabilityValue('onoff', true);
    this.setCapabilityValue('light_temperature', temperature);
    if (this.hasCapability('light_mode')) this.setCapabilityValue('light_mode', 'temperature');
    return this.zone.setTemperature(temperature);
  }

  /**
   * This method will be called when the light mode needs to be changed.
   * @param mode
   * @returns {Promise}
   */
  async onCapabilityLightMode(mode) {
    await this.bridge;

    this.setCapabilityValue('onoff', true);
    this.setCapabilityValue('light_mode', mode);
    switch (mode) {
      case 'temperature':
        return this.zone.enableWhiteMode(this.getCapabilityValue('light_temperature'));
      case 'color':
        return this.onCapabilityLightHue(this.getCapabilityValue('light_hue'));
      case 'disco':
        return this.onCapabilityLightMode('color')
          .then(() => this.zone.toggleScene());
      case 'night':
        return this.zone.enableNightMode();
      default:
        if (typeof mode === 'number') return this.zone.toggleScene(mode);
        return Promise.reject('missing_mode_parameter');
    }
  }

  /**
   * This method wraps the setSceneSpeedUp command on the zone instance, this is done to be able to await the bridge
   * initialization to make sure the zone is present.
   * @returns {Promise<*>}
   */
  async onSetSceneSpeedUp() {
    await this.bridge;
    return this.zone.setSceneSpeedUp();
  }

  /**
   * This method wraps the setSceneSpeedUp command on the zone instance, this is done to be able to await the bridge
   * initialization to make sure the zone is present.
   * @returns {Promise<*>}
   */
  async onSetSceneSpeedDown() {
    await this.bridge;
    return this.zone.setSceneSpeedDown();
  }

  /**
   * This method will be called when a device has been removed. It de-registers the device
   * with the bridge, so in case this was the last registered device the bridge can be
   * destroyed.
   */
  onDeleted() {
    this.log(`onDeleted() -> ${this.getData().bridgeMacAddress} - ${this.getData().driverType} - ${this.getData().zoneNumber}`);
    if (typeof this.bridge !== 'undefined') this.bridge.deregisterDevice(this.getData());
  }

  /**
   * Calibrate hue value, to keep
   * value in hue range of 0 - 1
   * @param hue
   * @param value
   * @returns {number}
   */
  static calibrateHue(hue, value) {
    hue += value;
    if (hue > 1) return hue - 1;
    if (hue < 0) return hue + 1;
    return hue;
  }
}

module.exports = GenericDevice;
