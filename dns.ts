/**
 * Custom blocks
 */
//% weight=100 color=#0fbc11 icon=""
namespace NetWorking {
    export class Handler<T> {
        private callback: ((value: T) => void) | null = null;
        private value: T | null = null;
        private resolved: boolean = false;

        constructor(exec: (resolve: (value: T) => void) => void) {
            const internalResolve = (val: T) => {
                this.value = val;
                this.resolved = true;

                if (this.callback) {
                    this.callback(val);
                }
            };

            control.runInParallel(() => {
                exec(internalResolve);
            });
        }

        then(fn: (value: T) => void): void {
            this.callback = fn;

            if (this.resolved && this.value !== null) {
                fn(this.value);
            }
        }
    }
    type SerialNumber = number;
    export let myIP = `${((control.deviceSerialNumber() & 0xF) * 10) & 0xFF}.${control.deviceSerialNumber() & 0xFF}.${(control.deviceSerialNumber() >> 8) % 255}.${(control.deviceSerialNumber() >> 16) & 0xFF}`;
    export let mySerial = control.deviceSerialNumber();
    let waitingForResponse = false;
    let responseHandler: (rep: SerialNumber) => void = null;
    let waitForData: { func: (dat: string) => void, fromIp: string, _?: boolean }[] = [];
    export let debug = false;

    radio.setFrequencyBand(40);
    radio.setGroup(200); // this is passed to the low-level stuff , not the orignal radio.ts
    radio.setTransmitPower(7); // and this is to the low-level stuff.

    radio2.onReceivedString(function (msg: string, packet) { // radio.sendString(`PEER:*|${mySerial}|FIND`)
        if (msg == "ignore") return;

        let parts = msg.split("|");
        let cmdAndIp = parts[0].split(":");
        let cmd = cmdAndIp[0];
        let ip = cmdAndIp[1];
        let replyTo = parts[1];

        if (cmd == "ap" && findingDevices && found.indexOf(ip) == -1) {
            found.push(ip);
            lastDiscoveryTime = control.millis(); // Update discovery timestamp
            if (debug) console.log(`DEVICE FOUND: ${ip},timestamp:${lastDiscoveryTime}`)
        }

        if (cmd === "pr" && ip === "*" && parts[2] === "FIND") {
            // Send back a response to the sender's serial
            radio2.sendString(`ap:${myIP}|${mySerial}`);
            if (debug) console.log(`Sending Response`)
        }

        if (cmd == "wi" && ip == myIP) {
            // Respond directly to serial of sender
            radio2.sendString("ans:" + myIP + "|" + mySerial);
        }

        if (cmd == "ans" && ip) {
            if (waitingForResponse && responseHandler) {
                let senderSerial = parseInt(replyTo);
                if (packet.serial !== senderSerial) { console.warn(`⚠️ Spoof Alert: IP ${ip} claims serial ${senderSerial}, but expected ${packet.serial}.`); return; }
                responseHandler(senderSerial);
                waitingForResponse = false;
                responseHandler = null;
            }
        }
        if (cmd == "dt") {
            if (waitForData) {
                let data = parts[3];
                let attempt = parts[2];
                if (attempt == "0") {
                    alreadyHandled = false;
                } else if (attempt == "1") {
                    // Do Nothing.
                } else {
                    return; // corrupted.
                }

                if (!alreadyHandled) {
                    if (debug) console.log(`RUNNING DATA RECIVE HANDLERS`)
                    waitForData.forEach((a) => a.fromIp == ip || a.fromIp == "*" || a.fromIp.endsWith("*") && ip.startsWith(a.fromIp.replace("*", "")) ? data.startsWith("file|") || data.startsWith("readfile") && !a._ ? false : a.func(data) : false)
                }

                alreadyHandled = true;
            }
        }
    }, true);


    game.onUpdateInterval(100, function () {
        if (findingDevices && game.runtime() - lastDiscoveryTime > 200 && foundDevices) {
            foundDevices(found);
            foundDevices = null;
            findingDevices = false;
        }
    })

    const TTL_MS = 5000

