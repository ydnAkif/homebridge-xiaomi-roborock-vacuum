"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoToService = void 0;
const plugin_service_class_1 = require("./plugin_service_class");
const ensure_name_1 = require("../utils/ensure_name");
class GoToService extends plugin_service_class_1.PluginServiceClass {
    service;
    constructor(coreContext) {
        super(coreContext);
        const name = `${this.config.name} ${this.config.goToWord}`;
        this.service = new this.hap.Service.Switch(name, "GoTo Switch");
        (0, ensure_name_1.ensureName)(this.hap, this.service, name);
        this.service
            .getCharacteristic(this.hap.Characteristic.On)
            .onGet(() => this.getGoToState())
            .onSet((newState) => this.goTo(newState));
    }
    async init() { }
    get services() {
        return [this.service];
    }
    async goTo(newState) {
        await this.deviceManager.ensureDevice("goTo");
        this.log.info(`ACT goTo | Let's go!`);
        try {
            if (newState) {
                //trigger go to location if newState is true
                await this.deviceManager.device.sendToLocation(this.config.goToX, this.config.goToY);
            }
            else if (!newState) {
                //trigger go to dock if newState is false
                await this.deviceManager.device.activateCharging();
            }
        }
        catch (err) {
            this.log.error(`goTo | `, err);
            throw err;
        }
    }
    async getGoToState() {
        await this.deviceManager.ensureDevice("getGoToState");
        try {
            const goingToLocation = this.deviceManager.state === "going-to-location" ||
                this.deviceManager.state === "waiting";
            this.log.debug(`getGoToState | Going to location or waiting is ${goingToLocation}`);
            return goingToLocation;
        }
        catch (err) {
            this.log.error(`getGoToState | Failed getting the cleaning status.`, err);
            throw err;
        }
    }
}
exports.GoToService = GoToService;
//# sourceMappingURL=go_to_service.js.map