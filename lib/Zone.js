'use strict';

const { BRIDGE_TYPE, ZONE_TYPE } = require('./constants');

const RETRY_TIMEOUT = 100;

// List of retryable commands
// Legacy:
//  RGB (on, off, hue)
//  White (allOn, allOff, maxBright, nightMode, on, off)
//  RGBW (on, off, allOn, allOff, hue & brightness (but watch out, targets last turned on bulb), whiteMode, nightMode
// V6:
//  Bridge (on, off, whiteMode, nightMode, brightness, hue, effectMode
//  RGBW (on, off, whiteMode, nightMode, brightness, hue, effectMode, link, unlink
//  White (on, off, maxBright, nightMode, link, unlink
//  RGBFullColor (RGB+CCT 8 zone) (on, off, whiteMode, whiteTemperature, nightMode, brightness, saturation, hue, effectMode, link, unlink
//  RGBWW (on, off, whiteMode, whiteTemperature, nightMode, brightness, saturation, hue, effectMode, link, unlink
//  RGB (on, off, hue (but watch out, targets last turned on bulb), link, unlink)
class Zone {
  /**
   * Construct a zone
   * @param options
   */
  constructor({
    zoneId, bridgeCommands, sendBridgeCommand, bridgeType, zoneNumber, zoneType, log, error,
  }) {
    this.id = zoneId;
    this.number = zoneNumber;
    this.bridgeType = bridgeType;
    this.type = zoneType;
    this.log = log;
    this.error = error;
    this._sendCommand = sendBridgeCommand;

    this.brightness = 1;
    this.temperature = 1;
    this.hue = 1;
    this.light_mode = 'color';

    // Create zone command from bridge commands
    this.commands = this._getZoneTypeCommands(bridgeCommands);

    // Construct name
    this.name = `Zone ${this.number} ${this.type}`;

    this.log(`Created ${this.name}`);
  }

  /**
   * Turn on all lights in this zone.
   * Retryable for Legacy: RGB, WHITE, RGBW, V6: BRIDGE, RGBW, WHITE, RGBFullColor, RGBWW, RGB
   */
  async turnOn() {
    this.log(`turnOn() -> zone ${this.number} ${this.type}`, this.turnOnCommand);
    setTimeout(() => this._sendCommand(this.turnOnCommand), RETRY_TIMEOUT);
    return this._sendCommand(this.turnOnCommand);
  }

  /**
   * Turn off all lights in this zone.
   * Retryable for Legacy: RGB, WHITE, RGBW, V6: BRIDGE, RGBW, WHITE, RGBFullColor, RGBWW, RGB
   */
  async turnOff() {
    this.log(`turnOff() -> zone ${this.number} ${this.type}`, this.turnOffCommand);
    setTimeout(() => this._sendCommand(this.turnOffCommand), RETRY_TIMEOUT);
    return this._sendCommand(this.turnOffCommand);
  }

  /**
   * Set brightness on all lights in
   * this zone.
   * @param brightness Range 0 - 1
   */
  setBrightness(brightness) {
    this.log(`setBrightness() -> zone:${this.number}_${this.type} to ${brightness}`);
    const command = this.setBrightnessCommand(brightness);
    this.brightness = brightness; // Set only after setBrightnessCommand() is called, else diff is always zero
    if (command instanceof Error) throw command;
    setTimeout(() => this._sendCommand(command), RETRY_TIMEOUT);
    return this._sendCommand(command);
  }

  /**
   * Set the hue value of all lights in this
   * zone.
   */
  async setHue(hue) {
    if (typeof hue === 'undefined') throw new Error('missing_hue_parameter');
    if (hue < 0 || hue > 1) throw new RangeError(`hue_parameter_out_of_range_${hue}`);
    if (this.type !== ZONE_TYPE.RGBWW
      && this.type !== ZONE_TYPE.RGBW
      && this.type !== ZONE_TYPE.RGB
      && this.type !== ZONE_TYPE.BRIDGE
      && this.type !== ZONE_TYPE.EIGHT_ZONE_CONTROLLER) {
      throw new Error('Can not set hue on this type of device');
    }

    this.log(`setHue() -> hue: ${hue} -> zone:${this.number}_${this.type} to ${hue}`);

    this.hue = hue;
    this.light_mode = 'color';

    const command = this.setHueCommand(hue);
    setTimeout(() => this._sendCommand(command), RETRY_TIMEOUT);
    return this._sendCommand(command);
  }

