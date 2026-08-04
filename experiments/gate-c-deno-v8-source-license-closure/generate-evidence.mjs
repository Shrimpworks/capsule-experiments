#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const EXPECTED = {
  crate: "c7f4e905df70d6c00b95e69c5f0831fd5eb5889b0116ae2b30293578c19cd1bc",
  archive: "8d91df74c8a671c23f880e64038023f49e07ca85c96e15d76a87e2aac9b20595",
  rustyCommit: "d305e6afa7736f6e298c30ae6646f7709ee9382b",
  v8Commit: "ac1e23989121713ca642f6650b34deff7b686896",
};

const SOURCE_ARCHIVES = [
  [
    "rusty-v8",
    "rusty_v8-d305e6a.tar.gz",
    EXPECTED.rustyCommit,
    "6affd369d96a58f127905bdc17dbc18286dccf0b099fc38b585c833f89037d84",
    "https://github.com/denoland/rusty_v8/archive/d305e6afa7736f6e298c30ae6646f7709ee9382b.tar.gz",
    "rusty_v8-d305e6a",
  ],
  [
    "v8",
    "denoland-v8-ac1e239.tar.gz",
    EXPECTED.v8Commit,
    "208fc32bb41a5758bdb0e130a0019c908e68599ff5d9a40ef029a8e793b9039e",
    "https://github.com/denoland/v8/archive/ac1e23989121713ca642f6650b34deff7b686896.tar.gz",
    "denoland-v8-ac1e239",
  ],
  [
    "chromium-build",
    "chromium_build-8acb33a.tar.gz",
    "8acb33ac8dceef0503443109c0a92988189563ef",
    "bdcb812514e8f3f6aac449990b2010ea6b9ea384981485529b89b2c273172d53",
    "https://github.com/denoland/chromium_build/archive/8acb33ac8dceef0503443109c0a92988189563ef.tar.gz",
    "chromium_build-8acb33a",
  ],
  [
    "buildtools",
    "buildtools-17495e4.tar.gz",
    "17495e454aae81b581e8b3caccbb53054509b280",
    "fc8b9212dad5641fec2d00b8f79695af032e7c3b9590649ac08e16fbed10659f",
    "https://chromium.googlesource.com/chromium/src/buildtools/+archive/17495e454aae81b581e8b3caccbb53054509b280.tar.gz",
    "buildtools-17495e4",
  ],
  [
    "abseil",
    "abseil-d16e322.tar.gz",
    "d16e32215c3ab90ba57c2e904a5344d85c7353e4",
    "460797f7211af6cfe85afeb794744ad99ca3f3b1a83cc67d8f172168cbcb5c08",
    "https://chromium.googlesource.com/chromium/src/third_party/abseil-cpp/+archive/d16e32215c3ab90ba57c2e904a5344d85c7353e4.tar.gz",
    "abseil-d16e322",
  ],
  [
    "dragonbox",
    "dragonbox-beeeef9.tar.gz",
    "beeeef91cf6fef89a4d4ba5e95d47ca64ccb3a44",
    "27a2a505695f7dd53bab0391500d74fcf96c7b403bd6ceb08e234cca882f7b4f",
    "https://chromium.googlesource.com/external/github.com/jk-jeon/dragonbox/+archive/beeeef91cf6fef89a4d4ba5e95d47ca64ccb3a44.tar.gz",
    "dragonbox-beeeef9",
  ],
  [
    "fast-float",
    "fast_float-05087a3.tar.gz",
    "05087a303dad9c98768b33c829d398223a649bc6",
    "2766fd2fd29e277b084ade1d6e3899fa42e009420560a5d975c1c896663e7fc0",
    "https://chromium.googlesource.com/external/github.com/fastfloat/fast_float/+archive/05087a303dad9c98768b33c829d398223a649bc6.tar.gz",
    "fast_float-05087a3",
  ],
  [
    "fp16",
    "fp16-3d2de18.tar.gz",
    "3d2de1816307bac63c16a297e8c4dc501b4076df",
    "65ace2f05fd9434b0acb7a7d3cc6cd96842ea6236b680594af932b359bedbfc1",
    "https://github.com/Maratyszcza/FP16/archive/3d2de1816307bac63c16a297e8c4dc501b4076df.tar.gz",
    "fp16-3d2de18",
  ],
  [
    "highway",
    "highway-2607d3b.tar.gz",
    "2607d3b5b0113992fe84d3848859eae13b3b52c1",
    "c116fdebb98282fdf5dd18d68f393a6f2a01ad84e3373613946d130bd0ae7556",
    "https://chromium.googlesource.com/external/github.com/google/highway/+archive/2607d3b5b0113992fe84d3848859eae13b3b52c1.tar.gz",
    "highway-2607d3b",
  ],
  [
    "icu",
    "icu-ee5f27a.tar.gz",
    "ee5f27adc28bd3f15b2c293f726d14d2e336cbd5",
    "85cfd6c96231690d4ffbe81f14e01ebe068d820aea6ca1c55784b2507b4835d6",
    "https://chromium.googlesource.com/chromium/deps/icu/+archive/ee5f27adc28bd3f15b2c293f726d14d2e336cbd5.tar.gz",
    "icu-ee5f27a",
  ],
  [
    "jinja2",
    "jinja2-c3027d8.tar.gz",
    "c3027d884967773057bf74b957e3fea87e5df4d7",
    "c8ddc48c67bdb17355cd3c6f7e89b088222b179a61e200984e150fbd2b156a24",
    "https://chromium.googlesource.com/chromium/src/third_party/jinja2/+archive/c3027d884967773057bf74b957e3fea87e5df4d7.tar.gz",
    "jinja2-c3027d8",
  ],
  [
    "libcxx",
    "libcxx-5abc7f8.tar.gz",
    "5abc7f839700f0f17338434e1c1c6a8c87c00c11",
    "c53d8ffc7d332c1985952e2c7de908f8f0e3b2ee01525bebc235a066f4f7825f",
    "https://chromium.googlesource.com/external/github.com/llvm/llvm-project/libcxx/+archive/5abc7f839700f0f17338434e1c1c6a8c87c00c11.tar.gz",
    "libcxx-5abc7f8",
  ],
  [
    "libcxxabi",
    "libcxxabi-8f11bb1.tar.gz",
    "8f11bb1d4438d0239d0dfc1bd9456a9f31629dda",
    "6512f753a791ea14c89b173bfbcd12495a681c6572857a48a80a416b65741f1b",
    "https://chromium.googlesource.com/external/github.com/llvm/llvm-project/libcxxabi/+archive/8f11bb1d4438d0239d0dfc1bd9456a9f31629dda.tar.gz",
    "libcxxabi-8f11bb1",
  ],
  [
    "libunwind",
    "libunwind-d6c7a21.tar.gz",
    "d6c7a21e978f0adaa43accaad53bc64f0b64f6ec",
    "ca91cd716d08a1a06ddab5125cb6a872e85f24b809ba0b5e1df713159cb9d3fb",
    "https://chromium.googlesource.com/external/github.com/llvm/llvm-project/libunwind/+archive/d6c7a21e978f0adaa43accaad53bc64f0b64f6ec.tar.gz",
    "libunwind-d6c7a21",
  ],
  [
    "llvm-libc",
    "llvm-libc-9309c11.tar.gz",
    "9309c117ebae84dd2f9df1ef99de4782162527d5",
    "7603dc04c608193ab81990b5a96ee845e2d87eca54a7d250ed8462871e763a9f",
    "https://chromium.googlesource.com/external/github.com/llvm/llvm-project/libc/+archive/9309c117ebae84dd2f9df1ef99de4782162527d5.tar.gz",
    "llvm-libc-9309c11",
  ],
  [
    "markupsafe",
    "markupsafe-4256084.tar.gz",
    "4256084ae14175d38a3ff7d739dca83ae49ccec6",
    "15091e9b33c60d0ab8f6c3087498e4c8ef4ac27e5b69a111e651889dc12eaea9",
    "https://chromium.googlesource.com/chromium/src/third_party/markupsafe/+archive/4256084ae14175d38a3ff7d739dca83ae49ccec6.tar.gz",
    "markupsafe-4256084",
  ],
  [
    "partition-alloc",
    "partition_alloc-ff3b8b8.tar.gz",
    "ff3b8b885b8374cbd3902642d94dc737bda93d5d",
    "e66cf389ae4fc30d819ce7f760a5fce1492757c308436d59904fda9dd6ff5ae1",
    "https://chromium.googlesource.com/chromium/src/base/allocator/partition_allocator/+archive/ff3b8b885b8374cbd3902642d94dc737bda93d5d.tar.gz",
    "partition_alloc-ff3b8b8",
  ],
  [
    "chromium-rust",
    "chromium-rust-26e8ff4.tar.gz",
    "26e8ff47f18a8d28d6187a04b6a16cb7332356f8",
    "cd0c666fd259fa74ac26ecd0d09c5b57624c1455a9e1b0dc36878505b152c512",
    "https://chromium.googlesource.com/chromium/src/third_party/rust/+archive/26e8ff47f18a8d28d6187a04b6a16cb7332356f8.tar.gz",
    "chromium-rust-26e8ff4",
  ],
  [
    "simdutf",
    "simdutf-f7356ee.tar.gz",
    "f7356eed293f8208c40b3c1b344a50bd70971983",
    "2641dc8eb0adda1527daa15abb5ffc0298dcdf01f8d09a9cc4cd53252b561da1",
    "https://chromium.googlesource.com/chromium/src/third_party/simdutf/+archive/f7356eed293f8208c40b3c1b344a50bd70971983.tar.gz",
    "simdutf-f7356ee",
  ],
  [
    "tools-clang",
    "tools-clang-45f4b9e.tar.gz",
    "45f4b9e25124809497a27a8ae0e63d603b0f9f1b",
    "55cab7fc2f6972c6d0b564c217256b2a1ee6009fba8ba6ac4938ee113eda5a7d",
    "https://chromium.googlesource.com/chromium/src/tools/clang/+archive/45f4b9e25124809497a27a8ae0e63d603b0f9f1b.tar.gz",
    "tools-clang-45f4b9e",
  ],
  [
    "tools-win",
    "tools-win-faefd1b.tar.gz",
    "faefd1b6fa9eeb033ad6fe60368ccb9bf908cbd0",
    "b09efd819f9fc20c9f3b7654ebb312ce1a41b7712ab317db75751bed0fd34fa4",
    "https://chromium.googlesource.com/chromium/src/tools/win/+archive/faefd1b6fa9eeb033ad6fe60368ccb9bf908cbd0.tar.gz",
    "tools-win-faefd1b",
  ],
];

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, item, index, all) => {
    if (item.startsWith("--")) pairs.push([item.slice(2), all[index + 1]]);
    return pairs;
  }, []),
);
if (!args["input-root"] || !args.output) {
  throw new Error("usage: generate-evidence.mjs --input-root DIR --output DIR");
}

