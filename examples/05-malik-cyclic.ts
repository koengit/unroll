import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Circuit } from '../src/circuit.js';
import { exportSvg } from '../src/visualizer/svg.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== Example 5: Malik Cyclic Circuits with Multi-I/O Components F and G ===');

const c = new Circuit();

// Primary inputs to Component F:
const c1 = c.createInput('C1');
const a1 = c.createInput('A1');
const a2 = c.createInput('A2');

// Primary inputs to Component G:
const c2 = c.createInput('C2');
const b1 = c.createInput('B1');
const b2 = c.createInput('B2');

// Feedback inputs from G to F (Y1, Y2)
const y1 = c.createInput('Y1');
const y2 = c.createInput('Y2');

// Feedback inputs from F to G (X1, X2)
const x1 = c.createInput('X1');
const x2 = c.createInput('X2');

// --- Component F (Multiple inputs: C1, A1, A2, Y1, Y2) ---
// Feedback outputs to G:
// X1_next = MUX(C1, Y1, A1)
// X2_next = MUX(C1, Y2, A2)
const x1Next = c.mux(c1, y1, a1);
const x2Next = c.mux(c1, y2, a2);
// Primary outputs from F:
const outF1 = c.and(x1Next, a1);
const outF2 = c.or(x2Next, a2);

// --- Component G (Multiple inputs: C2, B1, B2, X1, X2) ---
// Feedback outputs to F:
// Y1_next = MUX(C2, X2, B1)
// Y2_next = MUX(C2, X1, B2)
const y1Next = c.mux(c2, x2, b1);
const y2Next = c.mux(c2, x1, b2);
// Primary outputs from G:
const outG1 = c.and(y1Next, b1);
const outG2 = c.or(y2Next, b2);

const unrollInputs = [x1, x2, y1, y2];
const unrollOutputs = [x1Next, x2Next, y1Next, y2Next];
const allRootsBefore = [x1Next, x2Next, y1Next, y2Next, outF1, outF2, outG1, outG2];

// Export before unrolling
const netlistBefore = c.exportNetlist(allRootsBefore);
const svgBefore = exportSvg(netlistBefore, { title: 'Malik F/G Cyclic Network - Before Unrolling' });
const beforeFile = path.join(__dirname, 'malik_before.svg');
fs.writeFileSync(beforeFile, svgBefore);
console.log(`Exported before netlist SVG: ${beforeFile}`);

// Unroll from initial state (X1=FALSE, X2=FALSE, Y1=FALSE, Y2=FALSE)
const maxK = 6;
const stabilizedFeedback = c.unroll(
  unrollInputs,
  unrollOutputs,
  [c.CONST_FALSE, c.CONST_FALSE, c.CONST_FALSE, c.CONST_FALSE],
  maxK
);

if (c.lastUnrollResult?.stabilized) {
  console.log(`[Malik F/G Network] Successfully STABILIZED at step ${c.lastUnrollResult.step}`);
  console.log(`Stabilized Feedback X1: ${stabilizedFeedback[0]}`);
  console.log(`Stabilized Feedback X2: ${stabilizedFeedback[1]}`);
  console.log(`Stabilized Feedback Y1: ${stabilizedFeedback[2]}`);
  console.log(`Stabilized Feedback Y2: ${stabilizedFeedback[3]}`);
} else {
  console.log(`[Malik F/G Network] Did not stabilize within maxK = ${maxK}`);
}

// Compute stabilized primary outputs from the stabilized feedback values
const stabX1 = stabilizedFeedback[0];
const stabX2 = stabilizedFeedback[1];
const stabY1 = stabilizedFeedback[2];
const stabY2 = stabilizedFeedback[3];
const stabOutF1 = c.and(stabX1, a1);
const stabOutF2 = c.or(stabX2, a2);
const stabOutG1 = c.and(stabY1, b1);
const stabOutG2 = c.or(stabY2, b2);

const allRootsAfter = [
  stabX1, stabX2, stabY1, stabY2,
  stabOutF1, stabOutF2, stabOutG1, stabOutG2
];

const netlistAfter = c.exportNetlist(allRootsAfter);
const svgAfter = exportSvg(netlistAfter, { title: 'Malik F/G Cyclic Network - Stabilized' });
const afterFile = path.join(__dirname, 'malik_after.svg');
fs.writeFileSync(afterFile, svgAfter);
console.log(`Exported after netlist SVG: ${afterFile}`);
