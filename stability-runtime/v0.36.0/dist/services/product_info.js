"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductInfo = void 0;
const rxjs_1 = require("rxjs");
const plugin_service_class_1 = require("./plugin_service_class");
class ProductInfo extends plugin_service_class_1.PluginServiceClass {
    firmware;
    service;
    constructor(coreContext) {
        super(coreContext);
        this.service = new this.hap.Service.AccessoryInformation();
        this.service
            .setCharacteristic(this.hap.Characteristic.Manufacturer, "Xiaomi")
            .setCharacteristic(this.hap.Characteristic.Model, "Roborock");
        this.service
            .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
            .onGet(() => this.getFirmware());
        this.service
            .getCharacteristic(this.hap.Characteristic.Model)
            .onGet(() => this.deviceManager.model);
        this.service
            .getCharacteristic(this.hap.Characteristic.SerialNumber)
            .onGet(() => this.getSerialNumber());
    }
    async init() {
        this.deviceManager.deviceConnected$ // Only run the below once the device is connected
            .pipe((0, rxjs_1.filter)(Boolean), // Make sure it does not trigger with `undefined`
        (0, rxjs_1.concatMap)(async () => {
            this.service.updateCharacteristic(this.hap.Characteristic.Model, this.deviceManager.model);
            const serial = await this.getSerialNumber();
            this.service.updateCharacteristic(this.hap.Characteristic.SerialNumber, `${serial}`);
            this.log.info(`STA getDevice | Serial Number: ${serial}`);
            try {
                const firmware = await this.getFirmware();
                this.firmware = firmware;
                this.service.updateCharacteristic(this.hap.Characteristic.FirmwareRevision, `${firmware}`);
                this.log.info(`STA getDevice | Firmware Version: ${firmware}`);
            }
            catch (err) {
                this.log.error(`ERR getDevice | miIO.info | ${err}`);
            }
        }))
            .subscribe();
    }
    get services() {
        return [this.service];
    }
    async getFirmware() {
        await this.deviceManager.ensureDevice("getFirmware");
        try {
            const firmware = await this.deviceManager.device.getDeviceInfo();
            this.log.debug(`getFirmware | FirmwareVersion is ${firmware.fw_ver}`);
            this.firmware = firmware.fw_ver;
            return firmware.fw_ver;
        }
        catch (err) {
            this.log.error(`getFirmware | Failed getting the firmware version.`, err);
            throw err;
        }
    }
    async getSerialNumber() {
        await this.deviceManager.ensureDevice("getSerialNumber");
        try {
            const serialNumber = await this.deviceManager.device.getSerialNumber();
            this.log.debug(`getSerialNumber | Serial Number is ${serialNumber}`);
            return `${serialNumber}`;
        }
        catch (err) {
            this.log.warn(`getSerialNumber | Failed getting the serial number.`, err);
            return `Unknown`;
        }
    }
}
exports.ProductInfo = ProductInfo;
//# sourceMappingURL=product_info.js.map