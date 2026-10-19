#!/usr/bin/env node
import * as nodeModule from 'node:module';

// Agents call gitwiz dozens of times per task, so start-up time adds up. Node's
// compile cache keeps the bytecode of the bundle below between runs; it has to
// be switched on before that bundle loads, hence this tiny separate entry.
// Node 20 has no compile cache — the optional call makes it a no-op there.
nodeModule.enableCompileCache?.();

await import('./main.js');
