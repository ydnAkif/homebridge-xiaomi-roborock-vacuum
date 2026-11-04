"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatteryInfo = void 0;
const plugin_service_class_1 = require("./plugin_service_class");
class BatteryInfo extends plugin_service_class_1.PluginServiceClass {
    service;
    isCharging;
    constructor(coreContext) {
        super(coreContext);
        this.service = new this.hap.Service.Battery(`${this.config.name} Battery`);
        this.service
            .getCharacteristic(this.hap.Characteristic.BatteryLevel)
            .onGet(() => this.getBattery());
        this.service
            .getCharacteristic(this.hap.Characteristic.ChargingState)
            .onGet(() => this.getCharging());
        this.service
            .getCharacteristic(this.hap.Characteristic.StatusLowBattery)
            .onGet(() => this.getBatteryLow());
    }
    async init() {
        this.deviceManager.stateChanged$.subscribe(({ key, value }) => {
            if (key === "batteryLevel") {
                this.changedBattery(value);
            }
            else if (key === "charging") {
                this.changedCharging(value);
            }
        });
    }
    get services() {
        return [this.service];
    }
    changedBattery(level) {
        this.log.debug(`DEB changedBattery | BatteryLevel ${level}%`);
        this.service
            .getCharacteristic(this.hap.Characteristic.BatteryLevel)
            .updateValue(level);
        this.service
            .getCharacteristic(this.hap.Characteristic.StatusLowBattery)
            .updateValue(level < 20
            ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
            : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
    }
    changedCharging(isCharging) {
        const isNewValue = this.isCharging !== isCharging;
        this.isCharging = isCharging;
        if (isNewValue) {
            this.log.info(`changedCharging | Charging is ${isCharging ? "active" : "cancelled"}`);
        }
        // We still update the value in Homebridge. If we are calling the changed method is because we want to change it.
        this.service
            .getCharacteristic(this.hap.Characteristic.ChargingState)
            .updateValue(isCharging
            ? this.hap.Characteristic.ChargingState.CHARGING
            : this.hap.Characteristic.ChargingState.NOT_CHARGING);
    }
    async getBattery() {
        const batteryLevel = await this.deviceManager.device.batteryLevel();
        this.log.debug(`getBattery | BatteryLevel is ${batteryLevel}%`);
        return batteryLevel;
    }
    async getBatteryLow() {
        const batteryLevel = await this.deviceManager.device.batteryLevel();
        this.log.debug(`getBatteryLow | BatteryLevel is ${batteryLevel}%`);
        return batteryLevel < 20
            ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
            : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    async getCharging() {
        const status = this.deviceManager.state;
        const isCharging = status === "charging";
        this.log.debug(`getCharging | Charging is ${isCharging} (Status is ${status})`);
        return isCharging
            ? this.hap.Characteristic.ChargingState.CHARGING
            : this.hap.Characteristic.ChargingState.NOT_CHARGING;
    }
}
exports.BatteryInfo = BatteryInfo;
//# sourceMappingURL=battery_info.js.map