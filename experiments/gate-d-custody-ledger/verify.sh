#!/bin/sh
set -eu

cd "$(dirname "$0")"

export PYTHONDONTWRITEBYTECODE=1
python3 -c 'from pathlib import Path; [compile(path.read_text(encoding="utf-8"), str(path), "exec") for path in Path(".").glob("*.py")]'
python3 -m unittest -v test_ledger.py

runs="${CAPSULE_GATE_D_REPETITIONS:-5}"
index=1
while [ "$index" -le "$runs" ]; do
  python3 -m unittest -q \
    test_ledger.CustodyLedgerTest.test_multi_process_input_and_output_redemption_races_have_one_winner \
    test_ledger.CustodyLedgerTest.test_sqlite_crash_before_and_after_commit_has_fail_closed_recovery \
    test_ledger.CustodyLedgerTest.test_output_crashes_and_restart_reconciliation_quarantine
  index=$((index + 1))
done

echo "Gate D custody-ledger verification passed (${runs} repeated race/crash runs)."
