import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Circuit } from '../src/circuit.js';
import { exportSvg } from '../src/visualizer/svg.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== Example 2: Inverter Loop / Oscillator ===');

const c = new Circuit();
const x = c.createInput('X');

// Combinational cycle with odd inversion: X = not(X)
const xNext = c.not(x);

// Netlist before unrolling
const netlistBefore = c.exportNetlist([xNext]);
const svgBefore = exportSvg(netlistBefore, { title: 'Oscillator Loop - Before Unrolling' });
const beforeFile = path.join(__dirname, 'oscillator_before.svg');
fs.writeFileSync(beforeFile, svgBefore);
console.log(`Exported before netlist SVG: ${beforeFile}`);

// Unroll with X0 = CONST_FALSE
const maxK = 6;
const resultOutputs = c.unroll([x], [xNext], [c.CONST_FALSE], maxK);

if (!c.lastUnrollResult?.stabilized) {
  console.warn(`[WARNING] Oscillator did not stabilize! Non-convergence reached maxK = ${maxK}`);
  console.log(`Output at maxK: ${resultOutputs[0]} (is CONST_FALSE: ${resultOutputs[0] === c.CONST_FALSE})`);
} else {
  console.log(`[Oscillator] Unexpectedly stabilized at step ${c.lastUnrollResult.step}`);
}

// Netlist after unrolling
const netlistAfter = c.exportNetlist(resultOutputs);
const svgAfter = exportSvg(netlistAfter, { title: `Oscillator - State at maxK (${maxK})` });
const afterFile = path.join(__dirname, 'oscillator_after.svg');
fs.writeFileSync(afterFile, svgAfter);
console.log(`Exported after netlist SVG: ${afterFile}`);
