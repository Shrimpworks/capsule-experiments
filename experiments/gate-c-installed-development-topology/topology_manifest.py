#!/usr/bin/env python3
"""Build and verify the P0-4A installed-byte manifest.

This development-only helper never marks a backend or runtime as admitted. It
uses an exact allowlist and fails on missing, mixed, substituted, symlinked, or
unexpected topology bytes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import plistlib
import re
import stat
import subprocess
import sys
from pathlib import Path

MANIFEST_RELATIVE = Path("Contents/Resources/Manifests/topology-manifest.json")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def run_text(*args: str) -> str:
    completed = subprocess.run(args, check=True, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, text=True)
    return completed.stdout


def macho_minimum_os(path: Path) -> str | None:
    try:
        output = run_text("vtool", "-show-build", str(path))
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    match = re.search(r"^\s*minos\s+([^\s]+)$", output, re.MULTILINE)
    return match.group(1) if match else None


def signing_fields(path: Path) -> dict[str, str | None]:
    try:
        output = run_text("codesign", "-d", "--verbose=4", str(path))
    except (subprocess.CalledProcessError, FileNotFoundError):
        return {"identifier": None, "teamIdentifier": None, "cdhash": None}
    values: dict[str, str | None] = {}
    for key, output_key in (("Identifier", "identifier"),
                            ("TeamIdentifier", "teamIdentifier"),
                            ("CDHash", "cdhash")):
        match = re.search(rf"^{key}=(.*)$", output, re.MULTILINE)
        values[output_key] = match.group(1) if match else None
    return values


def version_key(value: str) -> tuple[int, ...]:
    return tuple(int(piece) for piece in value.split("."))


def component_record(app: Path, declared: dict[str, object]) -> dict[str, object]:
    relative = Path(str(declared["path"]))
    path = app / relative
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"required regular component missing or symlinked: {relative}")
    info = path.stat()
    record = dict(declared)
    record["mode"] = f"{stat.S_IMODE(info.st_mode):04o}"
    self_referential_main = declared["role"] == "app-registrar"
    if self_referential_main:
        record["identityMode"] = "outer-app-code-signature-readback"
    else:
        record.update({"sha256": sha256(path), "byteLength": info.st_size})
    minimum = macho_minimum_os(path)
    if minimum is not None:
        record["minimumOS"] = minimum
        if not self_referential_main:
            record["signing"] = signing_fields(path)
    return record


def load_json(path: Path) -> dict[str, object]:
    with path.open("rb") as source:
        return json.load(source)


def write_json(path: Path, value: dict[str, object]) -> None:
    encoded = json.dumps(value, indent=2, sort_keys=True, ensure_ascii=True) + "\n"
    path.write_text(encoded, encoding="utf-8")


def build(args: argparse.Namespace) -> int:
    app = args.app.resolve()
    input_path = app / "Contents/Resources/Manifests/topology-input.json"
    source = load_json(input_path)
    if source.get("backendAdmitted") is not False:
        raise ValueError("P0-4A input must explicitly deny backend admission")
    components = [component_record(app, item) for item in source["components"]]
    minimums = [str(item["minimumOS"]) for item in components if "minimumOS" in item]
    effective = max(minimums, key=version_key) if minimums else None
    manifest = {
        "schemaVersion": 1,
        "purpose": source["purpose"],
        "backendAdmitted": False,
        "maximumPosture": source["maximumPosture"],
        "signingMode": args.signing_mode,
        "declaredMinimumOS": source["declaredMinimumOS"],
        "candidatePins": source["candidatePins"],
        "observedEffectiveMinimumOS": effective,
        "componentCount": len(components),
        "components": components,
        "provisionalMechanisms": source["provisionalMechanisms"],
        "coverage": {
            "exactComponentBytes": False,
            "exactHashedComponents": len(components) - 1,
            "outerMainExecutable": "outer-app-code-signature-readback",
            "manifestSelfHashExcluded": True,
            "outerCodeSignatureGeneratedAfterManifest": True,
            "notarized": False,
            "cleanHostTested": False,
        },
    }
    write_json(app / MANIFEST_RELATIVE, manifest)
    print(f"manifest=written components={len(components)} effectiveMinimumOS={effective}")
    return 0


def expected_files(manifest: dict[str, object]) -> set[Path]:
    return {Path(str(item["path"])) for item in manifest["components"]}


def observed_files(app: Path) -> set[Path]:
    result: set[Path] = set()
    for path in app.rglob("*"):
        relative = path.relative_to(app)
        if relative == MANIFEST_RELATIVE or "_CodeSignature" in relative.parts:
            continue
        if path.is_symlink() or path.is_file():
            result.add(relative)
    return result


def verify(args: argparse.Namespace) -> int:
    app = args.app.resolve()
    manifest_path = app / MANIFEST_RELATIVE
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise ValueError("installed topology manifest is missing or symlinked")
    manifest = load_json(manifest_path)
    if manifest.get("backendAdmitted") is not False:
        raise ValueError("P0-4A manifest cannot admit the backend")
    if manifest.get("maximumPosture") != "development-topology-only":
        raise ValueError("P0-4A posture ceiling changed")
    declared = expected_files(manifest)
    observed = observed_files(app)
    if declared != observed:
        missing = sorted(str(path) for path in declared - observed)
        unexpected = sorted(str(path) for path in observed - declared)
        raise ValueError(f"closed topology mismatch missing={missing} unexpected={unexpected}")
    minimums: list[str] = []
    for item in manifest["components"]:
        path = app / str(item["path"])
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"required component missing or symlinked: {item['path']}")
        self_referential_main = item.get("identityMode") == "outer-app-code-signature-readback"
        if not self_referential_main:
            if sha256(path) != item["sha256"] or path.stat().st_size != item["byteLength"]:
                raise ValueError(f"installed byte mismatch: {item['role']} {item['path']}")
        actual_mode = f"{stat.S_IMODE(path.stat().st_mode):04o}"
        if actual_mode != item["mode"]:
            raise ValueError(f"installed mode mismatch: {item['role']} {item['path']}")
        minimum = macho_minimum_os(path)
        if item.get("minimumOS") != minimum:
            raise ValueError(f"minimum-OS readback mismatch: {item['role']}")
        if minimum is not None:
            minimums.append(minimum)
            if not self_referential_main and signing_fields(path) != item.get("signing"):
                raise ValueError(f"code identity readback mismatch: {item['role']}")
            mode = path.stat().st_mode
            if mode & (stat.S_ISUID | stat.S_ISGID):
                raise ValueError(f"privileged mode forbidden: {item['role']}")
    effective = max(minimums, key=version_key) if minimums else None
    if effective != manifest.get("observedEffectiveMinimumOS"):
        raise ValueError("effective minimum OS changed")
    with (app / "Contents/Info.plist").open("rb") as source:
        info = plistlib.load(source)
    if info.get("LSMinimumSystemVersion") != manifest.get("declaredMinimumOS"):
        raise ValueError("Info.plist minimum OS does not match manifest declaration")
    service_path = app / (
        "Contents/Library/LaunchAgents/"
        "com.capsulecorp.spike.p0-4a-installed-topology.supervisor.plist")
    with service_path.open("rb") as source:
        service = plistlib.load(source)
    if service.get("BundleProgram") != "Contents/MacOS/capsule-topology-supervisor":
        raise ValueError("service does not use a bundle-relative Supervisor")
    if service.get("AbandonProcessGroup") is not True:
        raise ValueError("recovery-critical AbandonProcessGroup changed")
    if "Program" in service or service.get("UserName") == "root":
        raise ValueError("host-root or absolute service program is forbidden")
    if manifest.get("coverage", {}).get("notarized") is not False:
        raise ValueError("P0-4A cannot claim notarization")
    if args.verify_signature:
        subprocess.run(["codesign", "--verify", "--deep", "--strict", str(app)], check=True)
    print(
        f"manifest=verified sha256={sha256(manifest_path)} "
        f"components={len(manifest['components'])} effectiveMinimumOS={effective} "
        "backendAdmitted=false"
    )
    return 0


def evidence_tsv(args: argparse.Namespace) -> int:
    manifest = load_json(args.app.resolve() / MANIFEST_RELATIVE)
    print("role\tstate\tpath\tsha256-or-readback\tminimum-os\tidentifier\tteam\tcdhash")
    for item in manifest["components"]:
        signing = item.get("signing", {})
        values = [
            item["role"], item["state"], item["path"],
            item.get("sha256", "outer-signature-readback"),
            item.get("minimumOS", "n/a"), signing.get("identifier", "n/a"),
            signing.get("teamIdentifier", "n/a"), signing.get("cdhash", "n/a"),
        ]
        print("\t".join(str(value) for value in values))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    build_parser = subparsers.add_parser("build")
    build_parser.add_argument("app", type=Path)
    build_parser.add_argument("--signing-mode", required=True)
    build_parser.set_defaults(handler=build)
    verify_parser = subparsers.add_parser("verify")
    verify_parser.add_argument("app", type=Path)
    verify_parser.add_argument("--verify-signature", action="store_true")
    verify_parser.set_defaults(handler=verify)
    evidence_parser = subparsers.add_parser("evidence-tsv")
    evidence_parser.add_argument("app", type=Path)
    evidence_parser.set_defaults(handler=evidence_tsv)
    args = parser.parse_args()
    try:
        return args.handler(args)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f"REFUSED {error}", file=sys.stderr)
        return 78


if __name__ == "__main__":
    sys.exit(main())
