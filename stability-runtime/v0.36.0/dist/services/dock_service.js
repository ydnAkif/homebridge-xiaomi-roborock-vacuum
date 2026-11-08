"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DockService = void 0;
const rxjs_1 = require("rxjs");
const plugin_service_class_1 = require("./plugin_service_class");
const ensure_name_1 = require("../utils/ensure_name");
class DockService extends plugin_service_class_1.PluginServiceClass {
    service;
    constructor(coreContext) {
        super(coreContext);
        const name = `${this.config.name} Dock`;
        this.service = new this.hap.Service.OccupancySensor(name);
        (0, ensure_name_1.ensureName)(this.hap, this.service, name);
        this.service
            .getCharacteristic(this.hap.Characteristic.OccupancyDetected)
            .onGet(() => this.getDocked());
    }
    async init() {
        this.deviceManager.stateChanged$
            .pipe((0, rxjs_1.filter)(({ key }) => key === "charging"), (0, rxjs_1.map)(({ value }) => value === true), (0, rxjs_1.tap)((isCharging) => {
            this.service
                .getCharacteristic(this.hap.Characteristic.OccupancyDetected)
                .updateValue(isCharging);
        }), (0, rxjs_1.distinct)())
            .subscribe((isCharging) => {
            const msg = isCharging
                ? "Robot was docked"
                : "Robot not anymore in dock";
            this.log.info(`changedCharging | ${msg}.`);
        });
    }
    get services() {
        return [this.service];
    }
    async getDocked() {
        const status = this.deviceManager.state;
        const isCharging = status === "charging";
        this.log.debug(`getDocked | Robot Docked is ${isCharging} (Status is ${status})`);
        return isCharging;
    }
}
exports.DockService = DockService;
//# sourceMappingURL=dock_service.js.map