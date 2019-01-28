'use strict';

const Homey = require('homey');
const onecolor = require('onecolor');
const WifiDevice = require('homey-wifidriver').WifiDevice;

const wifiDeviceOptions = {
	backOffStrategy: {
		randomisationFactor: 0,
		initialDelay: 10000,
		maxDelay: 1000 * 60 * 60, // 1 hour
	},
};

class MilightDevice extends WifiDevice {

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
			}
			else {

				// Handle Base64 encoded mac address
				const buf = new Buffer(deviceData.bridgeID, 'base64');
				deviceData.bridgeMacAddress = buf.toString('utf8');
			}
		}

		// Add driver type property
		if (!deviceData.hasOwnProperty('driverType')) deviceData.driverType = this.getDriver().driverType;

		return deviceData;
	}

	/**
	 * Method that will be called when a device is initialized. It will bind the capability
	 * listeners specific to the driverType, and it will fetch/search a bridge and stores
	 * a reference to that bridge.
	 */
	onInit() {
		super.onInit(wifiDeviceOptions);

		this.log(`onInit() -> ${this.getData().bridgeMacAddress} - ${this.getData().driverType} - ${this.getData().zoneNumber}`);

		// Start discovery or retrieve already discovered bridge
		Homey.app.BridgeManager.findBridge(this.getData().bridgeMacAddress)
			.then(bridge => {

				// Register that this bridge is being used to prevent it from being destroyed
				Homey.app.BridgeManager.registerBridge(bridge, false);

				// Register this device with the bridge
				bridge.registerDevice(this.getData());

				// Set available and unavailable when bridge is down
				bridge
					.on('offline', () => this.setUnavailable(Homey.__('no_response')))
					.on('online', () => this.setAvailable());

				// Store additional properties
				this.name = `Zone ${this.getData().zoneNumber} ${this.getData().driverType}`;
				this.bridge = bridge;

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
						await this.onCapabilityLightHue(valueObj['light_hue'] || this.getCapabilityValue('light_hue'));
						await this.onCapabilityLightSaturation(valueObj['light_saturation'] || this.getCapabilityValue('light_saturation'));
						return Promise.resolve();
					}, 500);
				} else if (this.hasCapability('light_hue')) {
					this.registerCapabilityListener('light_hue', this.onCapabilityLightHue.bind(this));
				}

				this.log(`onInit() -> ${this.getData().bridgeMacAddress} - ${this.getData().driverType} - ${this.getData().zoneNumber} -> succeeded`);
				this.setAvailable();

				// Abort retrying initialization
				this.resetBackOff();
			})
			.catch(err => {
				this.setUnavailable(Homey.__('no_response'));
				this.error(`onInit() -> ${this.getData().bridgeMacAddress} - ${this.getData().driverType} - ${this.getData().zoneNumber} -> findBridge() error`, err);

				// Retry initialization
				this.nextBackOff();
			});
	}

	/**
	 * Getter for bridge zone.
	 * @returns {Zone}
	 */
	get zone() {
		return this.bridge.getZone(this.getData().driverType, this.getData().zoneNumber);
	}

	/**
	 * This method will be called when the onoff state needs to be changed.
	 * @param onoff
	 * @returns {Promise}
	 */
	onCapabilityOnOff(onoff) {
		if (onoff) return this.zone.turnOn();
		return this.zone.turnOff();
	}

	/**
	 * This method will be called when the dim needs to be changed.
	 * @param dim
	 * @returns {Promise}
	 */
	onCapabilityDim(dim) {
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
	onCapabilityLightHue(hue) {
		this.setCapabilityValue('light_hue', hue);
		if (this.getSetting('invert_red_and_green') === true) {
			const red = onecolor(`hsl(${hue * 360}, 1, 1)`).red();
			const green = onecolor(`hsl(${hue * 360}, 1, 1)`).green();
			const blue = onecolor(`hsl(${hue * 360}, 1, 1)`).blue();
			const color = onecolor(`rgb(${green},${red},${blue})`);
			this.setCapabilityValue('onoff', true);
			if (this.hasCapability('light_mode')) this.setCapabilityValue('light_mode', 'color');
			return this.zone.setHue(MilightDevice.calibrateHue(color.hue(), this.getSetting('hue_calibration')));
		}
		this.setCapabilityValue('onoff', true);
		if (this.hasCapability('light_mode')) this.setCapabilityValue('light_mode', 'color');
		return this.zone.setHue(MilightDevice.calibrateHue(hue, this.getSetting('hue_calibration')));
	}

	/**
	 * This method will be called when the light saturation needs to be changed.
	 * @param saturation
	 * @returns {Promise}
	 */
	onCapabilityLightSaturation(saturation) {
		this.setCapabilityValue('onoff', true);
		this.setCapabilityValue('light_saturation', saturation);
		if (this.hasCapability('light_mode')) this.setCapabilityValue('light_mode', 'color');
		return this.zone.setSaturation(saturation);
	}

	/**
	 * This method will be called when the light temperature needs to be changed.
	 * @param temperature
	 * @returns {Promise}
	 */
	onCapabilityLightTemperature(temperature) {
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
	onCapabilityLightMode(mode) {
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
		hue = hue + value;
		if (hue > 1) return hue - 1;
		if (hue < 0) return hue + 1;
		return hue;
	}
}

module.exports = MilightDevice;