  /**
   * Set hue and saturation in one command
   * @param hue
   * @param saturation
   * @returns {Promise<*>}
   */
  async setHueAndSaturation(hue, saturation) {
    if (typeof hue === 'undefined') throw new Error('missing_hue_parameter');
    if (typeof saturation === 'undefined') throw new Error('missing_saturation_parameter');
    if (hue < 0 || hue > 1) throw new RangeError(`hue_parameter_out_of_range_${hue}`);
    if (saturation < 0 || saturation > 1) throw new RangeError(`saturation_parameter_out_of_range_${saturation}`);
    if (this.type !== ZONE_TYPE.RGBWW && this.type !== ZONE_TYPE.BRIDGE && this.type !== ZONE_TYPE.EIGHT_ZONE_CONTROLLER) {
      throw new Error('Can not set hue and saturation on this type of device');
    }

    this.log(`setHueAndSaturation() -> hue: ${hue} -> saturation: ${saturation} -> zone:${this.number}_${this.type}`);
    const hueCommandArray = this.setHueCommand(hue);

    this.log(`setSaturation() -> saturation: ${saturation} -> zone:${this.number}_${this.type} to ${saturation}`);
    const saturationCommandArray = this.setSaturationCommand(saturation);

    this.hue = hue;
    this.light_mode = 'color';
    this.saturation = saturation;

    const command = [...hueCommandArray, ...saturationCommandArray];
    setTimeout(() => this._sendCommand(command), RETRY_TIMEOUT);
    return this._sendCommand(command);
  }

  /**
   * Set the light temperature on
   * all white lights in this zone.
   * @param temperature Range 0 - 1
   */
  setTemperature(temperature) {
    if (this.type !== ZONE_TYPE.WHITE && this.type !== ZONE_TYPE.RGBWW && this.type !== ZONE_TYPE.EIGHT_ZONE_CONTROLLER) {
      throw new Error('Can not set temperature on this type of device');
    }

    if (this.type === ZONE_TYPE.RGBWW) {
      this.log(`setTemperature() -> zone:${this.number}_${this.type} to ${100 - temperature * 100}`);
    } else {
      this.log(`setTemperature() -> zone:${this.number}_${this.type} to ${temperature}`);
    }

    this.temperature = temperature;
    this.light_mode = 'temperature';

    return this._sendCommand(this.setTemperatureCommand(temperature));
  }

  /**
   * Enable white mode on all rgbw
   * lights in this zone.
   */
  enableWhiteMode(temperature) {
    if (this.type !== ZONE_TYPE.RGBW && this.type !== ZONE_TYPE.RGBWW && this.type !== ZONE_TYPE.BRIDGE && this.type !== ZONE_TYPE.EIGHT_ZONE_CONTROLLER) {
      throw new Error('Can not enable white mode on this type of device');
    }

    this.log(`enableWhiteMode() -> zone:${this.number}_${this.type}`);
    this.light_mode = 'temperature';

    const command = this.whiteModeCommand(temperature);
    setTimeout(() => this._sendCommand(command), RETRY_TIMEOUT);
    return this._sendCommand(command);
  }

  /**
   * Enable night mode on all rgbw
   * lights in this zone.
   */
  enableNightMode() {
    if (this.type !== ZONE_TYPE.RGBWW && this.type !== ZONE_TYPE.RGBW && this.type !== ZONE_TYPE.WHITE && this.type !== ZONE_TYPE.BRIDGE && this.type !== ZONE_TYPE.EIGHT_ZONE_CONTROLLER) {
      throw new Error('Can not enable night mode on this type of device');
    }

    this.log(`enableNightMode() -> zone:${this.number}_${this.type}`);
    this.light_mode = 'temperature';

    const command = this.nightModeCommand;
    setTimeout(() => this._sendCommand(command), RETRY_TIMEOUT);
    return this._sendCommand(command);
  }

  /**
   * Enable a scene on all rgbw
   * lights in this zone.
   */
  toggleScene(sceneId) {
    if (this.type !== ZONE_TYPE.RGBWW && this.type !== ZONE_TYPE.RGBW && this.type !== ZONE_TYPE.EIGHT_ZONE_CONTROLLER) {
      throw new Error('Can not toggle scene on this type of device');
    }
    this.log(`toggleScene() -> sceneId:${sceneId} -> zone:${this.number}_${this.type}`);
    return this._sendCommand(this.toggleSceneCommand(sceneId));
  }

