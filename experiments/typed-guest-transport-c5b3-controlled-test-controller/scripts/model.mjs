export const bindingFacts = ["EXACT_PROFILE", "EXACT_AUTHORIZATION", "EXACT_ARTIFACTS", "FIXED_ROOT_ABSENT"];
export const terminalFacts = ["CHILD_TREE_ABSENT", "RUNNER_TERMINAL", "RUNNER_ABSENT", "TEARDOWN_RESOLVED", "CLEANUP_FALSE"];
export const faultEvents = new Set(["CANCEL", "DEADLINE", "STALL", "STREAM_RESET", "CAP_PLUS_ONE", "SHORT_WRITE", "READER_DEATH", "PROCESS_FAULT", "BINDING_MISMATCH"]);

const has = (facts, required) => required.every((fact) => facts.includes(fact));
const out = (machine, state, disposition, actions = []) => {
  machine.state = state;
  return { state, disposition, actions };
};

export function createMachine() {
  return { state: "STOPPED", durable: false };
}

export function step(machine, event, facts = []) {
  if (event === "STORE_INDETERMINATE") {
    machine.durable = false;
    return out(machine, "FENCED", "FENCED", ["FENCE_STORE", "REQUEST_TEARDOWN"]);
  }
  if (machine.state === "COMPLETE") {
    if (event === "RESPONSE_LOST" && machine.durable) return out(machine, "COMPLETE", "REPLAY", ["REPLAY_STORED"]);
    return out(machine, "COMPLETE", "REFUSED", ["STOP_MISMATCH"]);
  }
  if (["FENCED", "REFUSED_CLEAN", "REFUSED"].includes(machine.state)) {
    return out(machine, machine.state, machine.state === "FENCED" ? "FENCED" : "REFUSED", [machine.state === "FENCED" ? "FENCE_STORE" : "STOP_MISMATCH"]);
  }
  if (faultEvents.has(event) || (event === "RESPONSE_LOST" && !machine.durable)) {
    return out(machine, "TEARDOWN", "TEARDOWN_REQUIRED", ["REQUEST_TEARDOWN"]);
  }

  const transition = {
    STOPPED: ["BIND_EXACT", bindingFacts, "BOUND", ["CREATE_ENDPOINTS"]],
    BOUND: ["ENDPOINTS_VERIFIED", ["ENDPOINTS_DISTINCT"], "ENDPOINTS_READY", ["START_DRAINS"]],
    ENDPOINTS_READY: ["DRAINS_STARTED", ["DRAINS_ACTIVE"], "RUNNER_READY", ["START_RUNNER"]],
    RUNNER_READY: ["RUNNER_STARTED", [], "INPUT_TRANSFER", ["WRITE_SOURCE", "WRITE_INPUT"]],
    INPUT_TRANSFER: ["INPUTS_WRITTEN", ["SOURCE_COMPLETE", "INPUT_COMPLETE", "LAUNCHER_INPUTS_VALID"], "LAUNCHER_VALIDATED", ["CLOSE_INPUT_WRITERS", "ALLOW_CHILD"]],
    LAUNCHER_VALIDATED: ["CHILD_STARTED", [], "CHILD_RUNNING", []],
    CHILD_RUNNING: ["RESULT_ACCEPTED", ["RESULT_VALID"], "RESULT_VALIDATED", []],
    RESULT_VALIDATED: ["TRAILER_COMMITTED", ["TRAILER_LAST"], "TRAILER_WRITTEN", []],
    TRAILER_WRITTEN: ["FRAME_ACCEPTED", ["FRAME_EXACT"], "FRAME_OBSERVED", []],
    FRAME_OBSERVED: ["TERMINAL_FACTS_JOINED", terminalFacts, "TERMINAL_PROOF", ["REQUEST_DURABLE_COMMIT"]],
    TERMINAL_PROOF: ["DURABLE_COMMIT_CONFIRMED", ["DURABLE_RECORD"], "DURABLE_COMMIT", ["DELIVER_STORED"]],
    TEARDOWN: ["TEARDOWN_CONFIRMED", ["TEARDOWN_RESOLVED"], "ABSENCE_PROVEN", ["PROVE_ABSENCE"]],
  }[machine.state];
  if (transition && event === transition[0] && has(facts, transition[1])) {
    if (transition[2] === "DURABLE_COMMIT") machine.durable = true;
    return out(machine, transition[2], "ADVANCED", transition[3]);
  }
  if (machine.state === "DURABLE_COMMIT") {
    if (event === "RESPONSE_DELIVERED") return out(machine, "COMPLETE", "ADVANCED", []);
    if (event === "RESPONSE_LOST" && machine.durable) return out(machine, "COMPLETE", "REPLAY", ["REPLAY_STORED"]);
  }
  if (machine.state === "ABSENCE_PROVEN") {
    if (event === "ABSENCE_CONFIRMED" && has(facts, ["CHILD_TREE_ABSENT", "RUNNER_ABSENT"])) return out(machine, "CLEANUP_REQUIRED", "ADVANCED", ["REMOVE_FIXED_ROOT"]);
  }
  if (machine.state === "CLEANUP_REQUIRED") {
    if (event === "CLEANUP_CONFIRMED" && has(facts, ["FIXED_ROOT_REMOVED"])) return out(machine, "REFUSED_CLEAN", "REFUSED", []);
  }
  return out(machine, "REFUSED", "REFUSED", ["STOP_MISMATCH"]);
}
