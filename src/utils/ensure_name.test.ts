import * as hap from "hap-nodejs";
import { ensureName } from "./ensure_name";

describe("ensureName", () => {
  const getItemSpy = jest.spyOn(hap.HAPStorage.storage(), "getItem");
  const setItemSpy = jest.spyOn(hap.HAPStorage.storage(), "setItemSync");

  const service = new hap.Service.Switch("test", "test");

  beforeEach(() => {
    jest.resetAllMocks();
  });

  afterEach(() => {
    service
      .getCharacteristic(hap.Characteristic.ConfiguredName)
      .removeAllListeners("change");
  });

  test("sets the default name", () => {
    const setCharacteristicSpy = jest.spyOn(service, "setCharacteristic");
    ensureName(hap, service, "custom test");
    expect(setCharacteristicSpy).toHaveBeenCalledTimes(1);
    expect(setCharacteristicSpy).toHaveBeenCalledWith(
      hap.Characteristic.ConfiguredName,
      "custom test"
    );
    expect(setItemSpy).toHaveBeenCalledTimes(0);
  });

  test("does not set the default name", () => {
    getItemSpy.mockReturnValueOnce("hi there!");
    const setCharacteristicSpy = jest.spyOn(service, "setCharacteristic");
    ensureName(hap, service, "custom test");
    expect(setCharacteristicSpy).toHaveBeenCalledTimes(0);
    expect(setItemSpy).toHaveBeenCalledTimes(0);
  });

  test.each([undefined, "Saved name"])("works with Homebridge 2 storage and preserves cached names: %s", (cachedName) => {
    const storage = {
      getItem: jest.fn().mockReturnValue(cachedName),
      getItemSync: jest.fn(() => { throw new Error("getItemSync() is not supported anymore"); }),
      setItemSync: jest.fn(),
    };
    const modernHap = { ...hap, HAPStorage: { storage: () => storage } };
    const modernService = new hap.Service.Switch("modern", "modern");
    const setSpy = jest.spyOn(modernService, "setCharacteristic");
    ensureName(modernHap as unknown as typeof hap, modernService, "Modern Room");
    expect(storage.getItemSync).not.toHaveBeenCalled();
    expect(setSpy).toHaveBeenCalledTimes(cachedName ? 0 : 1);
    modernService.updateCharacteristic(hap.Characteristic.ConfiguredName, "New Room");
    expect(storage.setItemSync).toHaveBeenCalledWith("homebridge-xiaomi-roborock-vacuum-configured-name-Modern_Room", "New Room");
  });

  test("stores a custom name in cache", () => {
    getItemSpy.mockReturnValueOnce("hi there!");
    ensureName(hap, service, "custom test");
    service.updateCharacteristic(
      hap.Characteristic.ConfiguredName,
      "changed name"
    );
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).toHaveBeenCalledWith(
      "homebridge-xiaomi-roborock-vacuum-configured-name-custom_test",
      "changed name"
    );
  });
});
