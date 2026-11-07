import { HAP } from "homebridge";
import * as HapJs from "@homebridge/hap-nodejs";
import { Subject } from "rxjs";
import { MainService } from "./main_service";
import { RoomsService } from "./rooms_service";
import {
  createDeviceManagerMock,
  DeviceManagerMock,
} from "./device_manager.mock";
import { getLoggerMock } from "../utils/logger.mock";
import { applyConfigDefaults, Config } from "./config_service";
import { MiioDevice } from "../utils/miio_types";
import { miio } from "../test.mocks";

describe("RoomsService", () => {
  let roomsService: RoomsService;
  let deviceManagerMock: DeviceManagerMock;
  let hap: HAP;
  const setCleaning = jest.fn();

  async function createRoomService(partialConfig: Partial<Config>) {
    hap = HapJs;
    const log = getLoggerMock();
    deviceManagerMock = createDeviceManagerMock();
    const config = applyConfigDefaults(partialConfig);

    roomsService = new RoomsService(
      {
        hap,
        log,
        config,
        deviceManager: deviceManagerMock,
      },
      setCleaning
    );

    await roomsService.init();
  }

  afterEach(() => {
    (deviceManagerMock.stateChanged$ as Subject<unknown>).complete();
    jest.resetAllMocks();
  });

  describe("with the default config", () => {
    beforeEach(async () => {
      await createRoomService({});
    });

    test("default config returns zero services", () => {
      expect(roomsService.services).toStrictEqual([]);
    });
  });

  test("throws an error if rooms and autoroom are present at the same time", async () => {
    await expect(
      createRoomService({ rooms: [], autoroom: true })
    ).rejects.toThrow();
  });

  test("creates a declared room", async () => {
    await createRoomService({ rooms: [{ id: 16, name: "Kitchen" }] });
    expect(roomsService.services).toHaveLength(1);
  });

  test("idle status polls preserve queued rooms until the delayed start", async () => {
    jest.useFakeTimers();
    setCleaning.mockResolvedValue(undefined);
    try {
      await createRoomService({
        rooms: [{ id: 17, name: "Kitchen" }],
        roomTimeout: 30,
      });
      Object.assign(deviceManagerMock, { isCleaning: false });
      await (roomsService as any).setCleaningRoom(true, "17");
      (deviceManagerMock.stateChanged$ as Subject<any>).next({
        key: "cleaning",
        value: false,
      });
      expect([...roomsService.roomIdsToClean]).toEqual(["17"]);
      await jest.advanceTimersByTimeAsync(30000);
      expect(setCleaning).toHaveBeenCalledWith(true);
      (deviceManagerMock.stateChanged$ as Subject<any>).next({
        key: "cleaning",
        value: true,
      });
      (deviceManagerMock.stateChanged$ as Subject<any>).next({
        key: "cleaning",
        value: false,
      });
      expect(roomsService.roomIdsToClean.size).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test("deselecting the last room cancels the delayed start", async () => {
    jest.useFakeTimers();
    setCleaning.mockResolvedValue(undefined);
    try {
      await createRoomService({
        rooms: [{ id: 17, name: "Kitchen" }],
        roomTimeout: 30,
      });
      Object.assign(deviceManagerMock, { isCleaning: false });
      await (roomsService as any).setCleaningRoom(true, "17");
      await (roomsService as any).setCleaningRoom(false, "17");
      await jest.advanceTimersByTimeAsync(30000);
      expect(setCleaning).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test("connection refresh cannot turn a selected-room command into full cleaning", async () => {
    await createRoomService({});
    Object.assign(deviceManagerMock, { isCleaning: false });
    roomsService.roomIdsToClean.add("17");
    deviceManagerMock.ensureDevice.mockImplementation(async () => {
      roomsService.roomIdsToClean.clear();
    });
    const main = Object.assign(Object.create(MainService.prototype), {
      deviceManager: deviceManagerMock,
      roomsService,
      log: getLoggerMock(),
    });
    await main.setCleaning(true);
    expect(deviceManagerMock.device.cleanRooms).toHaveBeenCalledWith(["17"]);
    expect(deviceManagerMock.device.activateCleaning).not.toHaveBeenCalled();
  });
});
