#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
"$root/scripts/build-bundles.sh"
fnm exec --using=22.22.1 -- node "$root/scripts/generate-manifest.mjs"
fnm exec --using=22.22.1 -- node "$root/scripts/verify.mjs"
fnm exec --using=22.22.1 -- node "$root/scripts/verify-mutations.mjs"
