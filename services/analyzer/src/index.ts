import { sum } from "@atomicnexus/common";

const SERVICE = "analyzer";

console.log(`[${SERVICE}] starting`);
console.log(`[${SERVICE}] smoke sum(7, 8) = ${sum(7, 8)}`);

setInterval(() => {
  console.log(`[${SERVICE}] tick`);
}, 10_000);