    function cleanCache() {
        const now = game.runtime()
        const keys = cache.keysArray()
        const values = cache.valuesArray()

        for (let i = 0; i < keys.length; i++) {
            const ip = keys[i]
            const entry = values[i]
            if (now - entry.timestamp > TTL_MS) {
                cache.delete(ip)
            }
        }
    }
    /**
 * Initializes the radio communication subsystem.
 * Handles both simulation and hardware contexts by waking up the radio module.
 * Must be called before any networking operations are performed.
 *
 * - In simulation mode: sends a dummy packet and waits briefly for readiness.
 * - On hardware: powers up the radio and delays to ensure full activation.
 */
    export function init() {
        let inSim = control.deviceDalVersion() == "sim"
        if (inSim) {
            radio2.sendString("ignore") // needed to wake up radio.
            pause(10) // make sure the radio is ready.
        } else {
            radio.on()
            radio2.sendString("ignore") // just to make sure radio is on.
            pause(100) // make sure it is on. takes more time than sim for saftey.
        }
    }
    /**
     * Gracefully shuts down the radio system and clears internal network state.
     * Removes any active listeners and disables the radio hardware.
     * Call this before putting the system to sleep or ending a session.
     */
    export function shutdown() {
        responseHandler = null;
        waitForData = null;
        waitingForResponse = false;
        waitForData = [];
        radio.off()
    }

    /**
 * Provides a clean way to reboot the radio subsystem, resetting communication state.
 * Intended for scenarios where a fresh connection lifecycle is desirable — such as transitioning between sessions,
 * reinitializing after inactivity, or recovering from undefined networking behavior.
 *
 * Example:
 * ``` ts
 * function run() {
 *  handlegameLogic();
 *  NetWorking.restart(); // restart the radio and try again
 *  run();
 * }
 * ```
 */
    export function restart() {
        shutdown();
        init();
    }

    // Utility to send a whois query
    /** 
     * Send a DNS request around about what is the serial number of the device with this ip?
     * @param ipTarget the ip to request the serial number of.
    */
    export function sendWhoIs(ipTarget: string): Promise<SerialNumber> {
        return new Promise<SerialNumber>(function (resolve, reject) {
            if (UseDNSCache) {
                cleanCache();

                if (cache.has(ipTarget)) {
                    let cached = cache.get(ipTarget);
                    resolve(cached.serial);
                    return; // Prevent sending a new query
                }
            }
            waitingForResponse = true;
            responseHandler =
                function (n: number) {
                    if (UseDNSCache) addMapping(ipTarget, n)
                    resolve(n);
                }


            for (let i = 0; i < 5; i++) {
                radio2.sendString("wi:" + ipTarget + "|" + mySerial);
            }

            // Timeout: reject if no response in 5 sec
            control.runInParallel(() => {
                pause(5000);
                if (waitingForResponse) {
                    waitingForResponse = false;
                    responseHandler = null;
                    reject("ERR , TimeOut for DNS reached."); // Reject Promise
                }
            });
        });
    }
    /** 
     * A Safer Stringify than JSON.stringify , Handles recusive objects.
     * @param obj the Object to convert to a JSON string
    */
    export function safeStringify(obj: any, depth = 0, maxDepth = 10): string {
        if (depth > maxDepth) throw '"[Max depth reached]"';

        if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
            return JSON.stringify(obj);
        }

        if (obj === null) return 'null';

        if (Array.isArray(obj)) {
            return '[' + obj.map((item: any) => safeStringify(item, depth + 1, maxDepth)).join(',') + ']';
        }

        if (typeof obj === 'object') {
            let props = Object.keys(obj).map(key => {
                return JSON.stringify(key) + ':' + safeStringify(obj[key], depth + 1, maxDepth);
            });
            return '{' + props.join(',') + '}';
        }

