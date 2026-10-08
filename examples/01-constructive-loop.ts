import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Circuit } from '../src/circuit.js';
import { exportSvg } from '../src/visualizer/svg.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== Example 1: Esterel Constructive Loop ===');

const c = new Circuit();
const y = c.createInput('Y');
const x = c.createInput('X');

// Loop: X_next = X and Y
const xNext = c.and(x, y);

// Netlist before unrolling
const netlistBefore = c.exportNetlist([xNext]);
const svgBefore = exportSvg(netlistBefore, { title: 'Constructive Loop - Before Unrolling' });
const beforeFile = path.join(__dirname, 'constructive_before.svg');
fs.writeFileSync(beforeFile, svgBefore);
console.log(`Exported before netlist SVG: ${beforeFile}`);

// Unroll with X0 = CONST_FALSE
const maxK = 10;
const stabilized = c.unroll([x], [xNext], [c.CONST_FALSE], maxK);

if (c.lastUnrollResult?.stabilized) {
  console.log(`[Constructive Loop] Successfully STABILIZED at step ${c.lastUnrollResult.step}`);
  console.log(`Stabilized output point: ${stabilized[0]} (is CONST_FALSE: ${stabilized[0] === c.CONST_FALSE})`);
} else {
  console.log(`[Constructive Loop] Did not stabilize within maxK = ${maxK}`);
}

// Netlist after unrolling
const netlistAfter = c.exportNetlist(stabilized);
const svgAfter = exportSvg(netlistAfter, { title: 'Constructive Loop - Stabilized Fixpoint' });
const afterFile = path.join(__dirname, 'constructive_after.svg');
fs.writeFileSync(afterFile, svgAfter);
console.log(`Exported after netlist SVG: ${afterFile}`);
