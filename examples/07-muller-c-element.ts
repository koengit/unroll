import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Circuit } from '../src/circuit.js';
import { exportSvg } from '../src/visualizer/svg.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== Example 7: Muller C-Element Hysteresis Loop ===');

const c = new Circuit();
const inA = c.createInput('InA');
const inB = c.createInput('InB');
const outC = c.createInput('C');

// Muller C-element boolean feedback equation:
// C_next = (InA and InB) or (C and (InA or InB))
const both = c.and(inA, inB);
const either = c.or(inA, inB);
const cNext = c.or(both, c.and(outC, either));

// Export before unrolling
const netlistBefore = c.exportNetlist([cNext]);
const svgBefore = exportSvg(netlistBefore, { title: 'Muller C-Element - Before Unrolling' });
const beforeFile = path.join(__dirname, 'muller_before.svg');
fs.writeFileSync(beforeFile, svgBefore);
console.log(`Exported before netlist SVG: ${beforeFile}`);

// Unroll with C0 = FALSE
const maxK = 6;
const stabilized = c.unroll(
  [outC],
  [cNext],
  [c.CONST_FALSE],
  maxK
);

if (c.lastUnrollResult?.stabilized) {
  console.log(`[Muller C-Element] Successfully STABILIZED at step ${c.lastUnrollResult.step}`);
} else {
  console.log(`[Muller C-Element] Did not stabilize within maxK = ${maxK}`);
}

const netlistAfter = c.exportNetlist(stabilized);
const svgAfter = exportSvg(netlistAfter, { title: 'Muller C-Element - Stabilized' });
const afterFile = path.join(__dirname, 'muller_after.svg');
fs.writeFileSync(afterFile, svgAfter);
console.log(`Exported after netlist SVG: ${afterFile}`);
