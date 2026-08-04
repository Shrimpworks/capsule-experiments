// DEVELOPMENT-ONLY hostile fixture for Gate C P0-0. Product packages must not import it.
console.log(
  JSON.stringify({
    dotenv: process.env.CAPSULE_P0_DOTENV ?? null,
    inherited: process.env.CAPSULE_P0_INHERITED ?? null,
    preload:
      (globalThis as typeof globalThis & { CAPSULE_P0_PRELOAD?: string }).CAPSULE_P0_PRELOAD ??
      null,
  }),
);
