"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PauseSwitch = void 0;
const rxjs_1 = require("rxjs");
const plugin_service_class_1 = require("./plugin_service_class");
const ensure_name_1 = require("../utils/ensure_name");
class PauseSwitch extends plugin_service_class_1.PluginServiceClass {
    roomsService;
    service;
    constructor(coreContext, roomsService) {
        super(coreContext);
        this.roomsService = roomsService;
        const name = `${this.config.name} ${this.config.pauseWord}`;
        this.service = new this.hap.Service.Switch(name, "Pause Switch");
        (0, ensure_name_1.ensureName)(this.hap, this.service, name);
        this.service
            .getCharacteristic(this.hap.Characteristic.On)
            .onGet(() => this.getPauseState())
            .onSet((newState) => this.setPauseState(newState));
    }
    async init() {
        this.deviceManager.stateChanged$
            .pipe((0, rxjs_1.filter)(({ key }) => key === "cleaning"), (0, rxjs_1.distinct)(({ value }) => value))
            .subscribe(({ value }) => this.changedPause(value));
    }
    get services() {
        return [this.service];
    }
    changedPause(isCleaning) {
        this.log.debug(`MON changedPause | CleaningState is now ${isCleaning}`);
        this.log.info(`changedPause | ${isCleaning ? "Paused possible" : "Paused not possible, no cleaning"}`);
        this.service
            .getCharacteristic(this.hap.Characteristic.On)
            .updateValue(isCleaning === true);
    }
    async getPauseState() {
        await this.deviceManager.ensureDevice("getPauseState");
        try {
            const isPaused = this.deviceManager.isPaused;
            const canBePaused = this.deviceManager.isCleaning && !isPaused;
            this.log.debug(`getPauseState | Pause possible is ${canBePaused}`);
            return canBePaused;
        }
        catch (err) {
            this.log.error(`getPauseState | Failed getting the cleaning status.`, err);
            throw err;
        }
    }
    async setPauseState(state) {
        await this.deviceManager.ensureDevice("setPauseState");
        try {
            if (state && this.deviceManager.isPaused) {
                if (this.roomsService.roomIdsToClean.size > 0) {
                    await this.deviceManager.device.resumeCleanRooms(Array.from(this.roomsService.roomIdsToClean));
                    this.log.info(`setPauseState | Resume room cleaning, and the device is in state  ${this.deviceManager.state}`);
                }
                else {
                    await this.deviceManager.device.activateCleaning();
                    this.log.info(`setPauseState | Resume normal cleaning, and the device is in state ${this.deviceManager.state}`);
                }
            }
            else if (!state && this.deviceManager.isCleaning) {
                await this.deviceManager.device.pause();
                this.log.info(`setPauseState | Pause cleaning, and the device is in state ${this.deviceManager.state}`);
            }
        }
        catch (err) {
            this.log.error(`setPauseState | Failed updating pause state ${state}.`, err);
        }
    }
}
exports.PauseSwitch = PauseSwitch;
//# sourceMappingURL=pause_switch.js.map