const input = path.resolve(args["input-root"]);
const output = path.resolve(args.output);
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (name, value) =>
  fs.writeFileSync(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`);
const walk = (dir, out = []) => {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) walk(file, out);
    else out.push(file);
  }
  return out;
};
const check = (file, expected) => {
  const actual = sha256(file);
  if (actual !== expected) throw new Error(`${file}: expected ${expected}, got ${actual}`);
  return actual;
};

function parseAr(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.subarray(0, 8).toString() !== "!<arch>\n") throw new Error("not an ar archive");
  let cursor = 8;
  let longNames = Buffer.alloc(0);
  const members = [];
  while (cursor + 60 <= bytes.length) {
    const header = bytes.subarray(cursor, cursor + 60);
    if (header.subarray(58, 60).toString() !== "`\n")
      throw new Error(`invalid ar header at ${cursor}`);
    const raw = header.subarray(0, 16).toString().trim();
    const originalSize = Number(header.subarray(48, 58).toString().trim());
    let data = cursor + 60;
    let size = originalSize;
    let name = raw;
    if (raw === "//") longNames = bytes.subarray(data, data + size);
    else if (/^\/\d+$/.test(raw)) {
      const offset = Number(raw.slice(1));
      const end = longNames.indexOf(10, offset);
      name = longNames
        .subarray(offset, end < 0 ? longNames.length : end)
        .toString()
        .replace(/\/$/, "");
    } else if (raw.startsWith("#1/")) {
      const length = Number(raw.slice(3));
      name = bytes.subarray(data, data + length).toString();
      data += length;
      size -= length;
    } else name = name.replace(/\/$/, "");
    if (!["/", "//", "/SYM64/"].includes(raw)) members.push({ name, size });
    cursor += 60 + originalSize;
    if (cursor % 2) cursor += 1;
  }
  return members;
}

