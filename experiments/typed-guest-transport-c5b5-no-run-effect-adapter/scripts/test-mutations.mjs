#!/usr/bin/env node

import { exactProfile, translate, validateProfile } from "./model.mjs";

const scalarFields = [
  "magic", "version", "structureBytes", "hostRootFd", "sourceFd", "inputFd",
  "completionFd", "vcpus", "ramMiB", "rootBytes", "sourcePhysicalMaximum",
  "inputPhysicalMaximum", "completionPhysicalMaximum", "completionRetentionBytes",
];
const digestFields = [
  "controllerContractSha256", "controllerHeaderSha256", "libkrunHeaderSha256",
  "libkrunDylibSha256", "libkrunfwDylibSha256",
];
let mutations = 0;
for (const field of scalarFields) {
  const candidate = { ...exactProfile, [field]: exactProfile[field] + 1 };
  if (validateProfile(candidate) || translate(candidate, 0).refusal !== "PROFILE_MISMATCH") {
    throw new Error(`${field}: scalar mutation accepted`);
  }
  mutations += 1;
}
for (const field of digestFields) {
  const value = exactProfile[field];
  const candidate = { ...exactProfile, [field]: `${value[0] === "0" ? "1" : "0"}${value.slice(1)}` };
  if (validateProfile(candidate) || translate(candidate, 0).refusal !== "PROFILE_MISMATCH") {
    throw new Error(`${field}: digest mutation accepted`);
  }
  mutations += 1;
}
if (translate(null, 0).refusal !== "PROFILE_ABSENT") throw new Error("absent profile accepted");
if (translate(exactProfile, 32768).refusal !== "ACTION_UNKNOWN") throw new Error("unknown action accepted");
console.log(JSON.stringify({ result: "PASSED", mutations, absentProfile: "REFUSED", unknownAction: "REFUSED" }));
