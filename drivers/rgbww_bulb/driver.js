'use strict';

const Driver = require('../../lib/GenericDriver');
const { ZONE_TYPE } = require('../../lib/constants');

class MilightRGBWWDriver extends Driver {
  onInit() {
    super.onInit({
      driverType: ZONE_TYPE.RGBWW,
    });
  }
}

module.exports = MilightRGBWWDriver;