fs.mkdirSync(output, { recursive: true });
const crate = path.join(input, "v8-150.2.0.crate");
const archiveGz = path.join(input, "librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz");
const archive = path.join(input, "librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a");
check(crate, EXPECTED.crate);
check(archiveGz, EXPECTED.archive);

const sources = SOURCE_ARCHIVES.map(([name, filename, revision, digest, url, tree]) => {
  check(path.join(input, "source-archives", filename), digest);
  return {
    name,
    revision,
    url,
    retrieved: "2026-08-02",
    retrievalArchive: { filename, sha256: digest },
    tree,
  };
});

const sourceIndex = new Map();
const licenseFiles = [];
for (const source of sources) {
  const root = path.join(input, "source-trees", source.tree);
  for (const file of walk(root)) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    if (/\.(?:cc|c|cpp|cxx|S|s|asm|m|mm)$/.test(file)) {
      const stem = path.basename(file).replace(/\.[^.]+$/, "");
      if (!sourceIndex.has(stem)) sourceIndex.set(stem, []);
      sourceIndex.get(stem).push(`${source.name}:${relative}`);
    }
    if (/^(?:LICENSE.*|COPYING.*|NOTICE.*|README\.chromium)$/i.test(path.basename(file))) {
      licenseFiles.push({ component: source.name, path: relative, sha256: sha256(file) });
    }
  }
}
licenseFiles.sort((a, b) => `${a.component}/${a.path}`.localeCompare(`${b.component}/${b.path}`));