  /**
   * Scenespeed higher on all rgbw
   * lights in this zone.
   */
  setSceneSpeedUp() {
    if (this.type !== ZONE_TYPE.RGBWW && this.type !== ZONE_TYPE.RGBW && this.type !== ZONE_TYPE.EIGHT_ZONE_CONTROLLER) {
      throw new Error('Can not set scene speed up on this type of device');
    }
    this.log(`setSceneSpeedUp() -> zone:${this.number}_${this.type} scene speed up`);
    return this._sendCommand(this.sceneSpeedUpCommand);
  }

  /**
   * Scenespeed lower on all rgbw
   * lights in this zone.
   */
  setSceneSpeedDown() {
    if (this.type !== ZONE_TYPE.RGBWW && this.type !== ZONE_TYPE.RGBW && this.type !== ZONE_TYPE.EIGHT_ZONE_CONTROLLER) {
      throw new Error('Can not set scene speed down on this type of device');
    }
    this.log(`setSceneSpeedDown() -> zone:${this.number}_${this.type} scene speed down`);
    return this._sendCommand(this.sceneSpeedDownCommand);
  }

  // /**
  //  * Set the saturation value of all lights in this zone.
  //  * @param saturation
  //  * @returns {Promise}
  //  */
  // async setSaturation(saturation) {
  //   if (typeof saturation === 'undefined') return Promise.reject(new Error('missing_saturation_parameter'));
  //   if (saturation < 0 || saturation > 1) {
  //     return Promise.reject(new RangeError(`saturation_parameter_out_of_range_${saturation}`));
  //   }
  //
  //   await this.setHue(this.hue);
  //
  //   this.log(`setSaturation() -> saturation: ${saturation} -> zone:${this.number}_${this.type} to ${saturation}`);
  //
  //   // Only available on rgbww
  //   if (this.type === ZONE_TYPE.RGBWW && this.bridgeType === BRIDGE_TYPE.IBOX) {
  //     this.saturation = saturation;
  //     const command = [this.commands.on(this.number), this.commands.saturation(this.number, Math.round(MilightZone.map(0, 1, 100, 0, saturation)))];
  //     setTimeout(() => this._sendCommand(command), RETRY_TIMEOUT);
  //     return this._sendCommand(command);
  //   }
  //   return Promise.reject('not_rgbww_or_bridge_v6');
  // }

  get turnOnCommand() {
    return this.commands.on(this.number);
  }

  get turnOffCommand() {
    return this.commands.off(this.number);
  }

  /**
   * Returns function returning array of commands
   * @returns {Function}
   */
  get setHueCommand() {
    return (hue) => {
      const bridgeCorrection = 0.015;
      const fullColorCorrection = 0.045;
      const rgbwCorrection = (this.bridgeType === BRIDGE_TYPE.IBOX) ? 0.115 : 0;

      switch (this.type) {
        case ZONE_TYPE.BRIDGE:
          hue += bridgeCorrection;
          break;
        case ZONE_TYPE.RGB:
          hue = hue; // TODO: add calibration value
          break;
        case ZONE_TYPE.RGBW:
          hue += rgbwCorrection;
          break;
        case ZONE_TYPE.RGBWW:
          hue += fullColorCorrection;
          break;
      }

      if (hue === 0) hue = 0.01; // Some bulbs don't accept a hue of zero

      // Update hue
      if (this.type === ZONE_TYPE.RGBW || this.type === ZONE_TYPE.RGBWW || this.type === ZONE_TYPE.EIGHT_ZONE_CONTROLLER) {
        if (this.bridgeType === BRIDGE_TYPE.IBOX) {
          return [this.commands.on(this.number), this.commands.hue(this.number, Math.round(Zone.map(0, 1, 0, 255, hue)))];
        }
        return [this.commands.on(this.number), this.commands.hue(Math.round(Zone.map(0, 1, 0, 255, hue)))];
      }
      return [this.commands.hue(Math.round(Zone.map(0, 1, 1, 256, hue)))];
    };
  }

  /**
   * Returns function returning array of commands
   * @returns {Function}
   */
  get setSaturationCommand() {
    return (saturation) => {
      return [this.commands.on(this.number), this.commands.saturation(this.number, Math.round(Zone.map(0, 1, 100, 0, saturation)))];
    };
  }

