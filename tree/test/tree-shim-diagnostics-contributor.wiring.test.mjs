// Tree shim content-read guard (#56). Suite core admits only contained regular files; the shim read
// checks again immediately before reading. These cases hand the contributor paths that would no longer
// qualify (as if an entry were retargeted or replaced after collection): it must not read outside the
// target, crash, or block, and it falls back to path-only evidence for them.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { attachTreeShimDiagnosticsContributor } from '../src/contributors/tree-shim-diagnostics-contributor.wiring.mjs';

const THIN_REEXPORT = "export * from './core/target.mjs';\n";

test('shim content reads skip paths that are escaping, unresolvable or non-regular, without crashing or blocking', () => {
  const fixtureParent = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-shim-read-guard-'));
  try {
    const repositoryRoot = path.join(fixtureParent, 'repo');
    const outsideRoot = path.join(fixtureParent, 'outside');
    fs.mkdirSync(path.join(repositoryRoot, 'src'), { recursive: true });
    fs.mkdirSync(outsideRoot, { recursive: true });
    fs.writeFileSync(path.join(outsideRoot, 'secret.host.mjs'), "export * from './core/outside-only.mjs';\n");
    fs.writeFileSync(path.join(repositoryRoot, 'src', 'inside.host.mjs'), THIN_REEXPORT);
    fs.symlinkSync(path.join(outsideRoot, 'secret.host.mjs'), path.join(repositoryRoot, 'src', 'escaping.host.mjs'));
    fs.symlinkSync('missing.host.mjs', path.join(repositoryRoot, 'src', 'dangling.host.mjs'));
    const selectedPaths = ['src/dangling.host.mjs', 'src/escaping.host.mjs', 'src/inside.host.mjs'];
    try {
      execFileSync('mkfifo', [path.join(repositoryRoot, 'src', 'pipe.host.mjs')]);
      selectedPaths.push('src/pipe.host.mjs');
    } catch {
      // Without mkfifo the FIFO case is not exercised; the other cases still are.
    }

    const findings = attachTreeShimDiagnosticsContributor({ repositoryRoot, selectedPaths })();

    // Only the contained regular file has content evidence; nothing from outside the target is read.
    const thinReexportPaths = findings.filter((finding) => finding.details?.matchedShimSignals?.thinReexportShim).map((finding) => finding.path);
    assert.deepEqual([...new Set(thinReexportPaths)], ['src/inside.host.mjs']);
    assert.equal(JSON.stringify(findings).includes('outside-only'), false);
  } finally {
    fs.rmSync(fixtureParent, { recursive: true, force: true });
  }
});

test('a shim content read that fails after the guard passes yields no content instead of crashing', (t) => {
  if (process.getuid?.() === 0) {
    t.skip('Running as root: an unreadable file cannot be produced, so the read error is not exercised.');
    return;
  }

  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-shim-read-error-'));
  const unreadable = path.join(repositoryRoot, 'src', 'unreadable.host.mjs');
  try {
    fs.mkdirSync(path.dirname(unreadable), { recursive: true });
    fs.writeFileSync(unreadable, THIN_REEXPORT);
    fs.chmodSync(unreadable, 0o000);

    const findings = attachTreeShimDiagnosticsContributor({ repositoryRoot, selectedPaths: ['src/unreadable.host.mjs'] })();
    assert.equal(findings.some((finding) => finding.details?.matchedShimSignals?.thinReexportShim), false);
  } finally {
    fs.chmodSync(unreadable, 0o644);
    fs.rmSync(repositoryRoot, { recursive: true, force: true });
  }
});
