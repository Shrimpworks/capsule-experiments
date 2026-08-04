// DEVELOPMENT-ONLY hostile fixture for Gate C P0-0. Product packages must not import it.
try {
  require("./invalid-addon.node");
  console.log("addon-loaded");
} catch (error) {
  console.log(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(23);
}
