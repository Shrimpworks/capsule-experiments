// DEVELOPMENT-ONLY hostile fixture for Gate C P0-0. Product packages must not import it.
(globalThis as typeof globalThis & { CAPSULE_P0_PRELOAD?: string }).CAPSULE_P0_PRELOAD =
  "bunfig-preload";
