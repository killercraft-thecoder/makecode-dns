/*
NetWorking.UseDNSCache = true;
NetWorking.init()
pause(randint(500,1900))
console.log(`DEVICE SERIAL:${NetWorking.mySerial}`)
const start = control.micros();
// Create a buffer of 223 bytes
let payload = control.createBuffer(223)

// Fill it with a repeated value, e.g., 0xAA
payload.fill(0xAA)

const str = payload.toString()

for (let i = 0; i < 150; i++) {
    NetWorking.SendDataTo("10.0.0.0", str)
}
const end = control.micros()
console.log(`${(150 * 223) / 1024} KiB delivered in ${end - start} micros.`)
console.log(`Predicted Time for Trnamit:${((150 * 223) / 1024) / 8} Seconds.`)
const len = end - start;
const amount = 150 * 223;
const bytespermicro = amount / len;
console.log(`bits/millisecond:${(bytespermicro * 8) * 1000}`)
console.log(`kb/second:${Math.roundWithPrecision((((bytespermicro) * 1000) * 1000) / 1024, 16)}`)
*/