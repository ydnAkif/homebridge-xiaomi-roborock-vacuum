import { HAP, API } from "homebridge";
import {
  BehaviorSubject,
  distinct,
  exhaustMap,
  filter,
  Subject,
  timer,
  Subscription,
} from "rxjs";
import miio from "../miio";
import { Logger } from "../utils/logger";
import { MiioDevice } from "../utils/miio_types";
import { cleaningStatuses } from "../utils/constants";

export interface DeviceManagerConfig {
  ip?: string;
  token?: string;
}

export interface ErrorChangedEvent {
  id: string;
  description: unknown;
}

export interface StateChangedEvent {
  key: string;
  value: unknown;
}

const GET_STATE_INTERVAL_MS = 30000; // 30s
export class DeviceManager {
  private internalDevice$ = new BehaviorSubject<MiioDevice | undefined>(
    undefined
  );
  private readonly ip: string;
  private readonly token: string;
  private internalErrorChanged$ = new Subject<ErrorChangedEvent>();
  private internalStateChanged$ = new Subject<StateChangedEvent>();
  errorChanged$ = this.internalErrorChanged$.pipe(distinct());
  stateChanged$ = this.internalStateChanged$.asObservable();
  deviceConnected$ = this.internalDevice$.pipe(filter(Boolean));
  private connectingPromise: Promise<void> | null = null;
  private nextConnectAt = 0;
  private connectionFailures = 0;
  private connectionWarningLogged = false;
  private stateSubscription: Subscription | null = null;
  private stopped = false;
  private connectRetry = setTimeout(() => void 0, 100); // Noop timeout only to initialise the property
  constructor(
    private readonly hap: HAP,
    private readonly log: Logger,
    config: DeviceManagerConfig,
    api?: API
  ) {
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
    return this.property<string>("state") as string;
  }
  get isCleaning() {
    return cleaningStatuses.includes(this.state);
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
  property<T>(propertyName: string) {
    return this.device.property<T>(propertyName);
  }
  async ensureDevice(callingMethod: string) {
    if (this.stopped) throw this.communicationError();
    if (this.internalDevice$.value) {
      try {
        if (this.internalDevice$.value.handle.api.parent.socket) return;
      } catch (_) {
        /* Reconnect a destroyed socket. */
      }
      this.releaseDevice();
    }
    await this.connect();
    if (!this.internalDevice$.value) throw this.communicationError();
  }
  private communicationError() {
    return new this.hap.HapStatusError(
      this.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
    );
  }
  private releaseDevice() {
    this.stateSubscription?.unsubscribe();
    this.stateSubscription = null;
    const device = this.internalDevice$.value;
    this.internalDevice$.next(undefined);
    try {
      device?.destroy();
    } catch (_) {
      /* Already closed. */
    }
  }
  dispose() {
    this.stopped = true;
    clearTimeout(this.connectRetry);
    this.releaseDevice();
  }
  private async connect() {
    if (this.stopped || Date.now() < this.nextConnectAt)
      throw this.communicationError();
    if (this.connectingPromise === null) {
      // if already trying to connect, don't trigger yet another one
      this.connectingPromise = this.initializeDevice().catch((error) => {
        const delay = Math.min(
          120000,
          30000 * 2 ** Math.min(this.connectionFailures++, 2)
        );
        this.nextConnectAt = Date.now() + delay;
        if (!this.connectionWarningLogged) {
          this.log.warn(
            `Vacuum unavailable; reconnecting automatically with backoff: ${error.message}`
          );
          this.connectionWarningLogged = true;
        }
        clearTimeout(this.connectRetry);
        // Using setTimeout instead of holding the promise. This way we'll keep retrying but not holding the other actions
        if (!this.stopped)
          this.connectRetry = setTimeout(
            () => this.connect().catch(() => {}),
            delay
          );
        throw this.communicationError();
      });
    }
    try {
      await this.connectingPromise;
      clearTimeout(this.connectRetry);
    } finally {
      this.connectingPromise = null;
    }
  }
  private async initializeDevice() {
    this.log.debug("DEB getDevice | Discovering vacuum cleaner");
    const device = await miio.device({ address: this.ip, token: this.token });
    if (this.stopped) {
      device.destroy();
      throw this.communicationError();
    }
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
      this.log.info(
        "STA getDevice | BatteryLevel: " + this.property("batteryLevel")
      );
      this.device.on<ErrorChangedEvent>("errorChanged", (error) =>
        this.internalErrorChanged$.next(error)
      );
      this.device.on<StateChangedEvent>("stateChanged", (state) =>
        this.internalStateChanged$.next(state)
      );
      // Refresh the state every 30s so miio maintains a fresh connection (or recovers connection if lost until we fix https://github.com/homebridge-xiaomi-roborock-vacuum/homebridge-xiaomi-roborock-vacuum/issues/81)
      this.stateSubscription = timer(
        GET_STATE_INTERVAL_MS,
        GET_STATE_INTERVAL_MS
      )
        .pipe(exhaustMap(() => this.getState()))
        .subscribe();
    } else {
      const model = (device || {}).miioModel;
      this.log.error(
        `Device "${model}" is not registered as a vacuum cleaner! If you think it should be, please open an issue at https://github.com/homebridge-xiaomi-roborock-vacuum/homebridge-xiaomi-roborock-vacuum/issues/new and provide this line.`
      );
      this.log.debug(device);
      device.destroy();
      throw this.communicationError();
    }
  }
  private async getState() {
    try {
      await this.ensureDevice("getState");
      await this.device.poll();
      const state = await this.device.state();
      this.log.debug(
        `DEB getState | ${this.model} | State %j | Props %j`,
        state,
        this.device.properties
      );
      for (const key in state) {
        if (key === "error") {
          this.internalErrorChanged$.next(state[key] as ErrorChangedEvent);
        } else {
          this.internalStateChanged$.next({ key, value: state[key] });
        }
      }
    } catch (err) {
      if (!this.stopped) {
        this.releaseDevice();
        await this.connect().catch(() => {});
      }
    }
  }
}
