#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCandidate } from './verify-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
console.log(JSON.stringify(verifyCandidate(root), null, 2));
