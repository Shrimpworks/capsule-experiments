#!/bin/sh
set -eu

repository_root=$(git rev-parse --show-toplevel)
experiment_path=experiments/typed-guest-transport-c5b8-c5b7-root-binding-successor
baseline=e83614af34d5c39c12a4a3d6e6cda8dcf0304030

cd "$repository_root"
git diff --check "$baseline" -- "$experiment_path"
echo 'C5b8/C5b7 baseline-to-candidate whitespace verification: PASSED'
echo 'The exact copied historical libkrun header retains its source whitespace under an explicit path attribute.'