  /**
   * Returns function returning array of commands
   * @returns {Function}
   */
  get whiteModeCommand() {
    return (temperature) => {
      if (this.bridgeType === BRIDGE_TYPE.IBOX) {
        if (this.type === ZONE_TYPE.RGBWW || this.type === ZONE_TYPE.EIGHT_ZONE_CONTROLLER) {
          if (typeof this.temperature !== 'number') throw new Error('Missing temperature parameter');
          return [this.commands.on(this.number), this.commands.whiteTemperature(this.number, 100 - temperature * 100)];
        }
        return [this.commands.whiteMode(this.number)];
      }

      return [this.commands.on(this.number), this.commands.whiteMode(this.number)];
    };
  }

  /**
   * Returns array of commands
   * @returns {Array}
   */
  get nightModeCommand() {
    if (this.type === ZONE_TYPE.BRIDGE) {
      return this.whiteModeCommand();
    }
    if (this.bridgeType === BRIDGE_TYPE.IBOX) {
      return [this.commands.nightMode(this.number)];
    }

    return [this.commands.on(this.number), this.commands.nightMode(this.number)];
  }

  /**
   * Returns function returning array of commands
   * @returns {Function}
   */
  get toggleSceneCommand() {
    return (sceneId) => {
      if (this.bridgeType === BRIDGE_TYPE.IBOX) {
        if (sceneId) {
          return [this.commands.effectMode(this.number, sceneId)];
        }
        return [this.commands.on(this.number), this.commands.effectModeNext(this.number)];
      }
      return [this.commands.on(this.number), this.commands.effectModeNext(this.number)];
    };
  }

  /**
   * Returns single command
   * @returns command
   */
  get sceneSpeedUpCommand() {
    return this.commands.effectSpeedUp(this.number);
  }

  /**
   * Returns single command
   * @returns command
   */
  get sceneSpeedDownCommand() {
    return this.commands.effectSpeedDown(this.number);
  }

  /**
   * Returns function returning array of commands
   * @returns {Function}
   */
  get setBrightnessCommand() {
    return (brightness) => {
      // Determine proper command
      switch (this.type) {
        case ZONE_TYPE.RGBW:
          // Turn off if
          if (brightness < 0.01) return [this.turnOffCommand];

          // Send brightness command
          if (this.bridgeType === BRIDGE_TYPE.IBOX) {
            return [this.commands.on(this.number), this.commands.brightness(this.number, brightness * 100)];
          }

          return [this.commands.on(this.number), this.commands.brightness(brightness * 100)];
        case ZONE_TYPE.RGBWW:

          // Turn off if
          if (brightness < 0.01) return [this.turnOffCommand];

          // Send brightness command
          if (this.bridgeType === BRIDGE_TYPE.IBOX) {
            return [this.commands.on(this.number), this.commands.brightness(this.number, brightness * 100)];
          }
          return [this.commands.on(this.number), this.commands.brightness(brightness * 100)];
        case ZONE_TYPE.EIGHT_ZONE_CONTROLLER:

          // Turn off if
          if (brightness < 0.01) return [this.turnOffCommand];

          // Send brightness command
          return [this.commands.on(this.number), this.commands.brightness(this.number, brightness * 100)];
        case ZONE_TYPE.RGB:

          // Set brightness
          return this.setRgbBrightnessCommand(brightness);
        case ZONE_TYPE.WHITE:

          // Set brightness
          return this.setWhiteBrightnessCommand(brightness);
        case ZONE_TYPE.BRIDGE:

          // Turn off if
          if (brightness < 0.01) return [this.turnOffCommand];

          // Send brightness command
          return [this.commands.on(this.number), this.commands.brightness(brightness * 100)];
        default:
          return new Error('Invalid zone type');
      }
    };
  }

  /**
   * Returns function returning array of commands
   * @returns {Function}
   */
  get setTemperatureCommand() {
    return (temperature) => {
      if (this.type === ZONE_TYPE.WHITE) {
        const commands = [this.commands.on(this.number)];

        // Calculate temperature difference
        const tempDiff = Math.round((temperature - this.temperature) * 10);
        if (tempDiff > 0) {
          for (let i = 0; i < tempDiff; i++) {
            // Send commands to turn light warmer
            commands.push(this.commands.warmer(this.number));
          }
        } else {
          for (let i = 0; i < -tempDiff; i++) {
            // Send commands to turn light cooler
            commands.push(this.commands.cooler(this.number));
          }
        }
        return commands; // TODO: how can this work? Not executed in series?
      }
      if (this.type === ZONE_TYPE.RGBWW | this.type === ZONE_TYPE.EIGHT_ZONE_CONTROLLER) {
        return [this.commands.on(this.number), this.commands.whiteTemperature(this.number, 100 - temperature * 100)];
      }
    };
  }

