import { sum } from "@atomicnexus/common";

const SERVICE = "ingestion";

console.log(`[${SERVICE}] starting`);
console.log(`[${SERVICE}] smoke sum(2, 3) = ${sum(2, 3)}`);

setInterval(() => {
  console.log(`[${SERVICE}] tick`);
}, 10_000);
