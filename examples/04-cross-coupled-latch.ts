import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Circuit } from '../src/circuit.js';
import { exportSvg } from '../src/visualizer/svg.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== Example 4: Esterel State Register / Constructive SR Latch ===');

const c = new Circuit();
const set = c.createInput('Set');
const reset = c.createInput('Reset');
const q = c.createInput('Q');

// Esterel constructive latch equation:
// Q_next = Set or (not Reset and Q)
const notResetAndQ = c.and(c.not(reset), q);
const qNext = c.or(set, notResetAndQ);

// Export before unrolling
const netlistBefore = c.exportNetlist([qNext]);
const svgBefore = exportSvg(netlistBefore, { title: 'Constructive SR Latch - Before Unrolling' });
const beforeFile = path.join(__dirname, 'latch_before.svg');
fs.writeFileSync(beforeFile, svgBefore);
console.log(`Exported before netlist SVG: ${beforeFile}`);

// Unroll from initial state Q0 = CONST_FALSE
const maxK = 6;
const stabilized = c.unroll(
  [q],
  [qNext],
  [c.CONST_FALSE],
  maxK
);

if (c.lastUnrollResult?.stabilized) {
  console.log(`[Constructive Latch] Successfully STABILIZED at step ${c.lastUnrollResult.step}`);
  console.log(`Stabilized output point: ${stabilized[0]}`);
} else {
  console.log(`[Constructive Latch] Did not stabilize within maxK = ${maxK}`);
}

const netlistAfter = c.exportNetlist(stabilized);
const svgAfter = exportSvg(netlistAfter, { title: 'Constructive SR Latch - Stabilized' });
const afterFile = path.join(__dirname, 'latch_after.svg');
fs.writeFileSync(afterFile, svgAfter);
console.log(`Exported after netlist SVG: ${afterFile}`);
