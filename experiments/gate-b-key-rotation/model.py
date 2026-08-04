"""Development-only executable model for release-scoped operational-key rotation."""

from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
from pathlib import Path
from typing import Callable


ROLES = ("daemon", "broker", "supervisor")


class Refused(RuntimeError):
    """The modeled security boundary refused an unsafe transition."""


def digest(value: object) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(payload).hexdigest()


class RotationModel:
    """Two-store model: Supervisor state and independently observable key/component effects."""

    def __init__(self, root: Path, checkpoint: Callable[[str], None] | None = None):
        root.mkdir(parents=True, exist_ok=True)
        self.control_path = root / "control.sqlite"
        self.external_path = root / "external.sqlite"
        self.db = sqlite3.connect(self.control_path)
        self.ext = sqlite3.connect(self.external_path)
        self.db.row_factory = sqlite3.Row
        self.ext.row_factory = sqlite3.Row
        self.checkpoint = checkpoint or (lambda _name: None)
        for connection in (self.db, self.ext):
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA synchronous=FULL")
            connection.execute("PRAGMA foreign_keys=ON")

    def close(self) -> None:
        self.db.close()
        self.ext.close()

    def initialize(self) -> None:
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS state(
              singleton INTEGER PRIMARY KEY CHECK(singleton=1), phase TEXT NOT NULL,
              execution_enabled INTEGER NOT NULL, epoch INTEGER NOT NULL,
              epoch_digest TEXT NOT NULL, active_key TEXT NOT NULL,
              active_group TEXT NOT NULL, transition_id TEXT
            );
            CREATE TABLE IF NOT EXISTS transitions(
              transition_id TEXT PRIMARY KEY, from_epoch INTEGER NOT NULL,
              to_epoch INTEGER NOT NULL, old_key TEXT NOT NULL, new_key TEXT NOT NULL,
              old_group TEXT NOT NULL, new_group TEXT NOT NULL,
              target_json TEXT NOT NULL, prepared_digest TEXT,
              epoch_committed INTEGER NOT NULL DEFAULT 0,
              old_key_retired INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS key_authorizations(
              key_id TEXT PRIMARY KEY, group_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
              purpose TEXT NOT NULL, epoch INTEGER NOT NULL, status TEXT NOT NULL,
              transition_id TEXT
            );
            CREATE TABLE IF NOT EXISTS grants(
              grant_id TEXT PRIMARY KEY, epoch INTEGER NOT NULL, status TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS component_acceptances(
              transition_id TEXT NOT NULL, role TEXT NOT NULL, epoch_digest TEXT NOT NULL,
              code_identity TEXT NOT NULL, process_instance TEXT NOT NULL,
              PRIMARY KEY(transition_id, role)
            );
            CREATE TABLE IF NOT EXISTS events(
              sequence INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL
            );
            """
        )
        self.ext.executescript(
            """
            CREATE TABLE IF NOT EXISTS keys_external(
              key_id TEXT PRIMARY KEY, group_id TEXT NOT NULL,
              fingerprint TEXT NOT NULL, present INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS components_external(
              role TEXT PRIMARY KEY, release_id TEXT NOT NULL,
              code_identity TEXT NOT NULL, process_instance TEXT NOT NULL
            );
            """
        )
        if self.db.execute("SELECT 1 FROM state").fetchone() is not None:
            return
        epoch_digest = digest({"epoch": 1, "approvalKey": "approval-v1"})
        with self.db:
            self.db.execute(
                "INSERT INTO state VALUES(1,'stable',1,1,?,?,?,NULL)",
                (epoch_digest, "approval-v1", "approval.release1"),
            )
            self.db.execute(
                "INSERT INTO key_authorizations VALUES(?,?,?,?,?,?,NULL)",
                (
                    "approval-v1",
                    "approval.release1",
                    "fingerprint-v1",
                    "capsule.plan.approve",
                    1,
                    "active",
                ),
            )
        with self.ext:
            self.ext.execute(
                "INSERT INTO keys_external VALUES(?,?,?,1)",
                ("approval-v1", "approval.release1", "fingerprint-v1"),
            )
            for role in ROLES:
                self.ext.execute(
                    "INSERT INTO components_external VALUES(?,?,?,?)",
                    (role, "release1", f"{role}-release1", f"{role}-process-1"),
                )

    def state(self) -> sqlite3.Row:
        row = self.db.execute("SELECT * FROM state WHERE singleton=1").fetchone()
        assert row is not None
        return row

    def transition(self, transition_id: str = "rotation-1") -> sqlite3.Row:
        row = self.db.execute(
            "SELECT * FROM transitions WHERE transition_id=?", (transition_id,)
        ).fetchone()
        if row is None:
            raise Refused("unknown transition")
        return row

    def _event(self, code: str) -> None:
        self.db.execute("INSERT INTO events(code) VALUES(?)", (code,))

    def _set_repair(self, reason: str) -> None:
        with self.db:
            self.db.execute(
                "UPDATE state SET phase='repair-required', execution_enabled=0 WHERE singleton=1"
            )
            self._event(f"repair-required:{reason}")

    def assert_execution_ready(self) -> None:
        state = self.state()
        if state["phase"] != "stable" or state["execution_enabled"] != 1:
            raise Refused("execution is fenced")
        auth = self.db.execute(
            "SELECT * FROM key_authorizations WHERE key_id=?",
            (state["active_key"],),
        ).fetchone()
        external = self.ext.execute(
            "SELECT * FROM keys_external WHERE key_id=? AND present=1",
            (state["active_key"],),
        ).fetchone()
        if (
            auth is None
            or auth["status"] != "active"
            or auth["epoch"] != state["epoch"]
            or external is None
            or external["fingerprint"] != auth["fingerprint"]
            or external["group_id"] != auth["group_id"]
        ):
            raise Refused("active key is not exactly authorized and available")

    def issue_grant(self, grant_id: str) -> None:
        self.assert_execution_ready()
        with self.db:
            self.db.execute(
                "INSERT INTO grants VALUES(?,?,'issued')",
                (grant_id, self.state()["epoch"]),
            )

    def begin(self, transition_id: str = "rotation-1") -> None:
        state = self.state()
        if state["phase"] != "stable" or state["execution_enabled"] != 1:
            raise Refused("transition requires stable enabled state")
        target = {
            "transitionId": transition_id,
            "fromEpoch": state["epoch"],
            "toEpoch": state["epoch"] + 1,
            "oldKey": state["active_key"],
            "newKey": "approval-v2",
            "oldGroup": state["active_group"],
            "newGroup": "approval.release2",
            "purpose": "capsule.plan.approve",
            "targetBroker": "broker-release2",
        }
        with self.db:
            self.db.execute(
                """INSERT INTO transitions(
                     transition_id,from_epoch,to_epoch,old_key,new_key,old_group,new_group,
                     target_json,status) VALUES(?,?,?,?,?,?,?,?,?)""",
                (
                    transition_id,
                    state["epoch"],
                    state["epoch"] + 1,
                    state["active_key"],
                    "approval-v2",
                    state["active_group"],
                    "approval.release2",
                    json.dumps(target, sort_keys=True, separators=(",", ":")),
                    "preparing",
                ),
            )
            self.db.execute(
                """UPDATE state SET phase='preparing-update',execution_enabled=0,
                   transition_id=? WHERE singleton=1""",
                (transition_id,),
            )
            self.db.execute(
                "UPDATE grants SET status='invalidated-transition' WHERE status='issued'"
            )
            self._event("transition-fenced")
        self.checkpoint("transition_fenced")

    def prepare(self, transition_id: str = "rotation-1") -> None:
        transition = self.transition(transition_id)
        if transition["status"] != "preparing":
            raise Refused("PreparedUpdate replay or wrong phase")
        prepared_digest = digest(json.loads(transition["target_json"]))
        with self.db:
            self.db.execute(
                "UPDATE transitions SET prepared_digest=?,status='prepared' WHERE transition_id=?",
                (prepared_digest, transition_id),
            )
            self.db.execute("UPDATE state SET phase='prepared' WHERE singleton=1")
            self._event("prepared-update-persisted")
        self.checkpoint("prepared_update_persisted")

    def ensure_new_key(self, transition_id: str = "rotation-1") -> str:
        transition = self.transition(transition_id)
        if transition["status"] not in ("prepared", "key-authorized"):
            raise Refused("new key creation requires PreparedUpdate")
        existing_auth = self.db.execute(
            "SELECT * FROM key_authorizations WHERE key_id=?", (transition["new_key"],)
        ).fetchone()
        if existing_auth is not None:
            external = self.ext.execute(
                "SELECT * FROM keys_external WHERE key_id=? AND present=1",
                (transition["new_key"],),
            ).fetchone()
            if external is None or external["fingerprint"] != existing_auth["fingerprint"]:
                self._set_repair("authorized-new-key-missing-or-replaced")
                raise Refused("authorized new key changed")
            return existing_auth["fingerprint"]
        with self.db:
            self.db.execute("UPDATE state SET phase='creating-new-key' WHERE singleton=1")
            self._event("new-key-intent")
        self.checkpoint("new_key_intent_committed")
        external = self.ext.execute(
            "SELECT * FROM keys_external WHERE key_id=?", (transition["new_key"],)
        ).fetchone()
        if external is None:
            fingerprint = hashlib.sha256(secrets.token_bytes(32)).hexdigest()
            with self.ext:
                self.ext.execute(
                    "INSERT INTO keys_external VALUES(?,?,?,1)",
                    (transition["new_key"], transition["new_group"], fingerprint),
                )
        else:
            if external["group_id"] != transition["new_group"]:
                raise Refused("new key tag is bound to wrong group")
            fingerprint = external["fingerprint"]
            if external["present"] != 1:
                with self.ext:
                    self.ext.execute(
                        "UPDATE keys_external SET present=1 WHERE key_id=?",
                        (transition["new_key"],),
                    )
        self.checkpoint("new_key_created_external")
        with self.db:
            self.db.execute(
                "INSERT INTO key_authorizations VALUES(?,?,?,?,?,'staged',?)",
                (
                    transition["new_key"],
                    transition["new_group"],
                    fingerprint,
                    "capsule.plan.approve",
                    transition["to_epoch"],
                    transition_id,
                ),
            )
            self.db.execute(
                "UPDATE transitions SET status='key-authorized' WHERE transition_id=?",
                (transition_id,),
            )
            self.db.execute("UPDATE state SET phase='new-key-authorized' WHERE singleton=1")
            self._event("new-key-authorized")
        self.checkpoint("new_key_authorized")
        return fingerprint

    def install_target_components(self, transition_id: str = "rotation-1") -> None:
        transition = self.transition(transition_id)
        if transition["status"] not in ("key-authorized", "components-installed"):
            raise Refused("components require staged key authorization")
        targets = {
            "daemon": "daemon-release1",
            "broker": "broker-release2",
            "supervisor": "supervisor-release1",
        }
        for role in ROLES:
            with self.db:
                self._event(f"component-swap-intent:{role}")
            self.checkpoint(f"component_swap_intent:{role}")
            with self.ext:
                self.ext.execute(
                    """UPDATE components_external SET release_id='release2',code_identity=?,
                       process_instance=? WHERE role=?""",
                    (targets[role], f"{role}-process-2", role),
                )
            self.checkpoint(f"component_swapped_external:{role}")
        with self.db:
            self.db.execute(
                "UPDATE transitions SET status='components-installed' WHERE transition_id=?",
                (transition_id,),
            )
            self.db.execute(
                "UPDATE state SET phase='pending-verification' WHERE singleton=1"
            )
            self._event("target-components-verified")
        self.checkpoint("target_components_verified")

    def commit_epoch(self, transition_id: str = "rotation-1") -> None:
        transition = self.transition(transition_id)
        if transition["status"] != "components-installed":
            raise Refused("epoch commit requires verified target components")
        new_auth = self.db.execute(
            "SELECT * FROM key_authorizations WHERE key_id=?", (transition["new_key"],)
        ).fetchone()
        external = self.ext.execute(
            "SELECT * FROM keys_external WHERE key_id=? AND present=1",
            (transition["new_key"],),
        ).fetchone()
        if new_auth is None or external is None or new_auth["fingerprint"] != external["fingerprint"]:
            self._set_repair("new-key-verification-failed")
            raise Refused("new key does not match staged authorization")
        epoch_digest = digest(
            {
                "epoch": transition["to_epoch"],
                "transitionId": transition_id,
                "approvalKey": transition["new_key"],
                "fingerprint": new_auth["fingerprint"],
            }
        )
        with self.db:
            self.db.execute(
                "UPDATE key_authorizations SET status='replaced' WHERE key_id=?",
                (transition["old_key"],),
            )
            self.db.execute(
                "UPDATE key_authorizations SET status='active' WHERE key_id=?",
                (transition["new_key"],),
            )
            self.db.execute(
                """UPDATE state SET phase='epoch-committed',epoch=?,epoch_digest=?,
                   active_key=?,active_group=?,execution_enabled=0 WHERE singleton=1""",
                (
                    transition["to_epoch"],
                    epoch_digest,
                    transition["new_key"],
                    transition["new_group"],
                ),
            )
            self.db.execute(
                "UPDATE transitions SET epoch_committed=1,status='epoch-committed' WHERE transition_id=?",
                (transition_id,),
            )
            self._event("epoch-pointer-committed")
        self.checkpoint("epoch_pointer_committed")

    def retire_old_key(self, transition_id: str = "rotation-1") -> None:
        transition = self.transition(transition_id)
        if transition["epoch_committed"] != 1:
            raise Refused("old key is not retired before forward-only epoch commit")
        with self.db:
            self.db.execute("UPDATE state SET phase='retiring-old-key' WHERE singleton=1")
            self._event("old-key-retire-intent")
        self.checkpoint("old_key_retire_intent")
        with self.ext:
            self.ext.execute(
                "UPDATE keys_external SET present=0 WHERE key_id=?",
                (transition["old_key"],),
            )
        self.checkpoint("old_key_deleted_external")
        with self.db:
            self.db.execute(
                "UPDATE transitions SET old_key_retired=1,status='awaiting-acceptance' WHERE transition_id=?",
                (transition_id,),
            )
            self.db.execute(
                "UPDATE state SET phase='awaiting-component-acceptance' WHERE singleton=1"
            )
            self._event("old-key-retirement-observed")
        self.checkpoint("old_key_retirement_observed")

    def accept_component(self, role: str, transition_id: str = "rotation-1") -> None:
        if role not in ROLES:
            raise Refused("unknown role")
        transition = self.transition(transition_id)
        if transition["old_key_retired"] != 1:
            raise Refused("component acceptance waits for old-key retirement")
        state = self.state()
        component = self.ext.execute(
            "SELECT * FROM components_external WHERE role=?", (role,)
        ).fetchone()
        assert component is not None
        with self.db:
            self.db.execute(
                """INSERT INTO component_acceptances VALUES(?,?,?,?,?)
                   ON CONFLICT(transition_id,role) DO UPDATE SET
                   epoch_digest=excluded.epoch_digest,code_identity=excluded.code_identity,
                   process_instance=excluded.process_instance""",
                (
                    transition_id,
                    role,
                    state["epoch_digest"],
                    component["code_identity"],
                    component["process_instance"],
                ),
            )
            self._event(f"component-accepted:{role}")
        self.checkpoint(f"component_accepted:{role}")

    def enable(self, transition_id: str = "rotation-1") -> None:
        transition = self.transition(transition_id)
        if transition["old_key_retired"] != 1:
            raise Refused("old key retirement is incomplete")
        old_external = self.ext.execute(
            "SELECT * FROM keys_external WHERE key_id=?", (transition["old_key"],)
        ).fetchone()
        if old_external is None or old_external["present"] != 0:
            raise Refused("old key is still physically usable")
        state = self.state()
        for role in ROLES:
            acceptance = self.db.execute(
                "SELECT * FROM component_acceptances WHERE transition_id=? AND role=?",
                (transition_id, role),
            ).fetchone()
            current = self.ext.execute(
                "SELECT * FROM components_external WHERE role=?", (role,)
            ).fetchone()
            if (
                acceptance is None
                or current is None
                or acceptance["epoch_digest"] != state["epoch_digest"]
                or acceptance["code_identity"] != current["code_identity"]
                or acceptance["process_instance"] != current["process_instance"]
            ):
                raise Refused(f"missing or replayed acceptance: {role}")
        self.assert_active_key_available_while_fenced()
        with self.db:
            self.db.execute(
                "UPDATE state SET phase='stable',execution_enabled=1,transition_id=NULL WHERE singleton=1"
            )
            self.db.execute(
                "UPDATE transitions SET status='complete' WHERE transition_id=?",
                (transition_id,),
            )
            self._event("execution-enabled")
        self.checkpoint("execution_enabled")

    def assert_active_key_available_while_fenced(self) -> None:
        state = self.state()
        auth = self.db.execute(
            "SELECT * FROM key_authorizations WHERE key_id=?", (state["active_key"],)
        ).fetchone()
        external = self.ext.execute(
            "SELECT * FROM keys_external WHERE key_id=? AND present=1",
            (state["active_key"],),
        ).fetchone()
        if auth is None or auth["status"] != "active" or external is None:
            raise Refused("active key is unavailable")
        if auth["fingerprint"] != external["fingerprint"]:
            raise Refused("active key fingerprint changed")

    def run_full(self, transition_id: str = "rotation-1") -> None:
        self.begin(transition_id)
        self.prepare(transition_id)
        self.ensure_new_key(transition_id)
        self.install_target_components(transition_id)
        self.commit_epoch(transition_id)
        self.retire_old_key(transition_id)
        for role in ROLES:
            self.accept_component(role, transition_id)
        self.enable(transition_id)

    def recover(self) -> str:
        state = self.state()
        if state["phase"] == "stable" and state["execution_enabled"] == 1:
            self.assert_execution_ready()
            return "stable"
        self._set_repair("interrupted-key-transition")
        return "repair-required"

    def repair_finish_target(self, transition_id: str = "rotation-1") -> None:
        transition = self.transition(transition_id)
        state = self.state()
        if state["phase"] != "repair-required":
            raise Refused("finish-target requires repair-required")
        # Reconcile an external new-key create that may predate its local authorization.
        auth = self.db.execute(
            "SELECT * FROM key_authorizations WHERE key_id=?", (transition["new_key"],)
        ).fetchone()
        external = self.ext.execute(
            "SELECT * FROM keys_external WHERE key_id=? AND present=1",
            (transition["new_key"],),
        ).fetchone()
        if auth is None:
            if external is None:
                fingerprint = hashlib.sha256(secrets.token_bytes(32)).hexdigest()
                with self.ext:
                    self.ext.execute(
                        "INSERT OR REPLACE INTO keys_external VALUES(?,?,?,1)",
                        (transition["new_key"], transition["new_group"], fingerprint),
                    )
            else:
                fingerprint = external["fingerprint"]
            with self.db:
                self.db.execute(
                    "INSERT INTO key_authorizations VALUES(?,?,?,?,?,'staged',?)",
                    (
                        transition["new_key"],
                        transition["new_group"],
                        fingerprint,
                        "capsule.plan.approve",
                        transition["to_epoch"],
                        transition_id,
                    ),
                )
                self.db.execute(
                    "UPDATE transitions SET status='key-authorized' WHERE transition_id=?",
                    (transition_id,),
                )
        elif external is None or external["fingerprint"] != auth["fingerprint"]:
            raise Refused("cannot repair through replaced/missing authorized new key")
        transition = self.transition(transition_id)
        if transition["epoch_committed"] == 0:
            with self.db:
                self.db.execute(
                    "UPDATE transitions SET status='key-authorized' WHERE transition_id=?",
                    (transition_id,),
                )
            self.install_target_components(transition_id)
            self.commit_epoch(transition_id)
        if self.transition(transition_id)["old_key_retired"] == 0:
            self.retire_old_key(transition_id)
        for role in ROLES:
            self.accept_component(role, transition_id)
        self.enable(transition_id)

    def repair_restore_prior(self, transition_id: str = "rotation-1") -> None:
        transition = self.transition(transition_id)
        state = self.state()
        if state["phase"] != "repair-required":
            raise Refused("restore-prior requires repair-required")
        if transition["epoch_committed"] == 1 or state["epoch"] != transition["from_epoch"]:
            raise Refused("committed epoch requires forward repair")
        old_external = self.ext.execute(
            "SELECT * FROM keys_external WHERE key_id=? AND present=1",
            (transition["old_key"],),
        ).fetchone()
        old_auth = self.db.execute(
            "SELECT * FROM key_authorizations WHERE key_id=?", (transition["old_key"],)
        ).fetchone()
        if old_external is None or old_auth is None or old_external["fingerprint"] != old_auth["fingerprint"]:
            raise Refused("prior key is unavailable")
        with self.ext:
            self.ext.execute(
                "UPDATE keys_external SET present=0 WHERE key_id=?",
                (transition["new_key"],),
            )
            for role in ROLES:
                self.ext.execute(
                    """UPDATE components_external SET release_id='release1',code_identity=?,
                       process_instance=? WHERE role=?""",
                    (f"{role}-release1", f"{role}-repair-process", role),
                )
        with self.db:
            self.db.execute(
                "UPDATE key_authorizations SET status='abandoned' WHERE key_id=?",
                (transition["new_key"],),
            )
            self.db.execute(
                "UPDATE transitions SET status='restored-prior' WHERE transition_id=?",
                (transition_id,),
            )
            self.db.execute(
                """UPDATE state SET phase='stable',execution_enabled=1,transition_id=NULL,
                   active_key=?,active_group=? WHERE singleton=1""",
                (transition["old_key"], transition["old_group"]),
            )
            self._event("prior-epoch-restored")
        self.assert_execution_ready()

    def authorization_accepts(self, key_id: str, epoch: int) -> bool:
        state = self.state()
        row = self.db.execute(
            "SELECT * FROM key_authorizations WHERE key_id=?", (key_id,)
        ).fetchone()
        return bool(
            row is not None
            and row["status"] == "active"
            and row["epoch"] == epoch
            and state["epoch"] == epoch
            and state["active_key"] == key_id
        )