  /**
   * Returns function returning array of commands
   * @returns {Function}
   */
  get setRgbBrightnessCommand() {
    return (brightness) => {
      const brightnessDiff = Math.round((brightness - this.brightness) * 10);

      // If brightness should be max
      if (brightness > 0.95) {
        const commands = [];
        if (this.bridgeType !== BRIDGE_TYPE.IBOX) commands.push(this.commands.on(this.number)); // activate

        // Set brightness to max by sending brightUp multiple times
        for (let i = 0; i < 5; i++) {
          commands.push(this.commands.brightUp());
        }
        return commands;
      }
      if (brightness < 0.01) {
        // Turn off below 0.01
        return [this.commands.off()];
      }
      if (brightnessDiff > 0) {
        const commands = [];
        if (this.bridgeType !== BRIDGE_TYPE.IBOX) commands.push(this.commands.on(this.number)); // activate
        for (let i = 0; i < brightnessDiff; i++) {
          commands.push(this.commands.brightUp());
        }
        return commands;
      }
      if (brightnessDiff < 0) {
        const commands = [];
        if (this.bridgeType !== BRIDGE_TYPE.IBOX) commands.push(this.commands.on(this.number)); // activate
        for (let i = 0; i < -brightnessDiff; i++) {
          commands.push(this.commands.brightDown());
        }
        return commands;
      }
      return []; // in case diff is zero
    };
  }

  /**
   * Returns function returning array of commands
   * @returns {Function}
   */
  get setWhiteBrightnessCommand() {
    return (brightness) => {
      const brightnessDiff = Math.round((brightness - this.brightness) * 10);

      // If brightness should be minimal
      if (brightness < 0.01) {
        // Below 0.01 turn light off
        return [this.commands.off(this.number)];
      }
      if (brightness > 0.95) {
        // Turn light to max brightness
        if (this.bridgeType === BRIDGE_TYPE.IBOX) {
          return [this.commands.on(this.number), this.commands.maxBright(this.number)];
        }
        return [this.commands.on(this.number), this.commands.maxBright(this.number)];
      }
      if (brightnessDiff > 0) {
        const commands = [];
        commands.push(this.commands.on(this.number)); // activate
        for (let i = 0; i < brightnessDiff; i++) {
          if (this.bridgeType === BRIDGE_TYPE.IBOX) commands.push(this.commands.brightUp(this.number));
          else commands.push(this.commands.brightUp(this.number));
        }

        return commands;
      }
      if (brightnessDiff < 0) {
        const commands = [];
        commands.push(this.commands.on(this.number)); // activate
        for (let i = 0; i < -brightnessDiff; i++) {
          if (this.bridgeType === BRIDGE_TYPE.IBOX) commands.push(this.commands.brightDown(this.number));
          else commands.push(this.commands.brightDown(this.number));
        }

        return commands;
      }
    };
  }

  /**
   * Method that takes the bridge commands and gets the zone specific commands.
   * @param bridgeCommands
   * @returns {*}
   */
  _getZoneTypeCommands(bridgeCommands) {
    switch (this.type) {
      case ZONE_TYPE.BRIDGE:
        return bridgeCommands.bridge;
      case ZONE_TYPE.WHITE:
        return bridgeCommands.white;
      case ZONE_TYPE.RGB:
        return bridgeCommands.rgb;
      case ZONE_TYPE.RGBW:
        return bridgeCommands.rgbw;
      case ZONE_TYPE.RGBWW:
        return bridgeCommands.fullColor;
      case ZONE_TYPE.EIGHT_ZONE_CONTROLLER:
        return bridgeCommands.fullColor8Zone;
      default:
        throw new Error('Invalid zone commands');
    }
  }

  /**
   * Map a range of values to a different range of values
   * @param inputStart
   * @param inputEnd
   * @param outputStart
   * @param outputEnd
   * @param input
   * @returns {*}
   */
  static map(inputStart, inputEnd, outputStart, outputEnd, input) {
    return outputStart + ((outputEnd - outputStart) / (inputEnd - inputStart)) * (input - inputStart);
  }

  /**
   * Calculate hue value usable
   * for Milight bridge.
   * @param hue Range 0 - 1
   * @returns {Number}
   * @private
   */
  static _calculateHue(hue) {
    const hex = ((256 + 176 - Math.floor(Number(hue) * 255.0)) % 256).toString(16);
    return (hex.length < 2) ? parseInt(`0x0${hex}`) : parseInt(`0x${hex}`);
  }
}

module.exports = Zone;
