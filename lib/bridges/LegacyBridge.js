'use strict';

const { commands } = require('node-milight-promise');

const MilightBridge = require('./Bridge');
const { BRIDGE_TYPE, ZONE_TYPE } = require('../constants');

class LegacyBridge extends MilightBridge {
  constructor(options) {
    super(options);
    this.type = BRIDGE_TYPE.LEGACY;
    this.commands = commands;

    // Initialize the bridge's zones
    this.createZones();
  }

  get zoneConfiguration() {
    return [
      { type: ZONE_TYPE.RGB, number: 1 },

      { type: ZONE_TYPE.RGBW, number: 1 },
      { type: ZONE_TYPE.RGBW, number: 2 },
      { type: ZONE_TYPE.RGBW, number: 3 },
      { type: ZONE_TYPE.RGBW, number: 4 },

      { type: ZONE_TYPE.WHITE, number: 1 },
      { type: ZONE_TYPE.WHITE, number: 2 },
      { type: ZONE_TYPE.WHITE, number: 3 },
      { type: ZONE_TYPE.WHITE, number: 4 },
    ];
  }
}

module.exports = LegacyBridge;
