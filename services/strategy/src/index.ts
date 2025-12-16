import { sum } from "@atomicnexus/common";

const SERVICE = "strategy";

console.log(`[${SERVICE}] starting`);
console.log(`[${SERVICE}] smoke sum(10, 5) = ${sum(10, 5)}`);

setInterval(() => {
  console.log(`[${SERVICE}] tick`);
}, 10_000);
