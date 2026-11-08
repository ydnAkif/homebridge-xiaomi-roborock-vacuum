"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CareService = void 0;
const custom_care_service_1 = require("./custom_care_service");
const plugin_service_class_1 = require("./plugin_service_class");
class CareService extends plugin_service_class_1.PluginServiceClass {
    mainService;
    services;
    constructor(coreContext, mainService) {
        super(coreContext);
        this.mainService = mainService;
        this.services = this.config.legacyCareSensors
            ? this.registerLegacyCustomCareService()
            : this.registerNativeCareServices();
    }
    async init() { }
    async getCareSensors() {
        // 30h = sensor_dirty_time
        const lifetime = 108000;
        const sensorDirtyTime = this.deviceManager.property("sensorDirtyTime");
        const lifetimePercent = (sensorDirtyTime / lifetime) * 100;
        this.log.debug(`getCareSensors | Sensors dirtyTime is ${sensorDirtyTime} seconds / ${lifetimePercent.toFixed(2)}%.`);
        return Math.max(0, Math.min(100, lifetimePercent));
    }
    async getCareFilter() {
        // 150h = filter_work_time
        const lifetime = 540000;
        const filterWorkTime = this.deviceManager.property("filterWorkTime");
        const lifetimePercent = (filterWorkTime / lifetime) * 100;
        this.log.debug(`getCareFilter | Filter workTime is ${filterWorkTime} seconds / ${lifetimePercent.toFixed(2)}%.`);
        return Math.max(0, Math.min(100, lifetimePercent));
    }
    async getCareSideBrush() {
        // 200h = side_brush_work_time
        const lifetime = 720000;
        const sideBrushWorkTime = this.deviceManager.property("sideBrushWorkTime");
        const lifetimePercent = (sideBrushWorkTime / lifetime) * 100;
        this.log.debug(`getCareSideBrush | SideBrush workTime is ${sideBrushWorkTime} seconds / ${lifetimePercent.toFixed(2)}%.`);
        return Math.max(0, Math.min(100, lifetimePercent));
    }
    async getCareMainBrush() {
        // 300h = main_brush_work_time
        const lifetime = 1080000;
        const mainBrushWorkTime = this.deviceManager.property("mainBrushWorkTime");
        const lifetimePercent = (mainBrushWorkTime / lifetime) * 100;
        this.log.debug(`getCareMainBrush | MainBrush workTime is ${mainBrushWorkTime} seconds / ${lifetimePercent.toFixed(2)}%.`);
        return Math.max(0, Math.min(100, lifetimePercent));
    }
    registerLegacyCustomCareService() {
        const { Care, Characteristic } = (0, custom_care_service_1.createCareServicesClasses)(this.hap);
        const service = new Care(`${this.config.name} Care`);
        service
            .getCharacteristic(Characteristic.CareSensors)
            .onGet(() => this.getCareSensors());
        service
            .getCharacteristic(Characteristic.CareFilter)
            .onGet(() => this.getCareFilter());
        service
            .getCharacteristic(Characteristic.CareSideBrush)
            .onGet(() => this.getCareSideBrush());
        service
            .getCharacteristic(Characteristic.CareMainBrush)
            .onGet(() => this.getCareMainBrush());
        return [service];
    }
    registerNativeCareServices() {
        const mainService = this.mainService.services[0]; // Hack for now
        // Register the high-level state of the filters to the main device's Characteristics
        mainService
            .getCharacteristic(this.hap.Characteristic.FilterChangeIndication)
            .onGet(async () => {
            const carePercentages = await Promise.all([
                this.getCareSensors(),
                this.getCareFilter(),
                this.getCareSideBrush(),
                this.getCareMainBrush(),
            ]);
            return carePercentages.some((item) => item >= 100);
        });
        mainService
            .getCharacteristic(this.hap.Characteristic.FilterLifeLevel)
            .onGet(async () => {
            const carePercentages = await Promise.all([
                this.getCareSensors(),
                this.getCareFilter(),
                this.getCareSideBrush(),
                this.getCareMainBrush(),
            ]);
            return 100 - Math.max(...carePercentages);
        });
        // Use Homekit's native FilterMaintenance Service
        const careSensorsService = new this.hap.Service.FilterMaintenance("Care indicator sensors", "sensors");
        careSensorsService
            .getCharacteristic(this.hap.Characteristic.FilterChangeIndication)
            .onGet(async () => {
            return (await this.getCareSensors()) >= 100;
        });
        careSensorsService
            .getCharacteristic(this.hap.Characteristic.FilterLifeLevel)
            .onGet(async () => 100 - (await this.getCareSensors()));
        const careFilterService = new this.hap.Service.FilterMaintenance("Care indicator filter", "filter");
        careFilterService
            .getCharacteristic(this.hap.Characteristic.FilterChangeIndication)
            .onGet(async () => {
            return (await this.getCareFilter()) >= 100;
        });
        careFilterService
            .getCharacteristic(this.hap.Characteristic.FilterLifeLevel)
            .onGet(async () => 100 - (await this.getCareFilter()));
        const careSideBrushService = new this.hap.Service.FilterMaintenance("Care indicator side brush", "side brush");
        careSideBrushService
            .getCharacteristic(this.hap.Characteristic.FilterChangeIndication)
            .onGet(async () => {
            return (await this.getCareSideBrush()) >= 100;
        });
        careSideBrushService
            .getCharacteristic(this.hap.Characteristic.FilterLifeLevel)
            .onGet(async () => 100 - (await this.getCareSideBrush()));
        const careMainBrushService = new this.hap.Service.FilterMaintenance("Care indicator main brush", "main brush");
        careMainBrushService
            .getCharacteristic(this.hap.Characteristic.FilterChangeIndication)
            .onGet(async () => {
            return (await this.getCareMainBrush()) >= 100;
        });
        careMainBrushService
            .getCharacteristic(this.hap.Characteristic.FilterLifeLevel)
            .onGet(async () => 100 - (await this.getCareMainBrush()));
        return [
            careSensorsService,
            careFilterService,
            careSideBrushService,
            careMainBrushService,
        ];
    }
}
exports.CareService = CareService;
//# sourceMappingURL=care_service.js.map