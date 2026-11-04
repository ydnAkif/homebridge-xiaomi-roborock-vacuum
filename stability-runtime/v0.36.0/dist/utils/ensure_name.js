"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureName = ensureName;
function ensureName(hap, service, name) {
    const key = [
        `homebridge-xiaomi-roborock-vacuum`,
        `configured-name`,
        name.replaceAll(" ", "_"),
    ].join("-");
    service.addOptionalCharacteristic(hap.Characteristic.ConfiguredName);
    if (!hap.HAPStorage.storage().getItem(key)) {
        service.setCharacteristic(hap.Characteristic.ConfiguredName, name);
    }
    service
        .getCharacteristic(hap.Characteristic.ConfiguredName)
        .on("change", ({ newValue }) => {
        hap.HAPStorage.storage().setItemSync(key, newValue);
    });
}
//# sourceMappingURL=ensure_name.js.map