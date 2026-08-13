export const actions = Object.freeze({
  CREATE_ENDPOINTS: 1,
  START_DRAINS: 2,
  START_RUNNER: 4,
  WRITE_SOURCE: 8,
  WRITE_INPUT: 16,
  CLOSE_INPUT_WRITERS: 32,
  ALLOW_CHILD: 64,
  REQUEST_TEARDOWN: 128,
  PROVE_ABSENCE: 256,
  REMOVE_FIXED_ROOT: 512,
  REQUEST_DURABLE_COMMIT: 1024,
  DELIVER_STORED: 2048,
  REPLAY_STORED: 4096,
  FENCE_STORE: 8192,
  STOP_MISMATCH: 16384,
});

export const exactProfile = Object.freeze({
  magic: 0x43354235,
  version: 1,
  structureBytes: 240,
  hostRootFd: 4,
  sourceFd: 5,
  inputFd: 6,
  completionFd: 7,
  vcpus: 1,
  ramMiB: 256,
  rootBytes: 134217728,
  sourcePhysicalMaximum: 262296,
  inputPhysicalMaximum: 262296,
  completionPhysicalMaximum: 262368,
  completionRetentionBytes: 262369,
  controllerContractSha256: "36285d7fa3f27a992fda413afb38c1ed05a3af30f496c5784b2165d5b2f90e59",
  controllerHeaderSha256: "0ae153a47d5a2d0cdfbae7e149139b72abbd35f7f1223dd5745f03df86cadd12",
  libkrunHeaderSha256: "dce44d1d70ab770b1089e57646e025281a4137fe5052b9dd8eaefb80c01a1bd8",
  libkrunDylibSha256: "055d9d18dc964fec4aba21948c4a344cb7a51cb48a2c70017484b718eae12f9f",
  libkrunfwDylibSha256: "0b14f4b8005dafd33c38df5935b9efdb6381c724224b3967ba1cecbecf10b6e9",
});

const exactProfileJSON = JSON.stringify(exactProfile);
export const validateProfile = (profile) => profile != null && JSON.stringify(profile) === exactProfileJSON;

const runner = Object.freeze([
  "KRUN_CREATE_CTX",
  "KRUN_SET_VM_CONFIG",
  "KRUN_DISABLE_IMPLICIT_CONSOLE",
  "KRUN_DISABLE_IMPLICIT_INIT",
  "KRUN_DISABLE_IMPLICIT_VSOCK",
  "KRUN_ADD_READ_ONLY_RAW_ROOT_FD",
  "KRUN_SET_ROOT_DISK_REMOUNT",
  "KRUN_ADD_VIRTIO_CONSOLE_MULTIPORT",
  "KRUN_ADD_SOURCE_PORT",
  "KRUN_ADD_INPUT_PORT",
  "KRUN_ADD_COMPLETION_PORT",
  "KRUN_SET_KERNEL_CONSOLE",
  "KRUN_SET_WORKDIR",
  "KRUN_SET_EXEC",
  "WRITE_READY",
  "REQUIRE_START_BYTE",
  "KRUN_START_ENTER",
]);

const rows = Object.freeze([
  [actions.CREATE_ENDPOINTS, ["CREATE_ENDPOINTS"]],
  [actions.START_DRAINS, ["START_DRAINS"]],
  [actions.START_RUNNER, runner],
  [actions.WRITE_SOURCE, ["WRITE_SOURCE"]],
  [actions.WRITE_INPUT, ["WRITE_INPUT"]],
  [actions.CLOSE_INPUT_WRITERS, ["CLOSE_INPUT_WRITERS"]],
  [actions.ALLOW_CHILD, ["ALLOW_CHILD"]],
  [actions.REQUEST_TEARDOWN, ["REQUEST_TEARDOWN"]],
  [actions.PROVE_ABSENCE, ["PROVE_ABSENCE"]],
  [actions.REMOVE_FIXED_ROOT, ["REMOVE_FIXED_ROOT"]],
  [actions.REQUEST_DURABLE_COMMIT, ["REQUEST_DURABLE_COMMIT"]],
  [actions.DELIVER_STORED, ["DELIVER_STORED"]],
  [actions.REPLAY_STORED, ["REPLAY_STORED"]],
  [actions.FENCE_STORE, ["FENCE_STORE"]],
  [actions.STOP_MISMATCH, ["STOP_MISMATCH"]],
]);
const allowed = rows.reduce((value, [bit]) => value | bit, 0);

export function translate(profile, mask) {
  if (profile == null) return { refusal: "PROFILE_ABSENT", effects: [] };
  if (!validateProfile(profile)) return { refusal: "PROFILE_MISMATCH", effects: [] };
  if (!Number.isSafeInteger(mask) || mask < 0 || (mask & ~allowed) !== 0) {
    return { refusal: "ACTION_UNKNOWN", effects: [] };
  }
  return {
    refusal: null,
    executionAuthorized: false,
    effects: rows.flatMap(([bit, effects]) => (mask & bit) !== 0 ? effects : []),
  };
}
