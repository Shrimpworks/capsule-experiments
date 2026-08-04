// DEVELOPMENT-ONLY hostile fixture for Gate C P0-0. Product packages must not import it.
import { macroMarker } from "./macro" with { type: "macro" };

console.log(macroMarker());
