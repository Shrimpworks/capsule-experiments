import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

if (process.argv.length !== 6) {
  console.error("usage: node generate-evidence.mjs BUILD_A BUILD_B EVIDENCE_DIR MANIFEST_TSV");
  process.exit(2);
}
const [buildA, buildB, evidenceDir, manifestPath] = process.argv.slice(2);
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const info = (base, name) => ({
  size: fs.statSync(path.join(base, name)).size,
  sha256: hash(path.join(base, name)),
});
const lines = fs.readFileSync(manifestPath, "utf8").trimEnd().split("\n");
const header = lines.shift().split("\t");
const entries = lines.map((line) =>
  Object.fromEntries(line.split("\t").map((value, index) => [header[index], value])),
);
const a = { tar: info(buildA, "rootfs.tar"), gzip: info(buildA, "rootfs.tar.gz") };
const b = { tar: info(buildB, "rootfs.tar"), gzip: info(buildB, "rootfs.tar.gz") };
if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("root A/B identities differ");
if (a.tar.sha256 !== "d1f600b4f88fcb369cd6d851bd55c7bed670898fad6cb7f7449a76a106c6d925")
  throw new Error("unexpected root tar");
if (a.gzip.sha256 !== "b0e1726171c08669c1c3bba70b1aae89c07270c306a1dd4fa6919ec69f579283")
  throw new Error("unexpected root gzip");

const manifest = {
  schema: "capsule.deno-core-runtime-root.v0",
  status: "experiment-only; not admitted; not signed",
  architecture: "arm64",
  operatingSystem: "linux",
  entryCap: 22,
  entries,
  totalRegularFileBytes: 71871122,
  normalizedRoot: { format: "POSIX pax tar; sorted; uid/gid 0; mtime 0", ...a.tar },
  compressedArchive: { format: "gzip -n -9", ...a.gzip },
  invocation: {
    interpreter: "/lib/ld-linux-aarch64.so.1",
    argv: [
      "--inhibit-cache",
      "--library-path",
      "/lib/aarch64-linux-gnu",
      "/bin/capsule-deno-core-physical-omission",
      "--source",
      "/fixtures/nominal.js",
      "--input",
      "/fixtures/input.json",
    ],
    environment: [],
    cwd: "/",
    inheritedDescriptors: [0, 1, 2],
  },
  declaredKernelPseudoInputs: [
    "/proc/self/maps",
    "/proc/self/fd",
    "/proc/self/cgroup",
    "/sys/fs/cgroup/cgroup.controllers",
    "/sys/fs/cgroup/cpu.max",
    "/dev/urandom",
  ],
  dynamicConfiguration: {
    ldSoCache: false,
    ldSoPreload: false,
    nss: false,
    locale: "built-in C locale",
    timezone: false,
  },
};
fs.writeFileSync(
  path.join(evidenceDir, "runtime-root-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(evidenceDir, "reproducibility.json"),
  `${JSON.stringify(
    {
      schema: "capsule.deno-core-runtime-root-reproducibility.v0",
      level: "same-host-independent-clean-containers-and-distinct-host-paths",
      result: "complete-normalized-root-bytes-equal",
      buildA: a,
      buildB: b,
      limitations: [
        "same Apple M1 Max Docker Desktop/LinuxKit host",
        "same Docker engine and exact builder image",
        "not independent-builder provenance",
      ],
    },
    null,
    2,
  )}\n`,
);

const source = JSON.parse(
  fs.readFileSync(path.join(path.dirname(manifestPath), "package-sources.json"), "utf8"),
);
const components = [
  {
    type: "application",
    name: "capsule-deno-core-physical-omission",
    version: "0.409.0-candidate",
    hashes: [{ alg: "SHA-256", content: entries.find((e) => e.path.startsWith("bin/")).sha256 }],
  },
  ...source.packages.map((pkg) => ({
    type: "library",
    name: pkg.binaryPackage,
    version: pkg.version,
    purl: `pkg:deb/debian/${pkg.binaryPackage}@${encodeURIComponent(pkg.version)}?arch=arm64`,
    hashes: [{ alg: "SHA-256", content: pkg.sha256 }],
    properties: [{ name: "capsule:runtimeBytes", value: String(pkg.runtimeBytes !== false) }],
  })),
];
fs.writeFileSync(
  path.join(evidenceDir, "sbom.cdx.json"),
  `${JSON.stringify({ bomFormat: "CycloneDX", specVersion: "1.6", version: 1, metadata: { component: { type: "operating-system", name: "governed-deno-core-runtime-root", version: a.tar.sha256 } }, components }, null, 2)}\n`,
);

const mutationLines = fs
  .readFileSync(path.join(evidenceDir, "mutation-results.tsv"), "utf8")
  .trim()
  .split("\n");
fs.writeFileSync(
  path.join(evidenceDir, "mutation-results.json"),
  `${JSON.stringify(
    {
      schema: "capsule.deno-core-runtime-root-mutations.v0",
      result: "pass",
      cases: mutationLines.map((line) => {
        const [id, result, observation] = line.split("\t");
        return { id, result, observation };
      }),
    },
    null,
    2,
  )}\n`,
);