const members = parseAr(archive);
let uniqueSourcePath = 0;
let uniqueComponent = 0;
let ambiguousComponent = 0;
let unmatched = 0;
const componentCounts = {};
for (const member of members) {
  const candidates = sourceIndex.get(member.name.replace(/\.o$/, "")) ?? [];
  const components = [...new Set(candidates.map((candidate) => candidate.split(":", 1)[0]))].sort();
  member.sourceCandidates = candidates.sort();
  member.componentCandidates = components;
  if (candidates.length === 1) uniqueSourcePath += 1;
  if (components.length === 1) {
    uniqueComponent += 1;
    componentCounts[components[0]] = (componentCounts[components[0]] ?? 0) + 1;
  } else if (components.length > 1) ambiguousComponent += 1;
  else unmatched += 1;
}

const embeddedSourcePaths = [
  ...new Set(
    execFileSync("strings", [archive], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /(?:^|\/)(?:src|third_party)\/.*\.(?:cc|cpp|c|S)$/.test(line)),
  ),
].sort();

writeJson("archive-provenance.json", {
  schemaVersion: 1,
  retrieved: "2026-08-02",
  crate: {
    name: "v8",
    version: "150.2.0",
    sha256: EXPECTED.crate,
    vcsCommit: EXPECTED.rustyCommit,
    cargoVcsDirty: true,
  },
  release: {
    repository: "https://github.com/denoland/rusty_v8",
    url: "https://github.com/denoland/rusty_v8/releases/tag/v150.2.0",
    tag: "v150.2.0",
    tagCommit: EXPECTED.rustyCommit,
    releaseId: 355124236,
    publishedAt: "2026-07-16T13:53:21Z",
    asset: {
      id: 479244251,
      name: path.basename(archiveGz),
      size: 37576362,
      sha256: EXPECTED.archive,
      createdAt: "2026-07-16T14:08:24Z",
      url: "https://github.com/denoland/rusty_v8/releases/download/v150.2.0/librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz",
    },
  },
  workflow: {
    runId: 29503514733,
    runUrl: "https://github.com/denoland/rusty_v8/actions/runs/29503514733",
    attempt: 2,
    headSha: EXPECTED.rustyCommit,
    jobId: 87701498072,
    jobUrl: "https://github.com/denoland/rusty_v8/actions/runs/29503514733/job/87701498072",
    jobName: "release aarch64-unknown-linux-gnu  simdutf",
    conclusion: "success",
    runnerLabel: "ubuntu-22.04-xl",
    logAccess: "HTTP 403 without authenticated Actions-log access",
  },
  relationship:
    "crate vcs metadata -> exact signed rusty_v8 commit/tag -> exact successful release job -> GitHub release asset digest",
});

