'use strict';

const Driver = require('../../lib/GenericDriver');
const { ZONE_TYPE } = require('../../lib/constants');

class MilightRGBWDriver extends Driver {
  onInit() {
    super.onInit({
      driverType: ZONE_TYPE.RGBW,
    });
  }
}

module.exports = MilightRGBWDriver;
