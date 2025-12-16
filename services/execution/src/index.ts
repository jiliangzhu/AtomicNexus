import { sum } from "@atomicnexus/common";

const SERVICE = "execution";

console.log(`[${SERVICE}] starting`);
console.log(`[${SERVICE}] smoke sum(1, 99) = ${sum(1, 99)}`);

setInterval(() => {
  console.log(`[${SERVICE}] tick`);
}, 10_000);