writeJson("source-manifest.json", {
  schemaVersion: 1,
  retrieved: "2026-08-02",
  sourceIdentity: {
    rustyV8: EXPECTED.rustyCommit,
    rustyV8Url: `https://github.com/denoland/rusty_v8/commit/${EXPECTED.rustyCommit}`,
    denolandV8: EXPECTED.v8Commit,
    denolandV8Url: `https://github.com/denoland/v8/commit/${EXPECTED.v8Commit}`,
    chromiumV8Base: "0da5ef4358784bb0af0ff5d5d7c49cdad8931d1e",
    chromiumV8BaseUrl:
      "https://chromium.googlesource.com/v8/v8/+/0da5ef4358784bb0af0ff5d5d7c49cdad8931d1e",
    v8Version: "15.0.245.2",
  },
  archiveHashMeaning:
    "Retrieval blob hashes verify the bytes retrieved on 2026-08-02; immutable Git commits/trees are the source identities because server-generated archive packaging is not itself a stable source identity.",
  components: sources,
  patchStack: [
    {
      order: 1,
      commit: "cabd5f6e2c673a000e9c334fdbdf29ab0023da07",
      subject: "Remove googletest visibility workaround in BUILD.gn",
      patchSha256: "ba521cc95927ad6f33a55fa2d16ff11fe535fe9d4cab72aa4300ee22774ba23e",
      url: "https://github.com/denoland/v8/commit/cabd5f6e2c673a000e9c334fdbdf29ab0023da07.patch",
    },
    {
      order: 2,
      commit: "ffe1c78c9443321313d0fd28dec5e468a241d129",
      subject: "add padding to fix ~ptrcmp builds on windows",
      patchSha256: "eb83dceef8691380c3d2eadcc75272bb8bb7ee7b6f437205e992f71ed6f38eb5",
      url: "https://github.com/denoland/v8/commit/ffe1c78c9443321313d0fd28dec5e468a241d129.patch",
    },
    {
      order: 3,
      commit: "10b91f1f2e3828859868e186eee681882a9a248a",
      subject: "Fix crash on Apple Silicon when mprotect fails expectedly",
      patchSha256: "997ee5bbce88a0d0104e48fde1224d3ed74a0fc27d389ba9bf5fa7547a4c576b",
      url: "https://github.com/denoland/v8/commit/10b91f1f2e3828859868e186eee681882a9a248a.patch",
    },
    {
      order: 4,
      commit: EXPECTED.v8Commit,
      subject: "Apply V8_TLS_USED_IN_LIBRARY define to V8 internal_config",
      patchSha256: "517fcebc819cf4311495ef993fd72474ec996aa5450c86d86d774f326a5e26d1",
      url: `https://github.com/denoland/v8/commit/${EXPECTED.v8Commit}.patch`,
    },
  ],
});

writeJson("archive-inventory.json", {
  schemaVersion: 1,
  archive: {
    sha256: EXPECTED.archive,
    decompressedBytes: fs.statSync(archive).size,
    memberCount: members.length,
    memberPayloadBytes: members.reduce((sum, member) => sum + member.size, 0),
  },
  mapping: {
    method:
      "GNU ar member parsing plus source-basename candidate index and embedded source-path strings",
    uniqueSourcePath,
    uniqueComponent,
    ambiguousComponent,
    unmatched,
    componentCounts,
    embeddedSourcePathCount: embeddedSourcePaths.length,
    limit:
      "The release omits args.gn, build.ninja and ninja dependency metadata; basename collisions and generated objects cannot be uniquely assigned from archive bytes alone.",
  },
  embeddedSourcePaths,
  members,
});

