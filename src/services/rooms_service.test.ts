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

  test("correcting a map room ID preserves the existing HomeKit service identity", async () => {
    await createRoomService({
      rooms: [{ id: 16, name: "Aylin's Bedroom", serviceId: 20 }],
    });
    const room = roomsService.services[0] as any;
    expect(room.subtype).toBe("roomService20");
    expect(room.roomId).toBe(16);
    Object.assign(deviceManagerMock, { isCleaning: false });
    await (roomsService as any).setCleaningRoom(true, room.roomId);
    expect([...roomsService.roomIdsToClean]).toEqual([16]);
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
      Object.assign(deviceManagerMock, { state: "charging" });
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
    expect(deviceManagerMock.device.cleanRooms).not.toHaveBeenCalled();
    expect(deviceManagerMock.device.activateCleaning).not.toHaveBeenCalled();
  });
  test("duplicate room service ids and names are skipped before HAP registration", async () => {
    await createRoomService({
      rooms: [
        { id: 16, name: "One", serviceId: 20 },
        { id: 17, name: "Two", serviceId: 20 },
        { id: 18, name: "One", serviceId: 18 },
      ],
    });
    expect(roomsService.services).toHaveLength(1);
  });
  test("failed delayed cleaning clears selected rooms without full-house fallback", async () => {
    jest.useFakeTimers();
    try {
      setCleaning.mockRejectedValue(new Error("offline"));
      await createRoomService({
        rooms: [{ id: 17, name: "One" }],
        roomTimeout: 1,
      });
      Object.assign(deviceManagerMock, { isCleaning: false });
      await (roomsService as any).setCleaningRoom(true, "17");
      await jest.advanceTimersByTimeAsync(1000);
      expect(roomsService.roomIdsToClean.size).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
  test("returning, docking and temporary unknown states retain an active room session", async () => {
    await createRoomService({ rooms: [{ id: 17, name: "One" }] });
    roomsService.roomIdsToClean.add("17");
    (deviceManagerMock.stateChanged$ as Subject<any>).next({
      key: "cleaning",
      value: true,
    });
    for (const state of [
      "returning",
      "docking",
      "unknown-26",
      "dust-collection",
    ]) {
      Object.assign(deviceManagerMock, { state });
      (deviceManagerMock.stateChanged$ as Subject<any>).next({
        key: "cleaning",
        value: false,
      });
      expect(roomsService.roomIdsToClean.size).toBe(1);
    }
    Object.assign(deviceManagerMock, { state: "charging" });
    (deviceManagerMock.stateChanged$ as Subject<any>).next({
      key: "cleaning",
      value: false,
    });
    expect(roomsService.roomIdsToClean.size).toBe(0);
  });
  test("concurrent main starts coalesce and cancel the delayed room start", async () => {
    jest.useFakeTimers();
    try {
      await createRoomService({
        rooms: [{ id: 17, name: "One" }],
        roomTimeout: 30,
      });
      Object.assign(deviceManagerMock, { isCleaning: false });
      await (roomsService as any).setCleaningRoom(true, "17");
      const main = Object.assign(Object.create(MainService.prototype), {
        deviceManager: deviceManagerMock,
        roomsService,
        log: getLoggerMock(),
      });
      await Promise.all([main.setCleaning(true), main.setCleaning(true)]);
      await jest.advanceTimersByTimeAsync(30000);
      expect(deviceManagerMock.device.cleanRooms).toHaveBeenCalledTimes(1);
      expect(setCleaning).not.toHaveBeenCalled();
      roomsService.clearSelection();
    } finally {
      jest.useRealTimers();
    }
  });
  test("accepted command expires if robot never reports cleaning", async () => {
    jest.useFakeTimers();
    try {
      await createRoomService({});
      roomsService.roomIdsToClean.add("17");
      roomsService.commandAccepted();
      await jest.advanceTimersByTimeAsync(300000);
      expect(roomsService.roomIdsToClean.size).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
  test("deselection does not wait for a pending reconnect", async () => {
    await createRoomService({});
    roomsService.roomIdsToClean.add("17");
    deviceManagerMock.ensureDevice.mockImplementation(() => new Promise(() => {}));
    await (roomsService as any).setCleaningRoom(false, "17");
    expect(roomsService.roomIdsToClean.size).toBe(0);
    expect(deviceManagerMock.ensureDevice).not.toHaveBeenCalled();
  });
});
