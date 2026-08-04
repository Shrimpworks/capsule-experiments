"""Development-only Gate F trust-transition model.

This is an executable specification, not product code.  It deliberately uses a
second SQLite database for externally observable state so tests can distinguish
Supervisor durability from component swaps, guest creation, and result release.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


ROLES = ("daemon", "broker", "supervisor", "updater")


class InjectedCrash(RuntimeError):
    pass


class Refused(RuntimeError):
    pass


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode()).hexdigest()


@dataclass(frozen=True)
class Target:
    components: dict[str, str]
    entitlements: dict[str, str]
    policy: str
    profile: str
    trust_snapshot: str
    storage_format: int = 1
    migration_reversible: bool = True

    def as_dict(self) -> dict[str, Any]:
        return {
            "components": self.components,
            "entitlements": self.entitlements,
            "policy": self.policy,
            "profile": self.profile,
            "trust_snapshot": self.trust_snapshot,
            "storage_format": self.storage_format,
            "migration_reversible": self.migration_reversible,
        }


class GateFModel:
    """Small two-store durability model with named crash checkpoints."""

    def __init__(self, directory: Path, fault_at: str | None = None):
        directory.mkdir(parents=True, exist_ok=True)
        self.control_path = directory / "control.sqlite"
        self.external_path = directory / "external.sqlite"
        self.db = sqlite3.connect(self.control_path)
        self.ext = sqlite3.connect(self.external_path)
        self.db.row_factory = sqlite3.Row
        self.ext.row_factory = sqlite3.Row
        self.fault_at = fault_at
        self._configure(self.db)
        self._configure(self.ext)
        self._schema()

    @staticmethod
    def _configure(conn: sqlite3.Connection) -> None:
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=FULL")

    def close(self) -> None:
        self.db.close()
        self.ext.close()

    def checkpoint(self, name: str) -> None:
        if self.fault_at == name:
            self.close()
            raise InjectedCrash(name)

    def _schema(self) -> None:
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS installation(
              singleton INTEGER PRIMARY KEY CHECK(singleton=1),
              installation_id TEXT NOT NULL,
              phase TEXT NOT NULL,
              current_epoch INTEGER NOT NULL,
              current_epoch_digest TEXT NOT NULL,
              policy TEXT NOT NULL,
              profile TEXT NOT NULL,
              trust_snapshot TEXT NOT NULL,
              storage_format INTEGER NOT NULL,
              attempts_enabled INTEGER NOT NULL,
              transition_id TEXT
            );
            CREATE TABLE IF NOT EXISTS epochs(
              epoch INTEGER PRIMARY KEY,
              epoch_digest TEXT UNIQUE NOT NULL,
              prior_digest TEXT,
              manifest TEXT NOT NULL,
              status TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS transitions(
              transition_id TEXT PRIMARY KEY,
              from_epoch INTEGER NOT NULL,
              target_epoch INTEGER NOT NULL,
              prior_target TEXT NOT NULL,
              target TEXT NOT NULL,
              prepared_digest TEXT,
              status TEXT NOT NULL,
              ledger_digest TEXT,
              effect_highwater INTEGER NOT NULL,
              migration_reversible INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS swap_intents(
              transition_id TEXT NOT NULL,
              role TEXT NOT NULL,
              status TEXT NOT NULL,
              PRIMARY KEY(transition_id, role)
            );
            CREATE TABLE IF NOT EXISTS component_acks(
              transition_id TEXT NOT NULL,
              role TEXT NOT NULL,
              identity TEXT NOT NULL,
              epoch_digest TEXT NOT NULL,
              process_instance TEXT NOT NULL,
              PRIMARY KEY(transition_id, role)
            );
            CREATE TABLE IF NOT EXISTS grants(
              grant_id TEXT PRIMARY KEY,
              epoch INTEGER NOT NULL,
              nonce TEXT UNIQUE NOT NULL,
              status TEXT NOT NULL,
              attempt_id TEXT
            );
            CREATE TABLE IF NOT EXISTS attempts(
              attempt_id TEXT PRIMARY KEY,
              grant_id TEXT UNIQUE NOT NULL,
              epoch INTEGER NOT NULL,
              status TEXT NOT NULL,
              backend_intent INTEGER NOT NULL DEFAULT 0,
              backend_handle TEXT,
              cleanup_state TEXT NOT NULL DEFAULT 'none',
              result_state TEXT NOT NULL DEFAULT 'none'
            );
            CREATE TABLE IF NOT EXISTS events(
              seq INTEGER PRIMARY KEY AUTOINCREMENT,
              kind TEXT NOT NULL,
              ref TEXT NOT NULL,
              detail TEXT NOT NULL
            );
            """
        )
        self.ext.executescript(
            """
            CREATE TABLE IF NOT EXISTS components(
              role TEXT PRIMARY KEY,
              identity TEXT NOT NULL,
              entitlement TEXT NOT NULL,
              accepted_epoch_digest TEXT,
              process_instance TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS trust_state(
              singleton INTEGER PRIMARY KEY CHECK(singleton=1),
              policy TEXT NOT NULL,
              profile TEXT NOT NULL,
              trust_snapshot TEXT NOT NULL,
              storage_format INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS guests(
              attempt_id TEXT PRIMARY KEY,
              handle TEXT UNIQUE NOT NULL,
              state TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS effects(
              effect_id INTEGER PRIMARY KEY AUTOINCREMENT,
              attempt_id TEXT NOT NULL,
              idempotency_key TEXT UNIQUE NOT NULL,
              kind TEXT NOT NULL,
              status TEXT NOT NULL
            );
            """
        )
        self.db.commit()
        self.ext.commit()

    def initialize(self) -> None:
        if self.db.execute("SELECT 1 FROM installation").fetchone():
            return
        components = {role: f"{role}-v1" for role in ROLES}
        entitlements = {role: f"{role}-ent-v1" for role in ROLES}
        manifest = {
            "epoch": 1,
            "components": components,
            "entitlements": entitlements,
            "policy": "policy-v1",
            "profile": "profile-v1",
            "trust_snapshot": "trust-v1",
            "storage_format": 1,
            "prior": None,
        }
        epoch_digest = digest(manifest)
        with self.db:
            self.db.execute(
                """INSERT INTO installation(
                     singleton,installation_id,phase,current_epoch,current_epoch_digest,
                     policy,profile,trust_snapshot,storage_format,attempts_enabled,transition_id
                   ) VALUES(1,?,?,?,?,?,?,?,?,?,NULL)""",
                (
                    "installation-A",
                    "stable",
                    1,
                    epoch_digest,
                    "policy-v1",
                    "profile-v1",
                    "trust-v1",
                    1,
                    1,
                ),
            )
            self.db.execute(
                "INSERT INTO epochs VALUES(?,?,?,?,?)",
                (1, epoch_digest, None, canonical(manifest), "active"),
            )
            self._event("installation_initialized", "installation-A", epoch_digest)
        with self.ext:
            for role in ROLES:
                self.ext.execute(
                    "INSERT INTO components VALUES(?,?,?,?,?)",
                    (role, components[role], entitlements[role], epoch_digest, f"{role}-proc-v1"),
                )
            self.ext.execute(
                "INSERT INTO trust_state VALUES(1,?,?,?,?)",
                ("policy-v1", "profile-v1", "trust-v1", 1),
            )

    def _event(self, kind: str, ref: str, detail: Any) -> None:
        self.db.execute(
            "INSERT INTO events(kind,ref,detail) VALUES(?,?,?)",
            (kind, ref, detail if isinstance(detail, str) else canonical(detail)),
        )

    def state(self) -> sqlite3.Row:
        row = self.db.execute("SELECT * FROM installation WHERE singleton=1").fetchone()
        if row is None:
            raise Refused("missing installation manifest/checkpoint")
        return row

    def target_v2(self, **overrides: Any) -> Target:
        values: dict[str, Any] = {
            "components": {role: f"{role}-v2" for role in ROLES},
            "entitlements": {role: f"{role}-ent-v2" for role in ROLES},
            "policy": "policy-v2",
            "profile": "profile-v2",
            "trust_snapshot": "trust-v2",
            "storage_format": 2,
            "migration_reversible": True,
        }
        values.update(overrides)
        return Target(**values)

    def _active_target(self) -> Target:
        state = self.state()
        epoch = self.db.execute(
            "SELECT manifest FROM epochs WHERE epoch=?", (state["current_epoch"],)
        ).fetchone()
        if epoch is None:
            raise Refused("missing active epoch manifest")
        data = json.loads(epoch["manifest"])
        return Target(
            components=data["components"],
            entitlements=data["entitlements"],
            policy=data["policy"],
            profile=data["profile"],
            trust_snapshot=data["trust_snapshot"],
            storage_format=data["storage_format"],
        )

    def _ledger_digest(self) -> str:
        grants = [dict(row) for row in self.db.execute("SELECT * FROM grants ORDER BY grant_id")]
        attempts = [dict(row) for row in self.db.execute("SELECT * FROM attempts ORDER BY attempt_id")]
        return digest({"grants": grants, "attempts": attempts})

    def issue_grant(self, grant_id: str) -> None:
        state = self.state()
        if state["phase"] != "stable" or not state["attempts_enabled"]:
            raise Refused("attempts are fenced")
        with self.db:
            self.db.execute(
                "INSERT INTO grants VALUES(?,?,?,?,NULL)",
                (grant_id, state["current_epoch"], f"nonce-{grant_id}", "issued"),
            )
            self._event("grant_issued", grant_id, state["current_epoch"])
        self.checkpoint("grant_issued")

    def consume_grant(self, grant_id: str, attempt_id: str) -> None:
        state = self.state()
        if state["phase"] != "stable" or not state["attempts_enabled"]:
            raise Refused("attempts are fenced")
        with self.db:
            grant = self.db.execute("SELECT * FROM grants WHERE grant_id=?", (grant_id,)).fetchone()
            if grant is None or grant["status"] != "issued" or grant["epoch"] != state["current_epoch"]:
                raise Refused("grant is not active and unused in the current epoch")
            self.db.execute(
                "INSERT INTO attempts(attempt_id,grant_id,epoch,status) VALUES(?,?,?,?)",
                (attempt_id, grant_id, state["current_epoch"], "created"),
            )
            self.db.execute(
                "UPDATE grants SET status='consumed',attempt_id=? WHERE grant_id=?",
                (attempt_id, grant_id),
            )
            self._event("grant_consumed_attempt_created", attempt_id, grant_id)
        self.checkpoint("grant_consumed")

    def launch_backend(self, attempt_id: str) -> None:
        with self.db:
            attempt = self.db.execute("SELECT * FROM attempts WHERE attempt_id=?", (attempt_id,)).fetchone()
            if attempt is None or attempt["status"] != "created":
                raise Refused("attempt is not launchable")
            self.db.execute(
                "UPDATE attempts SET backend_intent=1,status='creating',cleanup_state='required' WHERE attempt_id=?",
                (attempt_id,),
            )
            self._event("backend_create_intent", attempt_id, "durable")
        self.checkpoint("backend_intent_committed")
        handle = f"guest-{attempt_id}"
        with self.ext:
            self.ext.execute(
                "INSERT OR IGNORE INTO guests VALUES(?,?,?)", (attempt_id, handle, "running")
            )
        self.checkpoint("backend_created_external")
        with self.db:
            self.db.execute(
                "UPDATE attempts SET backend_handle=?,status='running' WHERE attempt_id=?",
                (handle, attempt_id),
            )
            self._event("backend_handle_persisted", attempt_id, handle)
        self.checkpoint("backend_handle_persisted")

    def complete_attempt(self, attempt_id: str) -> None:
        with self.ext:
            self.ext.execute("UPDATE guests SET state='destroyed' WHERE attempt_id=?", (attempt_id,))
        with self.db:
            self.db.execute(
                "UPDATE attempts SET status='terminal',cleanup_state='destroyed' WHERE attempt_id=?",
                (attempt_id,),
            )
            self._event("attempt_terminal", attempt_id, "backend_destroyed")

    def release_result(self, attempt_id: str) -> None:
        attempt = self.db.execute("SELECT * FROM attempts WHERE attempt_id=?", (attempt_id,)).fetchone()
        if attempt is None or attempt["status"] != "terminal" or attempt["cleanup_state"] != "destroyed":
            raise Refused("result release requires a terminal destroyed attempt")
        with self.db:
            self.db.execute("UPDATE attempts SET result_state='release-intent' WHERE attempt_id=?", (attempt_id,))
            self._event("result_release_intent", attempt_id, "durable")
        self.checkpoint("result_release_intent")
        with self.ext:
            self.ext.execute(
                "INSERT OR IGNORE INTO effects(attempt_id,idempotency_key,kind,status) VALUES(?,?,?,?)",
                (attempt_id, f"release-{attempt_id}", "user-content-release", "completed"),
            )
        self.checkpoint("result_released_external")
        with self.db:
            self.db.execute("UPDATE attempts SET result_state='released' WHERE attempt_id=?", (attempt_id,))
            self._event("result_release_finalized", attempt_id, "completed")
        self.checkpoint("result_release_finalized")

    def begin_update(self, transition_id: str, target: Target) -> None:
        state = self.state()
        if state["phase"] != "stable" or not state["attempts_enabled"]:
            raise Refused("installation is not stable")
        active = self.db.execute(
            """SELECT 1 FROM attempts
               WHERE status!='terminal'
                  OR cleanup_state NOT IN ('none','destroyed')
                  OR result_state='release-intent'
               LIMIT 1"""
        ).fetchone()
        if active:
            raise Refused("attempt cleanup and result-release intents must be reconciled before update")
        prior = self._active_target()
        effect_highwater = self.ext.execute("SELECT COALESCE(MAX(effect_id),0) AS n FROM effects").fetchone()["n"]
        with self.db:
            self.db.execute(
                "UPDATE installation SET phase='preparing-update',attempts_enabled=0,transition_id=? WHERE singleton=1",
                (transition_id,),
            )
            self.db.execute("UPDATE grants SET status='invalidated-transition' WHERE status='issued'")
            self.db.execute(
                "INSERT INTO transitions VALUES(?,?,?,?,?,NULL,?,?,?,?)",
                (
                    transition_id,
                    state["current_epoch"],
                    state["current_epoch"] + 1,
                    canonical(prior.as_dict()),
                    canonical(target.as_dict()),
                    "preparing-update",
                    self._ledger_digest(),
                    effect_highwater,
                    int(target.migration_reversible),
                ),
            )
            self._event("transition_fenced", transition_id, {"effect_highwater": effect_highwater})
        self.checkpoint("transition_fenced")

    def prepare_update(self, transition_id: str) -> str:
        transition = self._transition(transition_id)
        if transition["status"] != "preparing-update":
            raise Refused("transition cannot be prepared twice")
        body = self._prepared_body(transition)
        prepared_digest = digest(body)
        with self.db:
            self.db.execute(
                "UPDATE transitions SET prepared_digest=?,status='prepared' WHERE transition_id=?",
                (prepared_digest, transition_id),
            )
            self._event("prepared_update_persisted", transition_id, prepared_digest)
        self.checkpoint("prepared_update_persisted")
        return prepared_digest

    def _prepared_body(self, transition: sqlite3.Row) -> dict[str, Any]:
        return {
            "type": "PreparedUpdate",
            "installation": self.state()["installation_id"],
            "transition": transition["transition_id"],
            "from_epoch": transition["from_epoch"],
            "target_epoch": transition["target_epoch"],
            "prior_target": json.loads(transition["prior_target"]),
            "target": json.loads(transition["target"]),
            "ledger_digest": transition["ledger_digest"],
            "effect_highwater": transition["effect_highwater"],
            "recovery": ["finish-target", "restore-prior-if-uncommitted-and-reversible", "reinstall"],
        }

    def _verify_prepared(self, transition_id: str) -> sqlite3.Row:
        transition = self._transition(transition_id)
        if transition["prepared_digest"] is None:
            raise Refused("missing PreparedUpdate authorization")
        if digest(self._prepared_body(transition)) != transition["prepared_digest"]:
            self._repair("PreparedUpdate digest mismatch")
            raise Refused("PreparedUpdate digest mismatch")
        if self._ledger_digest() != transition["ledger_digest"]:
            self._repair("grant/attempt ledger changed after transition fence")
            raise Refused("grant/attempt ledger changed after transition fence")
        return transition

    def _transition(self, transition_id: str | None = None) -> sqlite3.Row:
        if transition_id is None:
            transition_id = self.state()["transition_id"]
        row = self.db.execute("SELECT * FROM transitions WHERE transition_id=?", (transition_id,)).fetchone()
        if row is None:
            raise Refused("missing prepared transition")
        return row

    def _target(self, transition_id: str | None = None) -> Target:
        data = json.loads(self._transition(transition_id)["target"])
        return Target(**data)

    def install_target_trust_state(self, transition_id: str) -> None:
        self._verify_prepared(transition_id)
        target = self._target(transition_id)
        with self.ext:
            self.ext.execute(
                "UPDATE trust_state SET policy=?,profile=?,trust_snapshot=?,storage_format=? WHERE singleton=1",
                (target.policy, target.profile, target.trust_snapshot, target.storage_format),
            )
        self.checkpoint("target_trust_state_installed")

    def swap_component(self, transition_id: str, role: str) -> None:
        if role not in ROLES:
            raise Refused("unknown component role")
        transition = self._verify_prepared(transition_id)
        if transition["status"] not in ("prepared", "swapping"):
            raise Refused("component swap requires a prepared update")
        target = self._target(transition_id)
        with self.db:
            self.db.execute(
                "INSERT INTO swap_intents VALUES(?,?,?) ON CONFLICT(transition_id,role) DO UPDATE SET status='intent'",
                (transition_id, role, "intent"),
            )
            self.db.execute("UPDATE transitions SET status='swapping' WHERE transition_id=?", (transition_id,))
            self._event("component_swap_intent", transition_id, role)
        self.checkpoint(f"swap_intent_committed:{role}")
        with self.ext:
            self.ext.execute(
                "UPDATE components SET identity=?,entitlement=?,accepted_epoch_digest=NULL,process_instance=? WHERE role=?",
                (target.components[role], target.entitlements[role], f"{role}-proc-v2", role),
            )
        self.checkpoint(f"component_swapped_external:{role}")
        with self.db:
            self.db.execute(
                "UPDATE swap_intents SET status='observed' WHERE transition_id=? AND role=?",
                (transition_id, role),
            )
            self._event("component_swap_observed", transition_id, role)
        self.checkpoint(f"swap_observation_committed:{role}")

    def enter_pending_verification(self, transition_id: str) -> None:
        transition = self._verify_prepared(transition_id)
        if transition["status"] not in ("prepared", "swapping"):
            raise Refused("transition is not installable")
        with self.db:
            self.db.execute(
                "UPDATE installation SET phase='pending-verification',attempts_enabled=0 WHERE singleton=1"
            )
            self.db.execute(
                "UPDATE transitions SET status='pending-verification' WHERE transition_id=?", (transition_id,)
            )
            self._event("pending_verification_entered", transition_id, "execution-disabled")
        self.checkpoint("pending_verification_committed")
        self._verify_target(transition_id)

    def _verify_target(self, transition_id: str) -> None:
        self._verify_prepared(transition_id)
        target = self._target(transition_id)
        observed = {row["role"]: row for row in self.ext.execute("SELECT * FROM components")}
        for role in ROLES:
            if role not in observed:
                self._repair("missing component")
                raise Refused("missing component")
            if observed[role]["identity"] != target.components[role]:
                self._repair("mixed component identity")
                raise Refused("mixed component identity")
            if observed[role]["entitlement"] != target.entitlements[role]:
                self._repair("changed entitlement")
                raise Refused("changed entitlement")
        trust = self.ext.execute("SELECT * FROM trust_state WHERE singleton=1").fetchone()
        if trust is None or any(
            (
                trust["policy"] != target.policy,
                trust["profile"] != target.profile,
                trust["trust_snapshot"] != target.trust_snapshot,
                trust["storage_format"] != target.storage_format,
            )
        ):
            self._repair("policy/profile/trust/storage mismatch")
            raise Refused("policy/profile/trust/storage mismatch")
        with self.db:
            self._event("pending_verification_passed", transition_id, digest(target.as_dict()))

    def stage_epoch(self, transition_id: str) -> str:
        transition = self._transition(transition_id)
        if transition["status"] != "pending-verification":
            raise Refused("epoch staging requires pending verification")
        self._verify_target(transition_id)
        target = self._target(transition_id)
        state = self.state()
        manifest = {
            "epoch": transition["target_epoch"],
            **target.as_dict(),
            "prior": state["current_epoch_digest"],
            "prepared_update": transition["prepared_digest"],
        }
        epoch_digest = digest(manifest)
        with self.db:
            self.db.execute(
                "INSERT INTO epochs VALUES(?,?,?,?,?)",
                (transition["target_epoch"], epoch_digest, state["current_epoch_digest"], canonical(manifest), "staged"),
            )
            self.db.execute(
                "UPDATE installation SET phase='finalizing-epoch' WHERE singleton=1"
            )
            self.db.execute(
                "UPDATE transitions SET status='finalizing-epoch' WHERE transition_id=?", (transition_id,)
            )
            self._event("epoch_record_staged", transition_id, epoch_digest)
        self.checkpoint("epoch_record_staged")
        return epoch_digest

    def commit_epoch(self, transition_id: str) -> None:
        transition = self._transition(transition_id)
        if transition["status"] != "finalizing-epoch":
            raise Refused("epoch cannot be committed from this state")
        epoch = self.db.execute("SELECT * FROM epochs WHERE epoch=?", (transition["target_epoch"],)).fetchone()
        if epoch is None or epoch["status"] != "staged":
            raise Refused("missing staged epoch")
        target = self._target(transition_id)
        with self.db:
            self.db.execute("UPDATE epochs SET status='superseded' WHERE status='active'")
            self.db.execute("UPDATE epochs SET status='active' WHERE epoch=?", (transition["target_epoch"],))
            self.db.execute(
                "UPDATE installation SET phase='awaiting-component-acceptance',current_epoch=?,current_epoch_digest=?,policy=?,profile=?,trust_snapshot=?,storage_format=?,attempts_enabled=0 WHERE singleton=1",
                (
                    transition["target_epoch"],
                    epoch["epoch_digest"],
                    target.policy,
                    target.profile,
                    target.trust_snapshot,
                    target.storage_format,
                ),
            )
            self.db.execute(
                "UPDATE transitions SET status='awaiting-component-acceptance' WHERE transition_id=?",
                (transition_id,),
            )
            self._event("epoch_pointer_committed", transition_id, epoch["epoch_digest"])
        self.checkpoint("epoch_pointer_committed")

    def accept_epoch(self, transition_id: str, role: str) -> None:
        state = self.state()
        transition = self._transition(transition_id)
        if transition["status"] != "awaiting-component-acceptance":
            raise Refused("component acceptance is not active")
        target = self._target(transition_id)
        component = self.ext.execute("SELECT * FROM components WHERE role=?", (role,)).fetchone()
        if component is None or component["identity"] != target.components[role]:
            raise Refused("component identity cannot accept epoch")
        with self.ext:
            self.ext.execute(
                "UPDATE components SET accepted_epoch_digest=? WHERE role=?",
                (state["current_epoch_digest"], role),
            )
        with self.db:
            self.db.execute(
                "INSERT OR REPLACE INTO component_acks VALUES(?,?,?,?,?)",
                (
                    transition_id,
                    role,
                    component["identity"],
                    state["current_epoch_digest"],
                    component["process_instance"],
                ),
            )
            self._event("component_acceptance_persisted", transition_id, role)
        self.checkpoint(f"component_acceptance_persisted:{role}")

    def enable_stable(self, transition_id: str) -> None:
        transition = self._transition(transition_id)
        if transition["status"] != "awaiting-component-acceptance":
            raise Refused("transition is not awaiting acceptance")
        state = self.state()
        acks = {row["role"]: row for row in self.db.execute(
            "SELECT * FROM component_acks WHERE transition_id=?", (transition_id,)
        )}
        components = {row["role"]: row for row in self.ext.execute("SELECT * FROM components")}
        for role in ROLES:
            if role not in acks or role not in components:
                raise Refused("not all required components accepted the epoch")
            if (
                acks[role]["epoch_digest"] != state["current_epoch_digest"]
                or acks[role]["identity"] != components[role]["identity"]
                or acks[role]["process_instance"] != components[role]["process_instance"]
                or components[role]["accepted_epoch_digest"] != state["current_epoch_digest"]
            ):
                raise Refused("stale or replayed component acceptance")
        with self.db:
            self.db.execute(
                "UPDATE transitions SET status='finalized' WHERE transition_id=?", (transition_id,)
            )
            self.db.execute(
                "UPDATE installation SET phase='stable',attempts_enabled=1,transition_id=NULL WHERE singleton=1"
            )
            self._event("attempts_reenabled", transition_id, state["current_epoch_digest"])
        self.checkpoint("attempts_reenabled")

    def _repair(self, reason: str) -> None:
        with self.db:
            self.db.execute(
                "UPDATE installation SET phase='repair-required',attempts_enabled=0 WHERE singleton=1"
            )
            self._event("repair_required", self.state()["installation_id"], reason)

    def recover(self) -> str:
        try:
            state = self.state()
            active_epoch = self.db.execute(
                "SELECT * FROM epochs WHERE epoch=? AND epoch_digest=?",
                (state["current_epoch"], state["current_epoch_digest"]),
            ).fetchone()
            if active_epoch is None:
                self._repair("missing or mismatched active manifest")
                return "repair-required"
            target = self._active_target()
        except Refused:
            # A missing singleton cannot be repaired by this store; callers must reinstall.
            return "repair-required"

        # Reconcile independently enumerable backend creation and completed releases.
        for attempt in self.db.execute("SELECT * FROM attempts").fetchall():
            guest = self.ext.execute("SELECT * FROM guests WHERE attempt_id=?", (attempt["attempt_id"],)).fetchone()
            if attempt["backend_intent"] and attempt["backend_handle"] is None and guest is not None:
                with self.db:
                    self.db.execute(
                        "UPDATE attempts SET backend_handle=?,status='unresolved',cleanup_state='required' WHERE attempt_id=?",
                        (guest["handle"], attempt["attempt_id"]),
                    )
                    self._event("orphan_reconciled", attempt["attempt_id"], guest["handle"])
            elif attempt["backend_intent"] and attempt["backend_handle"] is None:
                with self.db:
                    self.db.execute(
                        "UPDATE attempts SET status='unresolved',cleanup_state='required' WHERE attempt_id=?",
                        (attempt["attempt_id"],),
                    )
                    self._event("backend_absence_indeterminate", attempt["attempt_id"], "enumeration-empty")
            effect = self.ext.execute(
                "SELECT * FROM effects WHERE idempotency_key=?",
                (f"release-{attempt['attempt_id']}",),
            ).fetchone()
            if effect is not None and attempt["result_state"] != "released":
                with self.db:
                    self.db.execute(
                        "UPDATE attempts SET result_state='released' WHERE attempt_id=?",
                        (attempt["attempt_id"],),
                    )
                    self._event("external_release_observed", attempt["attempt_id"], effect["effect_id"])

        if state["phase"] != "stable":
            self._repair("interrupted trust transition")
            return "repair-required"

        observed = {row["role"]: row for row in self.ext.execute("SELECT * FROM components")}
        trust = self.ext.execute("SELECT * FROM trust_state WHERE singleton=1").fetchone()
        mismatch = trust is None or any(
            (
                trust["policy"] != target.policy,
                trust["profile"] != target.profile,
                trust["trust_snapshot"] != target.trust_snapshot,
                trust["storage_format"] != target.storage_format,
            )
        )
        for role in ROLES:
            mismatch = mismatch or role not in observed
            if role in observed:
                mismatch = mismatch or any(
                    (
                        observed[role]["identity"] != target.components[role],
                        observed[role]["entitlement"] != target.entitlements[role],
                        observed[role]["accepted_epoch_digest"] != state["current_epoch_digest"],
                    )
                )
        if mismatch:
            self._repair("stable-world component/trust/epoch mismatch")
            return "repair-required"
        return "stable"

    def repair_resume_target(self, transition_id: str) -> None:
        transition = self._transition(transition_id)
        if self.state()["phase"] != "repair-required" or transition["prepared_digest"] is None:
            raise Refused("authorized repair requires a persisted PreparedUpdate")
        unresolved = self.db.execute(
            "SELECT 1 FROM attempts WHERE status!='terminal' OR cleanup_state NOT IN ('none','destroyed') LIMIT 1"
        ).fetchone()
        if unresolved:
            raise Refused("attempt cleanup/reconciliation blocks epoch repair")
        with self.db:
            self.db.execute(
                "UPDATE installation SET phase='pending-verification',attempts_enabled=0 WHERE singleton=1"
            )
            self.db.execute(
                "UPDATE transitions SET status='pending-verification' WHERE transition_id=?", (transition_id,)
            )
            self._event("authorized_repair_resume", transition_id, "finish-target")
        self._verify_target(transition_id)

    def repair_restore_prior(self, transition_id: str) -> None:
        transition = self._transition(transition_id)
        state = self.state()
        if state["phase"] != "repair-required":
            raise Refused("repair ceremony is not active")
        if state["current_epoch"] != transition["from_epoch"]:
            raise Refused("a committed epoch cannot be rewound; authorize a new epoch")
        if not transition["migration_reversible"]:
            raise Refused("declared irreversible migration forbids prior restoration")
        highwater = self.ext.execute("SELECT COALESCE(MAX(effect_id),0) AS n FROM effects").fetchone()["n"]
        if highwater != transition["effect_highwater"]:
            raise Refused("completed external effects cannot be rolled back")
        prior = Target(**json.loads(transition["prior_target"]))
        with self.ext:
            for role in ROLES:
                self.ext.execute(
                    "UPDATE components SET identity=?,entitlement=?,accepted_epoch_digest=?,process_instance=? WHERE role=?",
                    (
                        prior.components[role],
                        prior.entitlements[role],
                        state["current_epoch_digest"],
                        f"{role}-repair-proc",
                        role,
                    ),
                )
            self.ext.execute(
                "UPDATE trust_state SET policy=?,profile=?,trust_snapshot=?,storage_format=? WHERE singleton=1",
                (prior.policy, prior.profile, prior.trust_snapshot, prior.storage_format),
            )
        with self.db:
            self.db.execute("UPDATE transitions SET status='rolled-back-before-commit' WHERE transition_id=?", (transition_id,))
            self.db.execute(
                "UPDATE installation SET phase='stable',attempts_enabled=1,transition_id=NULL WHERE singleton=1"
            )
            self._event("authorized_prior_restore", transition_id, "history-and-grant-fence-preserved")

    def assert_execution_ready(self) -> None:
        state = self.state()
        if state["phase"] != "stable" or not state["attempts_enabled"]:
            raise Refused("execution disabled")
        if self.recover() != "stable":
            raise Refused("integrity verification failed")

    def rows(self, query: str, params: Iterable[Any] = ()) -> list[dict[str, Any]]:
        return [dict(row) for row in self.db.execute(query, tuple(params))]
