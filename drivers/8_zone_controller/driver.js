'use strict';

const Driver = require('../../lib/GenericDriver');
const { ZONE_TYPE } = require('../../lib/constants');

class MilightEightZoneControllerDriver extends Driver {
  onInit() {
    super.onInit({
      driverType: ZONE_TYPE.EIGHT_ZONE_CONTROLLER,
    });
  }
}

module.exports = MilightEightZoneControllerDriver;
