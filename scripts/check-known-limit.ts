import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Keep the ordinary suite green while verifying the required counterexample
// actually runs and fails for the documented assertion, not an import error.
const path = fileURLToPath(new URL('../examples/known-limit.test.ts', import.meta.url));
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', path], { encoding: 'utf8' });
const output = result.stdout + result.stderr;
if (result.error || result.status !== 1 ||
    !output.includes('KNOWN_LIMIT_BHD_OVERDRAFT_POLICY') || !output.includes('ERR_ASSERTION') ||
    !/# tests 1\b/.test(output) || !/# fail 1\b/.test(output) || !/# pass 0\b/.test(output)) {
  process.stderr.write(output);
  process.stderr.write('Known-limit test did not fail exactly as documented. Review the test and policy.\n');
  process.exitCode = 1;
} else {
  process.stdout.write('Verified: the annotated BHD overdraft counterexample fails for the documented assertion (1 test, 1 expected failure).\n');
}
