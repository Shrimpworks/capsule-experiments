#!/bin/sh
set -eu

root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root"

python3 -m unittest discover -s experiments/gate-f-durability -p 'test_*.py' -v
