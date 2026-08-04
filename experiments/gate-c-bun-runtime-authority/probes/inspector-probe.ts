// DEVELOPMENT-ONLY hostile fixture for Gate C P0-0. Product packages must not import it.
console.log(JSON.stringify({ bun: Bun.version, inspect: process.env.BUN_INSPECT ?? null }));
await Bun.sleep(250);
process.exit(0);