        throw '"[Unserializable]"';
    }
    let alreadyHandled = false;
    /** 
     * Send a String of Data To a IP.
     * @param ip the IP to send the data to.
     * @note apromxaltly 226 bytes of data can be sent before truncating will happen
    */
    export function SendDataTo(ip: string, data: any) {
        sendWhoIs(ip).then(function (serial) {
            radio2.sendString(`dt:${ip}|${mySerial}|0|${JSON.stringify(data)}`)

            for (let i = 0; i < 5; i++) {
                radio2.sendString(`dt:${ip}|${mySerial}|1|${JSON.stringify(data)}`)
            }
        })
    }
    /** 
     * Wether to Parse numbers and pas the parsed number if possible when a WaitForData Handler is ran
    */
    export let AUTO_PARSE_NUMBERS = false;
    /**
 * Registers a data handler for incoming packets from a specific IP or IP pattern.
 * Supports wildcards to match multiple IPs:
 * - Use `"*"` to listen for data from any IP address.
 * - Use patterns like `"10.*"` to match all IPs starting with `10.` (e.g., `10.0.0.5`, `10.2.1.42`).
 * Multiple handlers can be added for the same or overlapping IP ranges.
 * 
 * Note: JSON data will Not be Parsed befor being Passed to the Handler , if `NetWorking.AUTO_PARSE_NUMBERS` is set to true , then if the data recived is numeric,  the handler will be called with the parsed numeric value
 *  
 * Use `.then()` on the returned Handler object to define what happens when matching data is received.
 *
 * @param fromIp - The IP address or pattern to listen for. Supports `"*"` and prefix wildcards.
 * @returns A Handler that invokes the registered callback with the received data.
 * 
 *
 */
    export function WaitForData(fromIp: string, _?: boolean) {
        return new Handler<string | number>(function (resolve) {
            waitForData.push({
                func: function (dat) {
                    if (AUTO_PARSE_NUMBERS) {
                        let parsed = parseFloat(dat);
                        if (!isNaN(parsed)) {

                            resolve(parsed);
                        }
                    }
                    resolve(dat);
                }, fromIp: fromIp, _: _
            })
        })
    }
    let findingDevices = false;
    let foundDevices: (dev: string[]) => void = null;
    let found: string[] = []
    let lastDiscoveryTime = control.millis();
    export function GetPeers() {
        return new Promise<string[]>(function (resolve) {
            findingDevices = true;
            control.runInParallel(function () {

                for (let i = 0; i < 10; i++) {
                    if (!findingDevices) break;
                    radio2.sendString(`pr:*|${mySerial}|FIND`)
                    pause(5)
                }
            })
            foundDevices = function (dev) {
                resolve(dev)
            }
        })
    }

    export function getMyIP(): string { return myIP };
    function Parse(node: any, depth: number, maxDepth: number = 10): any {
        if (depth > maxDepth) return "[Max depth exceeded]";

        // Attempt to parse strings only if they look like structured JSON
        if (typeof node === "string") {
            const trimmed = node.trim();
            const looksLikeJson = (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
                (trimmed.startsWith("[") && trimmed.endsWith("]"));

            if (looksLikeJson) {
                try {
                    const parsed = JSON.parse(node);
                    return parsed;
                } catch {
                    // It's not valid JSON, treat as raw string
                    return node;
                }
            }
            return node;
        }

        if (Array.isArray(node)) {
            return node.map((item: any) => Parse(item, depth + 1));
        }

        if (typeof node === "object" && node !== null && !Array.isArray(node)) {
            const result: any = {};
            const keys = Object.keys(node);
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                result[key] = Parse(node[key], depth + 1);
            }
            return result;
        }

        // Base case for primitives
        return node;
    }
    /** 
     * Does Not seem to Work.
    */
    export function safeParse(input: string): any {

        try {
            const looksLikeJson = input.trim().startsWith("{") || input.trim().startsWith("[");
            const initial = looksLikeJson ? JSON.parse(input) : input;
            return Parse(initial, 0);
        } catch (e) {
            console.log("Parse failed:" + e);
            return null;
        }
    }

    export let UseDNSCache = false;
    let cache: Map<string, { serial: number, timestamp: number }> = new Map()

    function addMapping(ip: string, serial: number) {
        cache.set(ip, {
            serial: serial,
            timestamp: game.runtime()
        })
    }
}