"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XiaomiRoborockVacuum = void 0;
const rxjs_1 = require("rxjs");
const logger_1 = require("./utils/logger");
const services_1 = require("./services");
const constants_1 = require("./utils/constants");
class XiaomiRoborockVacuum {
    log;
    config;
    pluginServices;
    deviceManager;
    constructor(log, config, api) {
        this.log = (0, logger_1.getLogger)(log, config);
        this.config = (0, services_1.applyConfigDefaults)(config);
        this.deviceManager = new services_1.DeviceManager(api.hap, this.log, config, api);
        this.deviceManager.errorChanged$
            .pipe((0, rxjs_1.distinct)((robotError) => robotError.id), (0, rxjs_1.concatMap)((err) => this.changedError(err)), (0, rxjs_1.catchError)(async (err) => this.log.error(`Error processing the error reported by the robot`, err)))
            .subscribe();
        this.deviceManager.stateChanged$.subscribe(({ key, value }) => {
            this.log.debug(`stateChanged | stateChanged event: ${key}:${value}`);
        });
        // HOMEKIT SERVICES
        const coreContext = {
            hap: api.hap,
            log: this.log,
            config: this.config,
            deviceManager: this.deviceManager,
        };
        this.pluginServices = this.initializeServices(coreContext);
        // Run the init method of all the services, once they are all registered.
        Object.values(this.pluginServices).map((service) => service?.init());
    }
    /**
     * Initializes all the PluginServices based on the config.
     * @private
     */
    initializeServices(coreContext) {
        const { config } = this;
        const productInfo = new services_1.ProductInfo(coreContext);
        const rooms = new services_1.RoomsService(coreContext, async (clean) => {
            await this.pluginServices.mainService.setCleaning(clean);
        });
        const mainService = new services_1.MainService(coreContext, productInfo, rooms, async (mode) => {
            await this.pluginServices.waterBox?.setWaterSpeed(mode);
        }, (isCleaning) => this.pluginServices.pause?.changedPause(isCleaning));
        return {
            mainService,
            productInfo,
            rooms,
            battery: new services_1.BatteryInfo(coreContext),
            findMe: new services_1.FindMeService(coreContext),
            pause: config.pause ? new services_1.PauseSwitch(coreContext, rooms) : undefined,
            waterBox: config.waterBox
                ? new services_1.WaterBoxService(coreContext, productInfo, mainService)
                : undefined,
            dustBin: config.dustBin ? new services_1.DustBinService(coreContext) : undefined,
            dustCollection: config.dustCollection
                ? new services_1.DustCollection(coreContext)
                : undefined,
            goTo: config.goTo ? new services_1.GoToService(coreContext) : undefined,
            dock: config.dock ? new services_1.DockService(coreContext) : undefined,
            zones: config.zones
                ? new services_1.ZonesService(coreContext, mainService, (isCleaning) => this.pluginServices.pause?.changedPause(isCleaning))
                : undefined,
            // ADDITIONAL HOMEKIT SERVICES
            careServices: !config.disableCareServices
                ? new services_1.CareService(coreContext, mainService)
                : undefined,
        };
    }
    /**
     * Reacts to the error emitter from the robot and tries to translate the error code to a human-readable error
     * @param robotError The robot error that is thrown.
     * @private
     */
    async changedError(robotError) {
        this.log.debug(`DEB changedError | ErrorID: ${robotError.id}, ErrorDescription: ${robotError.description}`);
        let robotErrorTxt = constants_1.errors[`id${robotError.id}`]
            ? constants_1.errors[`id${robotError.id}`].description
            : `Unknown ERR | error id can't be mapped. (${robotError.id})`;
        if (!`${robotError.description}`.toLowerCase().startsWith("unknown")) {
            robotErrorTxt = robotError.description;
        }
        this.log.warn(`WAR changedError | Robot has an ERROR - ${robotError.id}, ${robotErrorTxt}`);
        // Clear the error_code property
        await this.deviceManager.device.setRawProperty("error_code", 0);
    }
    /**
     * HomeBridge requires this method for the "identify" calls
     * when setting up the accessory in the Home app.
     * @param callback The "done" callback.
     */
    identify() {
        this.pluginServices.findMe
            .identify(true)
            .catch((err) => this.log.error("Failed to identify the device", err));
    }
    /**
     * HomeBridge calls this method during initialization to fetch all the services exposed by this Accessory.
     * @returns {Service[]} The list of services (Switches, Fans, Occupancy Detectors, ...) set up by this accessory.
     */
    getServices() {
        this.log.debug(`DEB getServices`);
        const { mainService, ...rest } = this.pluginServices;
        const firstService = mainService.services[0];
        return Object.values(rest).reduce((acc, service) => {
            if (!service)
                return acc;
            service.services.forEach((srv) => {
                // Explicitly declare all other services as non-primary
                if (srv.setPrimaryService)
                    srv.setPrimaryService(false);
                // In case it helps, try to add all services as linked to the main one.
                if (firstService.addLinkedService)
                    firstService.addLinkedService(srv);
            });
            return [...acc, ...service.services];
        }, [firstService] // Make sure to return the main service first
        );
    }
}
exports.XiaomiRoborockVacuum = XiaomiRoborockVacuum;
//# sourceMappingURL=xiaomi_roborock_vacuum_accessory.js.map
