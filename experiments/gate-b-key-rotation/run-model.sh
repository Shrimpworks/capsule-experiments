#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
python3 -m unittest discover -s "$experiment_dir" -p 'test_*.py' -v
