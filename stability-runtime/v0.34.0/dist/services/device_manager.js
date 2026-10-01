"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceManager = void 0;
const rxjs_1 = require("rxjs");
const miio_1 = __importDefault(require("../miio"));
const constants_1 = require("../utils/constants");
const GET_STATE_INTERVAL_MS = 30000; // 30s
class DeviceManager {
    hap;
    log;
    internalDevice$ = new rxjs_1.BehaviorSubject(undefined);
    ip;
    token;
    internalErrorChanged$ = new rxjs_1.Subject();
    internalStateChanged$ = new rxjs_1.Subject();
    errorChanged$ = this.internalErrorChanged$.pipe((0, rxjs_1.distinct)());
    stateChanged$ = this.internalStateChanged$.asObservable();
    deviceConnected$ = this.internalDevice$.pipe((0, rxjs_1.filter)(Boolean));
    connectingPromise = null;
    nextConnectAt = 0;
    connectionFailures = 0;
    connectionWarningLogged = false;
    stateSubscription = null;
    stopped = false;
    connectRetry = setTimeout(() => void 0, 100); // Noop timeout only to initialise the property
    constructor(hap, log, config, api) {
        this.hap = hap;
        this.log = log;
        if (!config.ip) {
            throw new Error("You must provide an ip address of the vacuum cleaner.");
        }
        this.ip = config.ip;
        if (!config.token) {
            throw new Error("You must provide a token of the vacuum cleaner.");
        }
        this.token = config.token;
        api?.on("shutdown", () => this.dispose());
        this.connect().catch(() => {
            // Do nothing in the catch because this function already logs the error internally and retries after 2 minutes.
        });
    }
    get model() {
        return this.internalDevice$.value?.miioModel || "unknown model";
    }
    get state() {
        return this.property("state");
    }
    get isCleaning() {
        return constants_1.cleaningStatuses.includes(this.state);
    }
    get isPaused() {
        return this.state === "paused";
    }
    get device() {
        if (!this.internalDevice$.value) {
            throw this.communicationError();
        }
        return this.internalDevice$.value;
    }
    property(propertyName) {
        return this.device.property(propertyName);
    }
    async ensureDevice(callingMethod) {
        if (this.stopped) throw this.communicationError();
        if (this.internalDevice$.value) {
            try {
                if (this.internalDevice$.value.handle.api.parent.socket) return;
            } catch (_) { /* Reconnect a destroyed socket. */ }
            this.releaseDevice();
        }
        await this.connect();
        if (!this.internalDevice$.value) throw this.communicationError();
    }
    communicationError() {
        return new this.hap.HapStatusError(this.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    releaseDevice() {
        this.stateSubscription?.unsubscribe();
        this.stateSubscription = null;
        const device = this.internalDevice$.value;
        this.internalDevice$.next(undefined);
        try { device?.destroy(); } catch (_) { /* Already closed. */ }
    }
    dispose() {
        this.stopped = true;
        clearTimeout(this.connectRetry);
        this.releaseDevice();
    }
    async connect() {
        if (this.stopped || Date.now() < this.nextConnectAt) throw this.communicationError();
        if (this.connectingPromise === null) {
            // if already trying to connect, don't trigger yet another one
            this.connectingPromise = this.initializeDevice().catch((error) => {
                const delay = Math.min(120000, 30000 * (2 ** Math.min(this.connectionFailures++, 2)));
                this.nextConnectAt = Date.now() + delay;
                if (!this.connectionWarningLogged) {
                    this.log.warn(`Vacuum unavailable; reconnecting automatically with backoff: ${error.message}`);
                    this.connectionWarningLogged = true;
                }
                clearTimeout(this.connectRetry);
                // Using setTimeout instead of holding the promise. This way we'll keep retrying but not holding the other actions
                if (!this.stopped) this.connectRetry = setTimeout(() => this.connect().catch(() => { }), delay);
                throw this.communicationError();
            });
        }
        try {
            await this.connectingPromise;
            clearTimeout(this.connectRetry);
        }
        finally {
            this.connectingPromise = null;
        }
    }
    async initializeDevice() {
        this.log.debug("DEB getDevice | Discovering vacuum cleaner");
        const device = await miio_1.default.device({ address: this.ip, token: this.token });
        if (this.stopped) { device.destroy(); throw this.communicationError(); }
        if (device.matches("type:vaccuum")) {
            this.releaseDevice();
            this.internalDevice$.next(device);
            this.nextConnectAt = 0;
            this.connectionFailures = 0;
            this.connectionWarningLogged = false;
            this.log.setModel(this.model);
            this.log.info("STA getDevice | Connected to: %s", this.ip);
            this.log.info("STA getDevice | Model: " + this.model);
            this.log.info("STA getDevice | State: " + this.property("state"));
            this.log.info("STA getDevice | FanSpeed: " + this.property("fanSpeed"));
            this.log.info("STA getDevice | BatteryLevel: " + this.property("batteryLevel"));
            this.device.on("errorChanged", (error) => this.internalErrorChanged$.next(error));
            this.device.on("stateChanged", (state) => this.internalStateChanged$.next(state));
            // Refresh the state every 30s so miio maintains a fresh connection (or recovers connection if lost until we fix https://github.com/homebridge-xiaomi-roborock-vacuum/homebridge-xiaomi-roborock-vacuum/issues/81)
            this.stateSubscription = (0, rxjs_1.timer)(GET_STATE_INTERVAL_MS, GET_STATE_INTERVAL_MS)
                .pipe((0, rxjs_1.exhaustMap)(() => this.getState())).subscribe();
        }
        else {
            const model = (device || {}).miioModel;
            this.log.error(`Device "${model}" is not registered as a vacuum cleaner! If you think it should be, please open an issue at https://github.com/homebridge-xiaomi-roborock-vacuum/homebridge-xiaomi-roborock-vacuum/issues/new and provide this line.`);
            this.log.debug(device);
            device.destroy();
            throw this.communicationError();
        }
    }
    async getState() {
        try {
            await this.ensureDevice("getState");
            await this.device.poll();
            const state = await this.device.state();
            this.log.debug(`DEB getState | ${this.model} | State %j | Props %j`, state, this.device.properties);
            for (const key in state) {
                if (key === "error") {
                    this.internalErrorChanged$.next(state[key]);
                }
                else {
                    this.internalStateChanged$.next({ key, value: state[key] });
                }
            }
        }
        catch (err) {
            if (!this.stopped) {
                this.releaseDevice();
                await this.connect().catch(() => { });
            }
        }
    }
}
exports.DeviceManager = DeviceManager;
//# sourceMappingURL=device_manager.js.map
