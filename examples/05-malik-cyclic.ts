import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Circuit } from '../src/circuit.js';
import { exportSvg } from '../src/visualizer/svg.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== Example 5: Malik Constructive Cyclic Multiplexers ===');

const c = new Circuit();
const c1 = c.createInput('C1');
const c2 = c.createInput('C2');
const inA = c.createInput('A');
const inB = c.createInput('B');

const x = c.createInput('X');
const y = c.createInput('Y');

// Cyclic multiplexers from Malik (1993):
// X_next = MUX(C1, Y, A) = (C1 and Y) or (not C1 and A)
// Y_next = MUX(C2, X, B) = (C2 and X) or (not C2 and B)
const xNext = c.mux(c1, y, inA);
const yNext = c.mux(c2, x, inB);

// Export before unrolling
const netlistBefore = c.exportNetlist([xNext, yNext]);
const svgBefore = exportSvg(netlistBefore, { title: 'Malik Cyclic MUX - Before Unrolling' });
const beforeFile = path.join(__dirname, 'malik_before.svg');
fs.writeFileSync(beforeFile, svgBefore);
console.log(`Exported before netlist SVG: ${beforeFile}`);

// Unroll with X0 = FALSE, Y0 = FALSE
const maxK = 6;
const stabilized = c.unroll(
  [x, y],
  [xNext, yNext],
  [c.CONST_FALSE, c.CONST_FALSE],
  maxK
);

if (c.lastUnrollResult?.stabilized) {
  console.log(`[Malik MUX] Successfully STABILIZED at step ${c.lastUnrollResult.step}`);
} else {
  console.log(`[Malik MUX] Did not stabilize within maxK = ${maxK}`);
}

const netlistAfter = c.exportNetlist(stabilized);
const svgAfter = exportSvg(netlistAfter, { title: 'Malik Cyclic MUX - Stabilized' });
const afterFile = path.join(__dirname, 'malik_after.svg');
fs.writeFileSync(afterFile, svgAfter);
console.log(`Exported after netlist SVG: ${afterFile}`);
