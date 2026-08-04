import json
import plistlib
import unittest
from pathlib import Path


EXPERIMENT = Path(__file__).resolve().parents[1]
CONTRACT = json.loads((EXPERIMENT / "fixtures" / "identity-contract.json").read_text())


def admits_component(*, expected, observed):
    return (
        observed["teamIdentifier"] == expected["teamIdentifier"]
        and observed["signingIdentifier"] == expected["signingIdentifier"]
        and observed["cdHash"] in expected["acceptedCdHashes"]
        and observed["entitlementsSha256"] == expected["entitlementsSha256"]
        and observed["epochSequence"] == expected["epochSequence"]
    )


class IdentityContractTests(unittest.TestCase):
    def test_closed_roles_names_and_profiles(self):
        self.assertEqual(CONTRACT["expectedTeamIdentifier"], "W4QUR9FUL4")
        self.assertEqual(
            sorted(CONTRACT["roles"]), ["bootstrap", "supervisor"]
        )
        self.assertEqual(
            CONTRACT["roles"]["supervisor"]["serviceKind"], "SMAppService.agent"
        )
        self.assertEqual(
            CONTRACT["roles"]["supervisor"]["serviceLabel"],
            CONTRACT["roles"]["supervisor"]["bundleIdentifier"],
        )
        self.assertEqual(CONTRACT["profileRequirements"]["applicationGroups"], [])
        self.assertEqual(CONTRACT["profileRequirements"]["keychainAccessGroups"], [])
        self.assertFalse(
            CONTRACT["profileRequirements"]["allowHistoricalTeam3DDR84M4JS"]
        )
        self.assertEqual(len(CONTRACT["profileRequirements"]["exactProfiles"]), 2)

    def test_closed_entitlement_surface(self):
        entitlement_files = {
            "bootstrap": "Bootstrap.entitlements",
            "supervisor": "Supervisor.entitlements",
        }
        for role_name, role in CONTRACT["roles"].items():
            self.assertEqual(
                role["requestedEntitlements"],
                {"com.apple.security.app-sandbox": True},
            )
            with (EXPERIMENT / "entitlements" / entitlement_files[role_name]).open(
                "rb"
            ) as entitlement_file:
                self.assertEqual(
                    plistlib.load(entitlement_file), role["requestedEntitlements"]
                )
            self.assertIn(
                "com.apple.security.application-groups",
                role["prohibitedEntitlements"],
            )
            self.assertIn("keychain-access-groups", role["prohibitedEntitlements"])

    def test_bootstrap_projection_is_complete_and_closed(self):
        expected = {
            "format",
            "version",
            "installationId",
            "supervisorId",
            "expectedTeamIdentifier",
            "supervisorSigningIdentifier",
            "acceptedSupervisorCdHashes",
            "supervisorEntitlementsSha256",
            "expectedUid",
            "stateRootDevice",
            "stateRootInode",
            "stateRootMode",
            "stateRootLinkCount",
            "lockEntryName",
            "lockDevice",
            "lockInode",
            "lockMode",
            "lockLinkCount",
            "storeEntryName",
            "storeFormatVersion",
            "trustEpochSequence",
            "trustEpochDigest",
        }
        self.assertEqual(set(CONTRACT["bootstrapRecordFields"]), expected)
        state = CONTRACT["state"]
        self.assertEqual(state["lockEntryName"], "supervisor.owner")
        self.assertEqual(state["lockMode"], 0o600)
        self.assertEqual(state["lockLinkCount"], 1)
        self.assertEqual(state["storeEntryName"], "supervisor-state.json")
        self.assertEqual(state["storeFormatVersion"], 1)
        for name in (
            state["bootstrapRecordEntryName"],
            state["lockEntryName"],
            state["storeEntryName"],
        ):
            self.assertNotIn("/", name)
            self.assertNotIn("\\", name)
            self.assertNotIn(name, (".", ".."))

    def test_exact_release_update_and_mismatch_matrix(self):
        role = CONTRACT["roles"]["supervisor"]
        v1, v2 = CONTRACT["releases"]
        expected_v2 = {
            "teamIdentifier": CONTRACT["expectedTeamIdentifier"],
            "signingIdentifier": role["bundleIdentifier"],
            "acceptedCdHashes": [v2["supervisorCdHashFixture"]],
            "entitlementsSha256": v2["entitlementsSha256Fixture"],
            "epochSequence": v2["epochSequence"],
        }
        correct_v2 = {
            "teamIdentifier": CONTRACT["expectedTeamIdentifier"],
            "signingIdentifier": role["bundleIdentifier"],
            "cdHash": v2["supervisorCdHashFixture"],
            "entitlementsSha256": v2["entitlementsSha256Fixture"],
            "epochSequence": v2["epochSequence"],
        }
        self.assertTrue(admits_component(expected=expected_v2, observed=correct_v2))

        mutations = {
            "wrong-team": {"teamIdentifier": "3DDR84M4JS"},
            "wrong-identifier": {"signingIdentifier": role["bundleIdentifier"] + ".other"},
            "stale-cdhash": {"cdHash": v1["supervisorCdHashFixture"]},
            "changed-entitlements": {"entitlementsSha256": "f" * 64},
            "downgrade-epoch": {"epochSequence": v1["epochSequence"]},
        }
        for name, mutation in mutations.items():
            with self.subTest(name=name):
                candidate = dict(correct_v2)
                candidate.update(mutation)
                self.assertFalse(admits_component(expected=expected_v2, observed=candidate))

    def test_coherent_rollback_is_not_claimed(self):
        # Exact comparison detects mixed/stale state. If both expected and observed state are
        # coherently restored, local equality alone cannot identify rollback.
        role = CONTRACT["roles"]["supervisor"]
        v1 = CONTRACT["releases"][0]
        restored = {
            "teamIdentifier": CONTRACT["expectedTeamIdentifier"],
            "signingIdentifier": role["bundleIdentifier"],
            "cdHash": v1["supervisorCdHashFixture"],
            "entitlementsSha256": v1["entitlementsSha256Fixture"],
            "epochSequence": v1["epochSequence"],
        }
        restored_expectation = {
            "teamIdentifier": restored["teamIdentifier"],
            "signingIdentifier": restored["signingIdentifier"],
            "acceptedCdHashes": [restored["cdHash"]],
            "entitlementsSha256": restored["entitlementsSha256"],
            "epochSequence": restored["epochSequence"],
        }
        self.assertTrue(
            admits_component(expected=restored_expectation, observed=restored)
        )


if __name__ == "__main__":
    unittest.main()