writeJson("license-notice-manifest.json", {
  schemaVersion: 1,
  status: "incomplete",
  reviewedExpressions: [
    {
      component: "rusty-v8",
      expression: "MIT",
      textSha256: "1c6356fb751d45f0c53093ebf8a7f5e580e802f51999178e19d60f3ec39e147d",
      evidence: "LICENSE",
    },
    {
      component: "v8",
      expression: "BSD-3-Clause",
      textSha256: "6ab33af8774a0f396ee3aeeb761e3229057682d6f9fa7f572e390c2cb3a6e509",
      evidence: "LICENSE",
    },
    {
      component: "abseil",
      expression: "Apache-2.0",
      textSha256: "c79a7fea0e3cac04cd43f20e7b648e5a0ff8fa5344e644b0ee09ca1162b62747",
      evidence: "LICENSE",
    },
    {
      component: "dragonbox",
      expression: "Apache-2.0 WITH LLVM-exception OR BSL-1.0",
      textSha256: [
        "9e45e856bedccee9f67254082ca11851d954de2fed7448c4bed19ad9aab99a91",
        "c9bff75738922193e67fa726fa225535870d2aa1059f91452c411736284ad566",
      ],
      evidence: "LICENSE-Apache2-LLVM; LICENSE-Boost",
    },
    {
      component: "fast-float",
      expression: "Apache-2.0 OR BSL-1.0 OR MIT",
      textSha256: [
        "097a889aa954d04e088b790b10a4014d6189561d0a6013935a73ce3d4ddaaf06",
        "8d8291caf1cee26d23acf3eb67c9f9a2d58f1c681b16a4fbe8cbfb9e3c0b5a9b",
        "e562f3f974ced7e69dd1db77b820b36bcf8f30377f1aa105723fba449c53c4e6",
      ],
      evidence: "LICENSE-APACHE; LICENSE-BOOST; LICENSE-MIT",
    },
    {
      component: "fp16",
      expression: "MIT",
      textSha256: "17e4f539024be2749ee729d1e2f01d24cef12ece8c9bf18e91a4349be29c80bf",
      evidence: "LICENSE",
    },
    {
      component: "highway",
      expression: "Apache-2.0",
      textSha256: "e340270d4f64384569a91d546acb5b094d69ce47f0c015db77abb74dc6f815af",
      evidence: "LICENSE",
    },
    {
      component: "icu",
      expression: "LicenseRef-Unicode-3.0",
      textSha256: "451167c55c0fa447cc2d5632714f5e3c567fe4f1e1badefab2c1333852198aca",
      evidence: "LICENSE; README.chromium labels it MIT",
    },
    {
      component: "libcxx",
      expression: "Apache-2.0 WITH LLVM-exception",
      textSha256: "539dd7aed86e8a4f12cbdd0e6c50c189c7d74847e4fecc64ce2c6ee3a01da38b",
      evidence: "LICENSE.TXT",
    },
    {
      component: "libcxxabi",
      expression: "Apache-2.0 WITH LLVM-exception",
      textSha256: "e2b35be49f7284a45b7baca8fc7b3ab7440e7902392b2528a457816b5bb2a15c",
      evidence: "LICENSE.TXT",
    },
    {
      component: "libunwind",
      expression: "Apache-2.0 WITH LLVM-exception",
      textSha256: "b5efebcaca80879234098e52d1725e6d9eb8fb96a19fce625d39184b705f7b6d",
      evidence: "LICENSE.TXT",
    },
    {
      component: "simdutf",
      expression: "MIT",
      textSha256: "fc8dbc04e03ad4efc08a647ffe7f995b811a95bc04c0e85a56d5277c6593fa5f",
      evidence: "LICENSE",
    },
  ],
  allDiscoveredLicenseNoticeFiles: licenseFiles,
  discrepancies: [
    "The release asset contains no LICENSE, NOTICE, README.chromium, source bundle, or generated credits asset.",
    "The exact static-library GN closure was not published, so discovered source-tree license files cannot be reduced to a proven complete shipped-component notice set.",
    "partition_alloc commit ff3b8b8... has source headers referring to a repository LICENSE file, but its official subrepository archive has no root LICENSE.",
    "simdutf README.chromium records upstream revision da645ece while rusty_v8 pins Chromium-vendored commit f7356eed; the relationship is not documented by the release.",
    "ICU README.chromium labels License: MIT while the exact LICENSE text is the Unicode license; legal normalization requires review.",
  ],
  legalReview:
    "Required before distribution; expressions are an engineering inventory, not legal advice.",
});

