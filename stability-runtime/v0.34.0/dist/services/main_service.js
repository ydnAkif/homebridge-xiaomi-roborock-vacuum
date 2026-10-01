"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MainService = void 0;
const rxjs_1 = require("rxjs");
const find_speed_modes_1 = require("../utils/find_speed_modes");
const plugin_service_class_1 = require("./plugin_service_class");
class MainService extends plugin_service_class_1.PluginServiceClass {
    productInfo;
    roomsService;
    setWaterSpeed;
    changedPause;
    cachedState = new Map();
    service;
    constructor(coreContext, productInfo, roomsService, setWaterSpeed, changedPause) {
        super(coreContext);
        this.productInfo = productInfo;
        this.roomsService = roomsService;
        this.setWaterSpeed = setWaterSpeed;
        this.changedPause = changedPause;
        if (this.config.serviceType === "fan") {
            this.service = new this.hap.Service.Fan(this.config.name, "Vacuum");
            this.service
                .getCharacteristic(this.hap.Characteristic.RotationSpeed)
                .onGet(() => this.getSpeed())
                .onSet((newState) => this.setSpeed(newState));
        }
        else {
            this.service = new this.hap.Service.Switch(this.config.name, "Vacuum");
        }
        this.service.addOptionalCharacteristic(this.hap.Characteristic.ConfiguredName);
        this.service.setCharacteristic(this.hap.Characteristic.ConfiguredName, this.config.name);
        if (this.service.setPrimaryService)
            this.service.setPrimaryService(true);
        this.service
            .getCharacteristic(this.hap.Characteristic.On)
            .onGet(() => this.getCleaning())
            .onSet((newState) => this.setCleaning(newState))
            .on("change", ({ newValue }) => {
            this.changedPause(newValue === true);
        });
    }
    async init() {
        if (this.config.serviceType === "fan") {
            this.deviceManager.deviceConnected$.subscribe(() => {
                // Now that we know the model, amend the steps in the Rotation speed (for better usability)
                const minStep = 100 / ((0, find_speed_modes_1.findSpeedModes)(this.deviceManager.model).speed.length - 1);
                this.service
                    .getCharacteristic(this.hap.Characteristic.RotationSpeed)
                    .setProps({ minStep: minStep });
            });
            this.deviceManager.stateChanged$
                .pipe((0, rxjs_1.filter)(({ key }) => key === "fanSpeed"), (0, rxjs_1.distinct)(({ value }) => value))
                .subscribe(({ value: speed }) => {
                this.log.info(`MON changedSpeed | FanSpeed is now ${speed}%`);
                const speedMode = this.findSpeedModeFromMiio(speed);
                if (typeof speedMode === "undefined") {
                    this.log.warn(`WAR changedSpeed | Speed was changed to ${speed}%, this speed is not supported`);
                }
                else {
                    const { homekitTopLevel, name } = speedMode;
                    this.log.info(`changedSpeed | Speed was changed to ${speed}% (${name}), for HomeKit ${homekitTopLevel}%`);
                    this.service
                        .getCharacteristic(this.hap.Characteristic.RotationSpeed)
                        .updateValue(homekitTopLevel);
                }
            });
        }
        this.deviceManager.stateChanged$
            .pipe((0, rxjs_1.filter)(({ key }) => key === "cleaning"), (0, rxjs_1.map)(({ value }) => value === true), (0, rxjs_1.tap)((isCleaning) => {
            this.log.debug(`MON changedCleaning | CleaningState is now ${isCleaning}`);
            this.service
                .getCharacteristic(this.hap.Characteristic.On)
                .updateValue(isCleaning);
        }), (0, rxjs_1.distinct)())
            .subscribe((isCleaning) => {
            this.log.info(`changedCleaning | Cleaning is ${isCleaning ? "ON" : "OFF"}.`);
        });
    }
    get services() {
        return [this.service];
    }
    async getCleaning() {
        try {
            await this.deviceManager.ensureDevice("getCleaning");
            const isCleaning = this.deviceManager.isCleaning;
            this.log.info(`getCleaning | Cleaning is ${isCleaning}`);
            return isCleaning;
        }
        catch (err) {
            if (!(err instanceof this.hap.HapStatusError)) this.log.error(`getCleaning | Failed getting the cleaning status.`, err);
            throw err;
        }
    }
    async setCleaning(state) {
        await this.deviceManager.ensureDevice("setCleaning");
        this.log.info(`ACT setCleaning | Set cleaning to ${state}}`);
        try {
            if (state && !this.deviceManager.isCleaning) {
                // Start cleaning
                const roomIdsToClean = this.roomsService.roomIdsToClean;
                if (roomIdsToClean.size > 0) {
                    await this.deviceManager.device.cleanRooms(Array.from(roomIdsToClean));
                    this.log.info(`ACT setCleaning | Start rooms cleaning for rooms ${Array.from(roomIdsToClean)}, device is in state ${this.deviceManager.property("state")}.`);
                }
                else {
                    await this.deviceManager.device.activateCleaning();
                    this.log.info(`ACT setCleaning | Start full cleaning, device is in state ${this.deviceManager.property("state")}.`);
                }
            }
            else if (!state &&
                (this.deviceManager.isCleaning || this.deviceManager.isPaused)) {
                // Stop cleaning
                this.log.info(`ACT setCleaning | Stop cleaning and go to charge, device is in state ${this.deviceManager.property("state")}`);
                await this.deviceManager.device.activateCharging();
            }
        }
        catch (err) {
            this.log.error(`setCleaning | Failed to set cleaning to ${state}`, err);
            throw err;
        }
    }
    async getSpeed() {
        await this.deviceManager.ensureDevice("getSpeed");
        const speed = await this.deviceManager.device.fanSpeed();
        this.log.info(`getSpeed | Fanspeed is ${speed} over miIO. Converting to HomeKit`);
        const { homekitTopLevel, name } = this.findSpeedModeFromMiio(speed) || {};
        this.log.info(`getSpeed | FanSpeed is ${speed} over miIO "${name}" > HomeKit speed ${homekitTopLevel}%`);
        return homekitTopLevel || 0;
    }
    async setSpeed(speed) {
        await this.deviceManager.ensureDevice("setSpeed");
        if (typeof speed === "number") {
            this.log.debug(`ACT setSpeed | Speed got ${speed}% over HomeKit > CLEANUP.`);
        }
        // Get the speed modes for this model
        const speedModes = (0, find_speed_modes_1.findSpeedModes)(this.deviceManager.model, this.productInfo.firmware).speed;
        let miLevel = null;
        let name = null;
        if (typeof speed === "number") {
            // Speed set by number
            // gen1 has maximum of 91%, so anything over that won't work. Getting safety maximum.
            const safeSpeed = Math.min(speed, speedModes[speedModes.length - 1].homekitTopLevel);
            // Find the minimum homekitTopLevel that matches the desired speed
            const speedMode = speedModes.find((mode) => safeSpeed <= mode.homekitTopLevel);
            miLevel = speedMode.miLevel;
            name = speedMode.name;
        }
        else {
            // Set by mode name
            const speedMode = speedModes.find((mode) => mode.name === speed);
            if (speedMode == null) {
                this.log.info(`setSpeed | Mode "${speed}" does not exist.`);
                return;
            }
            miLevel = speedMode.miLevel;
            name = speedMode.name;
        }
        this.log.info(`ACT setSpeed | FanSpeed set to ${miLevel} over miIO for "${name}".`);
        // Save the latest set speed for handling the "custom" speed later
        this.cachedState.set("FanSpeed", miLevel);
        this.cachedState.set("FanSpeedName", name);
        if (miLevel === -1) {
            this.log.info(`setSpeed | FanSpeed is -1 => Calling setCleaning(false) instead of changing the fan speed`);
            await this.setCleaning(false);
        }
        else {
            await this.deviceManager.device.changeFanSpeed(miLevel);
            // If speed is "custom", also set the water speed to "custom" (for Xiaomi App)
            if (name === "Custom" &&
                this.config.waterBox &&
                this.cachedState.get("WaterSpeedName") !== "Custom") {
                await this.setWaterSpeed("Custom");
            }
            // If speed is not "custom" remove set the water speed also to a fixed value (for Xiaomi App)
            else if (name !== "Custom" &&
                this.config.waterBox &&
                this.cachedState.get("WaterSpeedName") === "Custom") {
                await this.setWaterSpeed("Medium");
            }
        }
    }
    findSpeedModeFromMiio(speed) {
        // Get the speed modes for this model
        const speedModes = (0, find_speed_modes_1.findSpeedModes)(this.deviceManager.model, this.productInfo.firmware).speed;
        // Find speed mode that matches the miLevel
        return speedModes.find((mode) => mode.miLevel === speed);
    }
}
exports.MainService = MainService;
//# sourceMappingURL=main_service.js.map
