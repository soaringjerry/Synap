// Placeholder TypeScript example (node-fetch or axios)
// Run with: ts-node examples/ts/example.ts

import fetch from 'node-fetch';

async function main() {
  const res = await fetch('http://localhost:8080/health');
  const data = await res.json();
  console.log(res.status, data);
}

main();