writeJson("build-inputs.json", {
  schemaVersion: 1,
  status: "not-independently-rebuildable-from-declared-immutable-inputs",
  selectedJob: {
    run: 29503514733,
    attempt: 2,
    job: 87701498072,
    target: "aarch64-unknown-linux-gnu",
    variant: "release",
    simdutf: true,
    pointerCompression: false,
  },
  pinned: {
    rust: "1.91.0",
    gn: { revision: "3357c4f51b1a9e676378c695dd9c7e9911c35ee6" },
    ninja: { package: "infra/3pp/tools/ninja/linux-amd64", version: "3@1.12.1.chromium.4" },
    sysroots: [
      {
        arch: "amd64",
        sha256: "52d61d4446ffebfaa3dda2cd02da4ab4876ff237853f46d273e7f9b666652e1d",
        url: "https://commondatastorage.googleapis.com/chrome-linux-sysroot/52d61d4446ffebfaa3dda2cd02da4ab4876ff237853f46d273e7f9b666652e1d",
      },
      {
        arch: "arm64",
        sha256: "c7176a4c7aacbf46bda58a029f39f79a68008d3dee6518f154dcf5161a5486d8",
        url: "https://commondatastorage.googleapis.com/chrome-linux-sysroot/c7176a4c7aacbf46bda58a029f39f79a68008d3dee6518f154dcf5161a5486d8",
      },
    ],
    v8RustToolchain: {
      object:
        "rust-toolchain-4c4205163abcbd08948b3efab796c543ba1ea687-4-llvmorg-23-init-10931-g20b6ec66.tar.xz",
      sha256: "832de79f8d90940f4aaef023f83a00c1e7210c023f4d57f606b7bf9831c889aa",
      size: 274393124,
    },
    sccacheVersion: "0.8.2",
  },
  derivedGnArgs: [
    "is_debug=false",
    'target_cpu="arm64"',
    "use_sysroot=true",
    "rusty_v8_enable_simdutf=true",
    "v8_monolithic_for_shared_library=true",
    "v8_enable_sandbox=false",
    "v8_enable_pointer_compression=false",
    "treat_warnings_as_errors=false",
    "use_custom_libcxx=true",
  ],
  unresolvedImmutableInputs: [
    "Exact ubuntu-22.04-xl runner image revision and installed base packages",
    "Exact apt indices and package versions for GNU aarch64 cross toolchain, QEMU and libc6-arm64-cross",
    "Exact apt.llvm.org clang/lld/libclang 19 package revisions",
    "Exact Python 3.11.x patch version",
    "Resolved commit for cargo-bins/cargo-binstall@main and versions of cargo-binstall/cargo-nextest",
    "Resolved commits for tag-referenced GitHub Actions where release metadata does not retain them",
    "sccache tarball digest (workflow pins only v0.8.2 and does not verify a checksum)",
    "Complete effective environment, GN_ARGS value, generated args.gn/build.ninja/dependency graph, and submodule-status artifact",
    "Input archive mtime stored by gzip -9c; workflow does not use gzip -n",
  ],
  rebuild: {
    attempted: false,
    reason:
      "Required exact inputs are unavailable; a local build would not test reproduction of the official publisher bytes.",
  },
  comparison: {
    completeBytes: "not-performed",
    symbolsMembers: "official archive inventoried only",
    limit:
      "No independently rebuilt archive exists, so no reproducibility or equivalence claim is made.",
  },
});

writeJson("admission-checklist.json", {
  schemaVersion: 1,
  intendedEngineeringDirection: "governed-deno-core",
  currentEvidenceStatus: "SOURCE-LICENSE-CLOSURE-NO-GO",
  runtimeAdmission: false,
  checks: [
    { id: "exact-archive-identity", pass: true },
    { id: "exact-rusty-v8-and-v8-source-revisions", pass: true },
    { id: "exact-denoland-v8-patch-stack", pass: true },
    { id: "complete-immutable-build-inputs", pass: false },
    { id: "independent-official-archive-rebuild", pass: false },
    { id: "complete-linked-gn-component-closure", pass: false },
    { id: "complete-license-and-notice-closure", pass: false },
    { id: "source-publication-bundle-and-verifier", pass: false },
    { id: "cyclonedx-composition-complete", pass: false },
  ],
  decision: "SOURCE-LICENSE-CLOSURE-NO-GO",
  effect:
    "Keep RUNTIME-001 and runtime/profile selection blocked. This does not supersede ADR-0003 or admit deno_core.",
});
