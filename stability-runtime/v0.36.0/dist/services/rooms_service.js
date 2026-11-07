"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomsService = void 0;
const rxjs_1 = require("rxjs");
const plugin_service_class_1 = require("./plugin_service_class");
const ensure_name_1 = require("../utils/ensure_name");
class RoomsService extends plugin_service_class_1.PluginServiceClass {
    setCleaning;
    roomIdsToClean = new Set();
    rooms = {};
    roomTimeout = setTimeout(() => { }, 0);
    roomCleaningStarted = false;
    constructor(coreContext, setCleaning) {
        super(coreContext);
        this.setCleaning = setCleaning;
        if (this.config.rooms && this.config.autoroom) {
            throw new Error(`Both "autoroom" and "rooms" config options can't be used at the same time.\n
      Please, use "autoroom" to retrieve the "rooms" config and remove it when not needed.`);
        }
        if (this.config.rooms && !this.config.autoroom) {
            for (const i in this.config.rooms) {
                this.createRoom(this.config.rooms[i].id, this.config.rooms[i].name);
            }
        }
        // Declare services for rooms in advance, so HomeKit can create the switches
        if (this.config.autoroom && Array.isArray(this.config.autoroom)) {
            for (const i in this.config.autoroom) {
                // Index will be overwritten, when robot is available
                this.createRoom(i, this.config.autoroom[i]);
            }
        }
    }
    async init() {
        this.deviceManager.stateChanged$
            .pipe((0, rxjs_1.filter)(({ key }) => key === "cleaning"))
            .subscribe(({ value }) => {
            const isCleaning = value === true;
            if (isCleaning && this.roomIdsToClean.size > 0) {
                this.roomCleaningStarted = true;
            }
            // Idle polls during the selection delay must not erase queued rooms.
            // Pausing also keeps the room selection for a later resume.
            if (!isCleaning &&
                this.roomCleaningStarted &&
                !this.deviceManager.isPaused) {
                this.roomCleaningStarted = false;
                this.services.forEach((room) => {
                    room
                        .getCharacteristic(this.hap.Characteristic.On)
                        .updateValue(false);
                });
                this.roomIdsToClean.clear();
            }
        });
        if (this.config.autoroom) {
            // Await for the device to be connected
            await (0, rxjs_1.firstValueFrom)(this.deviceManager.deviceConnected$);
            if (Array.isArray(this.config.autoroom)) {
                await this.getRoomList();
            }
            else {
                await this.getRoomMap();
            }
        }
    }
    get services() {
        return [...Object.values(this.rooms)];
    }
    createRoom(roomId, roomName) {
        this.log.info(`INF createRoom | Room ${roomName} (${roomId})`);
        const switchName = `${this.config.cleanword} ${roomName}`;
        const room = Object.assign(new this.hap.Service.Switch(switchName, "roomService" + roomId), { roomId });
        (0, ensure_name_1.ensureName)(this.hap, room, switchName);
        room
            .getCharacteristic(this.hap.Characteristic.On)
            .onGet(() => this.getCleaningRoom(room.roomId))
            .onSet((newState) => this.setCleaningRoom(newState, room.roomId));
        this.rooms[roomName] = room;
    }
    async getCleaningRoom(roomId) {
        await this.deviceManager.ensureDevice("getCleaningRoom");
        return this.roomIdsToClean.has(roomId);
    }
    async setCleaningRoom(state, roomId) {
        await this.deviceManager.ensureDevice("setCleaning");
        try {
            if (state &&
                !this.deviceManager.isCleaning &&
                !this.deviceManager.isPaused) {
                this.log.info(`ACT setCleaningRoom | Enable cleaning Room ID ${roomId}.`);
                // Delete then add, to maintain the correct order.
                this.roomIdsToClean.delete(roomId);
                this.roomIdsToClean.add(roomId);
                this.checkRoomTimeout();
            }
            else if (!state &&
                !this.deviceManager.isCleaning &&
                !this.deviceManager.isPaused) {
                this.log.info(`ACT setCleaningRoom | Disable cleaning Room ID ${roomId}.`);
                this.roomIdsToClean.delete(roomId);
                this.checkRoomTimeout();
            }
        }
        catch (err) {
            this.log.error(`ERR setCleaningRoom | Failed to set cleaning to ${state}`, err);
            throw err;
        }
    }
    checkRoomTimeout() {
        if (this.config.roomTimeout > 0) {
            this.log.info(`ACT setCleaningRoom | Start timeout to clean rooms`);
            clearTimeout(this.roomTimeout);
            if (this.roomIdsToClean.size > 0) {
                this.roomTimeout = setTimeout(() => {
                    if (this.roomIdsToClean.size === 0)
                        return;
                    void this.setCleaning(true).catch((error) => this.log.error("Room cleaning failed; no full-clean fallback.", error));
                }, this.config.roomTimeout * 1000);
            }
        }
    }
    async getRoomList() {
        await this.deviceManager.ensureDevice("getRoomList");
        try {
            const timers = await this.deviceManager.device.getTimer();
            // Find specific timer containing the room order
            // Timer needs to be scheduled for 00:00 and inactive
            let leetTimer = timers.find((x) => x[2][0].startsWith("0 0") && x[1] == "off");
            if (typeof leetTimer === "undefined") {
                this.log.error(`getRoomList | Could not find a timer for autoroom`);
                return;
            }
            let roomIds = leetTimer[2][1][1]["segments"].split(`,`).map((x) => +x);
            this.log.debug(`getRoomList | Room IDs are ${roomIds}`);
            const autoroom = this.config.autoroom;
            if (roomIds.length !== autoroom.length) {
                this.log.error(`getRoomList | Number of rooms in config does not match number of rooms in the timer`);
                return;
            }
            let roomMap = [];
            for (const [i, roomId] of roomIds.entries()) {
                this.rooms[autoroom[i]].roomId = roomId;
                roomMap.push({ id: roomId, name: autoroom[i] });
            }
            this.log.info(`getRoomList | Created "rooms": ${JSON.stringify(roomMap)}. Update your 'rooms' config, remove autoroom, and restart homebridge.`);
        }
        catch (err) {
            this.log.error(`getRoomList | Failed getting the Room List.`, err);
            throw err;
        }
    }
    async getRoomMap() {
        await this.deviceManager.ensureDevice("getRoomMap");
        try {
            const map = await this.deviceManager.device.getRoomMap();
            this.log.info(`INF getRoomMap | Map is ${map}`);
            for (let val of map) {
                this.createRoom(val[0], val[1]);
            }
        }
        catch (err) {
            this.log.error(`ERR getRoomMap | Failed getting the Room Map.`, err);
            throw err;
        }
    }
}
exports.RoomsService = RoomsService;
//# sourceMappingURL=rooms_service.js.map