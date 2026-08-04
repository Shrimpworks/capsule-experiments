import json
import plistlib
import unittest
from pathlib import Path


EXPERIMENT = Path(__file__).resolve().parents[1]


class ManifestTests(unittest.TestCase):
    def test_topology_is_closed_and_non_admitting(self) -> None:
        topology = json.loads(
            (EXPERIMENT / "manifests/topology-input.json").read_text(encoding="utf-8")
        )
        self.assertFalse(topology["backendAdmitted"])
        self.assertEqual(topology["maximumPosture"], "development-topology-only")
        roles = {component["role"] for component in topology["components"]}
        self.assertTrue({
            "execution-supervisor", "vmm-runner", "libkrun", "libkrunfw",
            "firmware", "guest-kernel", "runtime-root", "runtime",
            "guest-launcher", "runner-entitlements", "descriptor-manifest",
            "embedded-per-user-registration",
        }.issubset(roles))
        self.assertEqual(len(roles), len(topology["components"]))
        self.assertEqual(len({item["path"] for item in topology["components"]}),
                         len(topology["components"]))
        self.assertGreaterEqual(len(topology["provisionalMechanisms"]), 10)

    def test_descriptor_manifest_is_exact_and_closed(self) -> None:
        manifest = json.loads(
            (EXPERIMENT / "manifests/descriptor-manifest.json").read_text(
                encoding="utf-8")
        )
        self.assertTrue(manifest["closed"])
        self.assertEqual([item["fd"] for item in manifest["descriptors"]],
                         list(range(8)))
        self.assertEqual(manifest["descriptors"][3]["access"], "read-only")
        self.assertIn("writable-runtime-root", manifest["forbiddenAmbientRoles"])

    def test_embedded_service_is_relative_per_user_and_non_root(self) -> None:
        with (EXPERIMENT / "LaunchAgent.plist.in").open("rb") as source:
            service = plistlib.load(source)
        self.assertEqual(
            service["BundleProgram"],
            "Contents/MacOS/capsule-topology-supervisor")
        self.assertNotIn("Program", service)
        self.assertNotEqual(service.get("UserName"), "root")
        self.assertTrue(service["AbandonProcessGroup"])
        self.assertFalse(service["RunAtLoad"])

    def test_app_declares_smappservice_floor(self) -> None:
        with (EXPERIMENT / "Info.plist.in").open("rb") as source:
            info = plistlib.load(source)
        self.assertEqual(info["LSMinimumSystemVersion"], "13.0")


if __name__ == "__main__":
    unittest.main()
