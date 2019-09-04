'use strict';

const { commandsV6 } = require('node-milight-promise');

const MilightBridge = require('./Bridge');
const { BRIDGE_TYPE, ZONE_TYPE } = require('../constants');

class iBoxBridge extends MilightBridge {
  constructor(options) {
    super(options);
    this.type = BRIDGE_TYPE.IBOX;
    this.commands = commandsV6;

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

      { type: ZONE_TYPE.RGBWW, number: 1 },
      { type: ZONE_TYPE.RGBWW, number: 2 },
      { type: ZONE_TYPE.RGBWW, number: 3 },
      { type: ZONE_TYPE.RGBWW, number: 4 },

      { type: ZONE_TYPE.BRIDGE, number: 1 },

      { type: ZONE_TYPE.EIGHT_ZONE_CONTROLLER, number: 1 },
      { type: ZONE_TYPE.EIGHT_ZONE_CONTROLLER, number: 2 },
      { type: ZONE_TYPE.EIGHT_ZONE_CONTROLLER, number: 3 },
      { type: ZONE_TYPE.EIGHT_ZONE_CONTROLLER, number: 4 },
      { type: ZONE_TYPE.EIGHT_ZONE_CONTROLLER, number: 5 },
      { type: ZONE_TYPE.EIGHT_ZONE_CONTROLLER, number: 6 },
      { type: ZONE_TYPE.EIGHT_ZONE_CONTROLLER, number: 7 },
      { type: ZONE_TYPE.EIGHT_ZONE_CONTROLLER, number: 8 },
    ];
  }
}

module.exports = iBoxBridge;
