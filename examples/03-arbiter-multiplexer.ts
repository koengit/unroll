import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Circuit } from '../src/circuit.js';
import { exportSvg } from '../src/visualizer/svg.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== Example 3: Multi-Signal Feedback (Arbiter / Multiplexer) ===');

const c = new Circuit();
const m = c.createInput('M');
const a = c.createInput('A');
const b = c.createInput('B');

// A_next = M and B
// B_next = not(M) or A
const aNext = c.and(m, b);
const bNext = c.or(c.not(m), a);

// Netlist before unrolling
const netlistBefore = c.exportNetlist([aNext, bNext]);
const svgBefore = exportSvg(netlistBefore, { title: 'Arbiter Multiplexer - Before Unrolling' });
const beforeFile = path.join(__dirname, 'arbiter_before.svg');
fs.writeFileSync(beforeFile, svgBefore);
console.log(`Exported before netlist SVG: ${beforeFile}`);

// Unroll with A0 = CONST_FALSE, B0 = CONST_FALSE
const maxK = 10;
const stabilized = c.unroll(
  [a, b],
  [aNext, bNext],
  [c.CONST_FALSE, c.CONST_FALSE],
  maxK
);

if (c.lastUnrollResult?.stabilized) {
  console.log(`[Arbiter] Successfully STABILIZED at step ${c.lastUnrollResult.step}`);
  console.log(`Output A stabilized point: ${stabilized[0]} (is CONST_FALSE: ${stabilized[0] === c.CONST_FALSE})`);
  console.log(`Output B stabilized point: ${stabilized[1]} (is equivalent to not(M): ${c.areEquivalent(stabilized[1], c.not(m))})`);
} else {
  console.log(`[Arbiter] Did not stabilize within maxK = ${maxK}`);
}

// Netlist after unrolling
const netlistAfter = c.exportNetlist(stabilized);
const svgAfter = exportSvg(netlistAfter, { title: 'Arbiter Multiplexer - Stabilized Fixpoint' });
const afterFile = path.join(__dirname, 'arbiter_after.svg');
fs.writeFileSync(afterFile, svgAfter);
console.log(`Exported after netlist SVG: ${afterFile}`);
