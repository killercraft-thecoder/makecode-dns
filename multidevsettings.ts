namespace settings {
    let permissions: string[] = []
    let waitingForFiles: { filename: string, handler: (filecontents: string) => void, handler2: () => void }[] = [];
    NetWorking.WaitForData("*", true).then(function (a: string) {
        if (a.startsWith("readfile|")) {
            let file = a.split("|")[1]
            let ip = a.split("|")[2]
            if (permissions.includes(file) && exists(file)) {
                NetWorking.SendDataTo(ip, `file|${file}|1|0${settings.readString(file)}`)
            }
        }
        if (a.startsWith("file|")) {
            let valid = null;
            let name = a.split("|")[1]
            let worked = a.split("|")[2]
            let contents = a.split("|")[3]
            for (let a of waitingForFiles) {
                if (a.filename == name && a.handler) {
                    valid = a;
                }
            }
            if (worked == "1") {
                if (valid) {
                    valid.handler(contents)
                    valid = null;
                }
            } else {
                if (valid) {
                    valid.handler2()
                    valid = null;
                }
            }
        }
    })
    /**
 * Requests a string file from a remote device over the network.
 * Returns a Promise that resolves with the file contents if successfully retrieved.
 * The file must be granted permission via `addPermission`, or the promise from the reuqst will be rejected.
 *
 * @param name - The name of the file to retrieve
 * @returns Promise that resolves with the file contents as a string
 */
    export function readRemoteFile(name: string) {
        return new Promise<string>(function (resolve, reject) {
            waitingForFiles.push({
                filename: name, handler: function (a) {
                    if (a) resolve(a)
                }, handler2: function () { reject("PrivlageError") }
            })
        })
    }

    /**
     * Grants permission for any remote IP to request the specified file.
     * Once granted, requests to this file will be responded to with its contents (if it exists).
     *
     * @param filename - The name of the file to allow access to
     */
    export function addPermison(filename: string) {
        permissions.push(filename)
    }
}