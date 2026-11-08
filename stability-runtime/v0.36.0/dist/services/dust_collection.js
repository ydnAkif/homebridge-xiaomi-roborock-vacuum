"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DustCollection = void 0;
const plugin_service_class_1 = require("./plugin_service_class");
const ensure_name_1 = require("../utils/ensure_name");
class DustCollection extends plugin_service_class_1.PluginServiceClass {
    service;
    constructor(coreContext) {
        super(coreContext);
        const name = `${this.config.name} Dust Collection`;
        this.service = new this.hap.Service.Switch(name, "Dust Collection");
        (0, ensure_name_1.ensureName)(this.hap, this.service, name);
        this.service
            .getCharacteristic(this.hap.Characteristic.On)
            .onGet(() => this.getDustCollectionState())
            .onSet((newState) => this.setDustCollectionState(newState));
    }
    async init() { }
    get services() {
        return [this.service];
    }
    get isDustCollecting() {
        return this.deviceManager.state === "dust-collection";
    }
    async getDustCollectionState() {
        await this.deviceManager.ensureDevice("getDustCollectionState");
        try {
            const isDustCollecting = this.isDustCollecting;
            this.log.debug(`getDustCollectionState | Dust collection is ${isDustCollecting}`);
            return isDustCollecting;
        }
        catch (err) {
            this.log.error(`getDustCollectionState | Failed getting the cleaning status.`, err);
            throw err;
        }
    }
    async setDustCollectionState(state) {
        await this.deviceManager.ensureDevice("setDustCollectionState");
        const isCharging = this.deviceManager.state;
        try {
            if (state && !this.isDustCollecting && isCharging) {
                await this.deviceManager.device.startDustCollection();
                this.log.info(`setDustCollectionState | Starting Dust Collection, and the device is in state ${this.deviceManager.state}`);
            }
            else if (!state && this.isDustCollecting) {
                await this.deviceManager.device.stopDustCollection();
                this.log.info(`setDustCollectionState | Stopping Dust Collection, and the device is in state ${this.deviceManager.state}`);
            }
            else if (state && !this.isDustCollecting && !isCharging) {
                this.service
                    .getCharacteristic(this.hap.Characteristic.On)
                    .updateValue(false);
                this.log.info(`setDustCollectionState | Starting Dust Collection not possible, and the device is in state ${this.deviceManager.state}`);
            }
        }
        catch (err) {
            this.log.error(`setDustCollectionState | Failed updating dust collection state ${state}.`, err);
            throw err;
        }
    }
}
exports.DustCollection = DustCollection;
//# sourceMappingURL=dust_collection.js.map