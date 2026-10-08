import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Circuit } from '../src/circuit.js';
import { exportSvg } from '../src/visualizer/svg.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== Example 6: Esterel Mutual Signal Causality ===');

const c = new Circuit();
const cond1 = c.createInput('Cond1');
const cond2 = c.createInput('Cond2');
const emitA = c.createInput('EmitA');

const sigA = c.createInput('SigA');
const sigB = c.createInput('SigB');

// Mutual dependency:
// present SigB then emit SigA;
// present SigA then emit SigB;
// In hardware translation:
// SigA_next = (Cond1 and SigB) or EmitA
// SigB_next = (Cond2 and SigA)
const sigANext = c.or(c.and(cond1, sigB), emitA);
const sigBNext = c.and(cond2, sigA);

// Export before unrolling
const netlistBefore = c.exportNetlist([sigANext, sigBNext]);
const svgBefore = exportSvg(netlistBefore, { title: 'Mutual Causality - Before Unrolling' });
const beforeFile = path.join(__dirname, 'mutual_before.svg');
fs.writeFileSync(beforeFile, svgBefore);
console.log(`Exported before netlist SVG: ${beforeFile}`);

// Initial condition: absent signals (SigA=FALSE, SigB=FALSE)
const maxK = 6;
const stabilized = c.unroll(
  [sigA, sigB],
  [sigANext, sigBNext],
  [c.CONST_FALSE, c.CONST_FALSE],
  maxK
);

if (c.lastUnrollResult?.stabilized) {
  console.log(`[Mutual Causality] Successfully STABILIZED at step ${c.lastUnrollResult.step}`);
} else {
  console.log(`[Mutual Causality] Did not stabilize within maxK = ${maxK}`);
}

const netlistAfter = c.exportNetlist(stabilized);
const svgAfter = exportSvg(netlistAfter, { title: 'Mutual Causality - Stabilized' });
const afterFile = path.join(__dirname, 'mutual_after.svg');
fs.writeFileSync(afterFile, svgAfter);
console.log(`Exported after netlist SVG: ${afterFile}`);
