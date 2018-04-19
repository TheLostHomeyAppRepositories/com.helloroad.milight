'use strict';

const Homey = require('homey');

const onecolor = require('onecolor');

const MilightDevice = require('./milightDevice');

class MilightDriver extends Homey.Driver {

	/**
	 * Method that will be called when a driver is initialized. It will register Flow Cards
	 * for the respective drivers. Options parameter should at least contain a driverType
	 * property.
	 * @param options {Object}
	 * @returns {Error}
	 */
	onInit(options) {
		if (!options.hasOwnProperty('driverType')) return new Error('missing_driver_type');

		// Store driverType
		this.driverType = options.driverType;

		// Register Flow Cards for RGB, RGBW and RGBWW
		if (this.driverType.includes('RGB')) {
			new Homey.FlowCardAction('set_color_rgb')
				.register()
				.registerRunListener(args => {
					const myColor = onecolor(args.color);
					args.color = myColor.hue();
					return args.device.onCapabilityLightHue(args.color);
				});

			// Register Flow Cards for RGBW and RGBWW
			if (this.driverType.includes('RGBW')) {

				new Homey.FlowCardAction('white_mode')
					.register()
					.registerRunListener(args => args.device.onCapabilityLightMode('temperature'));

				new Homey.FlowCardAction('disco_mode')
					.register()
					.registerRunListener(args => args.device.onCapabilityLightMode('disco'));

				new Homey.FlowCardAction('disco_mode_specific')
					.register()
					.registerRunListener(args => args.device.onCapabilityLightMode(Number(args.mode)));

				new Homey.FlowCardAction('enable_night_mode')
					.register()
					.registerRunListener(args => args.device.onCapabilityLightMode('night'));

				new Homey.FlowCardAction('disco_mode_faster')
					.register()
					.registerRunListener(args => args.device.zone.setSceneSpeedUp());

				new Homey.FlowCardAction('disco_mode_slower')
					.register()
					.registerRunListener(args => args.device.zone.setSceneSpeedDown());
			}
		}
	}

	/**
	 * Always use MilightDevice as device for this driver.
	 * @returns {MilightDevice}
	 */
	onMapDeviceClass() {
		return MilightDevice;
	}

	/**
	 * Method that will be called upon pairing. It handles discovering bridges for all types
	 * of drivers. After pairing is ended it removes the bridges it found that were not added.
	 * @param socket
	 */
	onPair(socket) {
		socket.on('list_devices', (data, callback) => {
			Homey.app.BridgeManager.discoverBridges({ temp: true })
				.then(bridges => {
					const results = [];
					if (Array.isArray(bridges)) {
						for (let i = 0; i < bridges.length; i++) {
							if (typeof bridges[i].getZones !== 'function') continue;
							const zones = bridges[i].getZones(this.driverType);
							if (!Array.isArray(zones)) continue;
							for (let j = 0; j < zones.length; j++) {
								results.push({
									name: (bridges[i].bridgeVersion === 6) ? `iBox Bridge ${parseInt(i) + 1} ${zones[j].name}` : `Bridge ${parseInt(i) + 1} ${zones[j].name}`,
									data: {
										id: zones[j].id,
										bridgeMacAddress: bridges[i].mac,
										zoneNumber: parseInt(j) + 1,
										driverType: this.driverType,
									},
								});
							}
						}
					}
					return callback(null, results);
				})
				.catch(err => callback(err.stack, false));
		});
		socket.on('disconnect', () => setTimeout(() => Homey.app.BridgeManager.deregisterTempBridges, 30000));
	}
}

module.exports = MilightDriver;
