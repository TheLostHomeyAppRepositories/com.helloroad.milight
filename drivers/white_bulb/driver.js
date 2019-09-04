'use strict';

const Driver = require('../../lib/GenericDriver');
const { ZONE_TYPE } = require('../../lib/constants');

class MilightWhiteDriver extends Driver {
  onInit() {
    super.onInit({
      driverType: ZONE_TYPE.WHITE,
    });
  }
}

module.exports = MilightWhiteDriver;
