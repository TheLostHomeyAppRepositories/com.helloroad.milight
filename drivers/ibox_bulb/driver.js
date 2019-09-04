'use strict';

const Driver = require('../../lib/GenericDriver');
const { ZONE_TYPE } = require('../../lib/constants');

class MilightIBoxDriver extends Driver {
  onInit() {
    super.onInit({
      driverType: ZONE_TYPE.BRIDGE,
    });
  }
}

module.exports = MilightIBoxDriver;
