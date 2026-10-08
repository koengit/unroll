# DESIGN.md: Incremental AIG & Circuit Unrolling Library with Visual Examples

## 1. Overview & Purpose
This library provides an And-Inverter Graph (AIG) circuit builder and an incremental SAT-based unroller designed for constructive causality analysis and cyclic circuit stabilization (e.g., in Esterel compilation).

The library runs synchronously in browser and Node.js environments as a modern ES module with full TypeScript type definitions. It includes:
1. A core AIG data structure with hash-consing and constant propagation.
2. An incremental SAT solver interface using MiniSat via `logic-solver`.
3. An unrolling engine that detects fixpoints using SAT assumptions.
4. Clean topological netlist export.
5. A visualization subsystem (DOT and standalone SVG export).
6. Canonical example suites and a browser-based side-by-side visualizer.

---

## 2. Technology Stack & Project Configuration

* **Language:** TypeScript (`strict: true`, target `ES2022`).
* **Module System:** ES Modules (`type: "module"`).
* **Bundler:** `tsup` (generates `./dist/index.js` and `./dist/index.d.ts`).
* **SAT Engine:** `logic-solver` (synchronous MiniSat build).
* **Testing:** `vitest`.
* **Execution Runner:** `tsx`.

### `package.json`
```json
{
  "name": "aig-unroller",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "test": "vitest run",
    "example:constructive": "tsx examples/01-constructive-loop.ts",
    "example:oscillator": "tsx examples/02-oscillator-loop.ts",
    "example:arbiter": "tsx examples/03-arbiter-multiplexer.ts"
  },
  "dependencies": {
    "logic-solver": "^2.0.1"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  }
}
```

### `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*", "examples/**/*", "test/**/*"]
}
```

---

## 3. Core Concepts & Data Representation

### 3.1 Point Encoding (Bit-Packed Integer)
A `Point` represents a directed edge to a node with an optional logical inversion flag. It is represented as an unsigned 32-bit integer:
* **Bit 0 (LSB):** Inversion flag (`1` = inverted/NOT, `0` = regular).
* **Bits 1..31:** Node ID (`nodeId = point >>> 1`).

**Reserved Constants:**
* Node `0` is the constant `FALSE` node.
* Point `0` (`0 << 1 | 0`) represents `CONST_FALSE`.
* Point `1` (`0 << 1 | 1`) represents `CONST_TRUE`.

**Point Operations:**
* `negate(p: Point): Point => p ^ 1`
* `isNegated(p: Point): boolean => (p & 1) === 1`
* `nodeId(p: Point): number => p >>> 1`
* `makePoint(nodeId: number, inverted: boolean): Point => (nodeId << 1) | (inverted ? 1 : 0)`

---

## 4. Public API Specification

```typescript
export type Point = number;

export interface NetlistNode {
  id: number;
  type: 'CONST' | 'INPUT' | 'AND';
  name?: string; // Optional user label for inputs
  left?: { nodeId: number; inverted: boolean };
  right?: { nodeId: number; inverted: boolean };
}

export interface Netlist {
  nodes: NetlistNode[]; // Topologically sorted (dependencies appear before consumers)
  roots: Point[];       // The requested output points
}

export class Circuit {
  readonly CONST_FALSE: Point;
  readonly CONST_TRUE: Point;

  constructor();

  /** Creates a primary or unrolling input point */
  createInput(name?: string): Point;

  /** Logical negation (O(1) bit flip) */
  not(p: Point): Point;

  /** Creates or retrieves an existing AND gate with constant propagation and hash-consing */
  and(p1: Point, p2: Point): Point;

  /** Convenience boolean helpers */
  or(p1: Point, p2: Point): Point;
  xor(p1: Point, p2: Point): Point;
  implies(p1: Point, p2: Point): Point;
  mux(cond: Point, thenPoint: Point, elsePoint: Point): Point;

  /**
   * Tests whether p1 and p2 must be logically equivalent under all input assignments
   * using incremental SAT assumptions.
   */
  areEquivalent(p1: Point, p2: Point): boolean;

  /**
   * Unrolls the logic loop from `unrollInputs` to `unrollOutputs`.
   * Stops when all outputs stabilize (reach a fixpoint) or when maxK iterations are reached.
   */
  unroll(
    unrollInputs: Point[],
    unrollOutputs: Point[],
    initValues: Point[],
    maxK: number
  ): Point[];

  /**
   * Exports a topologically sorted netlist containing only gates reachable from the given root points.
   */
  exportNetlist(roots: Point[]): Netlist;
}
```

---

## 5. Architectural Subsystems

### 5.1 Node Storage & Hash-Consing
The `Circuit` maintains:
1. `nodes: InternalNode[]` (indexed by `nodeId`).
2. `hashTable: Map<string, number>` mapping normalized `"min(p1,p2),max(p1,p2)"` to `nodeId`.

**On-the-fly simplifications in `and(p1, p2)`:**
1. **Constant Propagation:**
   * If `p1 === CONST_FALSE` or `p2 === CONST_FALSE`, return `CONST_FALSE`.
   * If `p1 === CONST_TRUE`, return `p2`.
   * If `p2 === CONST_TRUE`, return `p1`.
2. **Idempotence & Contradiction:**
   * If `p1 === p2`, return `p1`.
   * If `p1 === (p2 ^ 1)`, return `CONST_FALSE`.
3. **Commutativity Normalization:**
   * Ensure `left = Math.min(p1, p2)` and `right = Math.max(p1, p2)`.
4. **Local Structural Redundancies:**
   * If `right` is an AND node whose child matches `left` (e.g. $A \land (A \land B)$), simplify directly to $A \land B$.
   * If `right` has a child $(A \land \neg A)$, simplify accordingly.
5. **Lookup & Insertion:**
   * Check `hashTable.get("${left},${right}")`. If exists, return `makePoint(existingId, false)`.
   * Otherwise, allocate a new node ID, register in SAT solver, insert into `hashTable`, and return `makePoint(newId, false)`.

### 5.2 Incremental SAT Solver Integration
The `Circuit` contains a persistent `Logic.Solver` instance.

#### Tseitin Encoding:
* Each node $i$ maps to a SAT variable named `"v" + i`.
* Constant node 0 is permanently fixed: `solver.require(Logic.not("v0"))`.
* When a new AND node $z = p_1 \land p_2$ is allocated:
  Let $lit(p)$ be:
  * `Logic.not("v" + nodeId(p))` if `isNegated(p)`
  * `"v" + nodeId(p)` if not inverted.

  Add the standard 3 CNF clauses enforcing $v_z \leftrightarrow (lit(p_1) \land lit(p_2))$:
  1. `solver.require(Logic.implies("v" + z, lit(p1)))`
  2. `solver.require(Logic.implies("v" + z, lit(p2)))`
  3. `solver.require(Logic.implies(Logic.and(lit(p1), lit(p2)), "v" + z))`

### 5.3 Equivalence Checking via Assumptions (`areEquivalent`)
To test if $P \equiv Q$:
1. If $P === Q$, return `true` immediately (structural identity).
2. If $(P \text{ XOR } Q) === 1$ (constants), return `false`.
3. Test direction $P \land \neg Q$:
   * Run `solver.solveAssuming([lit(P), Logic.not(lit(Q))])`.
   * If result is not `null` (SAT), a counterexample exists $\Rightarrow$ return `false`.
4. Test direction $\neg P \land Q$:
   * Run `solver.solveAssuming([Logic.not(lit(P)), lit(Q)])`.
   * If result is not `null` (SAT), a counterexample exists $\Rightarrow$ return `false`.
5. Both tests are UNSAT $\Rightarrow$ return `true`.

### 5.4 Circuit Unrolling Algorithm (`unroll`)

```text
Parameters:
  unrollInputs:  [u_1, u_2, ..., u_n]
  unrollOutputs: [o_1, o_2, ..., o_n]
  initValues:    [v_1, v_2, ..., v_n]
  maxK:          natural number

1. Set currentOutputs = [...initValues]
2. For step = 1 to maxK:
     a. Build substitution map:
          memo = new Map<Point, Point>()
          For each i in 0..n-1:
            memo.set(unrollInputs[i], currentOutputs[i])
            memo.set(not(unrollInputs[i]), not(currentOutputs[i]))

     b. Instantiation / Copying helper copyPoint(p):
          If p is in memo: return memo.get(p)
          If nodeId(p) is an INPUT (not in unrollInputs) or CONST:
            return p (shared primary input)
          If nodeId(p) is AND(l, r):
            newL = copyPoint(l)
            newR = copyPoint(r)
            res = and(newL, newR)
            res = isNegated(p) ? not(res) : res
            memo.set(p, res)
            return res

     c. Evaluate next step outputs:
          nextOutputs = unrollOutputs.map(o => copyPoint(o))

     d. Convergence and Fixpoint Check:
          allStabilized = true
          For each i in 0..n-1:
            If areEquivalent(nextOutputs[i], currentOutputs[i]):
              nextOutputs[i] = currentOutputs[i]  // Freeze to previous point
            Else:
              allStabilized = false

     e. If allStabilized is true:
          return currentOutputs  // Fixpoint reached

     f. currentOutputs = nextOutputs

3. Return currentOutputs (reached maxK)
```

### 5.5 Netlist Extraction (`exportNetlist`)
Given root points:
1. Perform a post-order depth-first search (DFS) starting from the roots.
2. Filter out dead nodes (unreferenced gates are omitted automatically).
3. Return a clean array `nodes` sorted in topological order (all dependencies appear before their consumers) and the list of mapped `roots`.

---

## 6. Visualization Subsystem

### 6.1 Graphviz DOT Exporter (`src/visualizer/dot.ts`)
Converts a `Netlist` into Graphviz DOT format:
* `INPUT`: Green boxes (`shape=box, style=filled, fillcolor="#e1f5fe"`).
* `CONST`: Gray double circles (`shape=doublecircle, fillcolor="#eeeeee"`).
* `AND`: White ovals (`shape=ellipse, label="&"`).
* Regular edges: Solid black lines (`arrowhead=normal`).
* Inverted edges: Red lines with dot bubble (`color="#d32f2f", arrowhead=dot`).

### 6.2 Standalone SVG Renderer (`src/visualizer/svg.ts`)
Zero-dependency SVG generator:
* Computes horizontal levels by topological distance from inputs.
* Layout: Inputs on the left column, intermediate gates in middle columns, root points on the right.
* Renders clear logic gates, wire lines, and invert bubbles.
* Returns a self-contained string `<svg ...>...</svg>`.

---

## 7. Concrete Examples Suite

Implement the following runnable scripts in `examples/`:

### Example 1: Esterel Constructive Loop (`examples/01-constructive-loop.ts`)
* **Circuit:** Signal emitted inside a loop conditioned on external input $Y$: $X = X \land Y$.
* **Initial Condition:** $X_0 = \text{CONST\_FALSE}$.
* **Expectation:** Stabilizes at step 1 because $0 \land Y \equiv 0$.
* **Output:** Logs stabilization step and exports `constructive_before.svg` and `constructive_after.svg`.

### Example 2: Inverter Loop / Oscillator (`examples/02-oscillator-loop.ts`)
* **Circuit:** Combinational cycle with odd inversion: $X = \neg X$.
* **Initial Condition:** $X_0 = \text{CONST\_FALSE}$.
* **Expectation:** Alternates $0 \to 1 \to 0 \to 1$. Does not stabilize. Stops at `maxK`.
* **Output:** Logs non-convergence warning and exports SVGs.

### Example 3: Multi-Signal Feedback (`examples/03-arbiter-multiplexer.ts`)
* **Circuit:** Two coupled unrolling signals $A$ and $B$, controlled by selector $M$:
  * $A_{next} = M \land B$
  * $B_{next} = \neg M \lor A$
* **Initial Condition:** $A_0 = \text{CONST\_FALSE}, B_0 = \text{CONST\_FALSE}$.
* **Expectation:** Demonstrates multi-step partial freezing where individual lines stabilize on different steps.

---

## 8. Interactive Browser Viewer (`examples/index.html`)

A zero-build HTML application providing side-by-side inspection:
* **Left Panel:** Initial circuit topology before unrolling (feedback connections indicated).
* **Right Panel:** Stabilized/unrolled circuit topology.
* **Controls:**
  * Dropdown selector for the 3 built-in examples.
  * Slider for `maxK` ($1$ to $10$).
  * Button: **"Run Unroll & Compare"**.
* **Metrics Panel:**
  * Status: `STABILIZED at step N` or `MAX_K REACHED`.
  * Gate counts before vs. after.
  * Number of equivalence queries performed.

---

## 9. File & Directory Layout

```text
.
├── package.json
├── tsconfig.json
├── src/
│   ├── types.ts              # Point, NetlistNode, Netlist interfaces
│   ├── point.ts              # Bit-packing utilities (makePoint, negate, etc.)
│   ├── solver.ts             # logic-solver wrapper and Tseitin helpers
│   ├── circuit.ts            # Circuit class, simplifications, and unroll()
│   ├── visualizer/
│   │   ├── dot.ts            # Netlist -> Graphviz DOT
│   │   └── svg.ts            # Netlist -> Standalone SVG string
│   └── index.ts              # Public exports
├── examples/
│   ├── 01-constructive-loop.ts
│   ├── 02-oscillator-loop.ts
│   ├── 03-arbiter-multiplexer.ts
│   └── index.html            # Interactive visualizer viewer
└── test/
    ├── circuit.test.ts       # Simplifications and equivalence verification
    └── unroll.test.ts        # Loop convergence and oscillation tests
```

---

## 10. Verification Tests

Implement automated tests in `test/` verifying:
1. **Simplifications:**
   * $A \land A = A$
   * $A \land \neg A = \text{FALSE}$
   * $A \land \text{TRUE} = A$
   * $\text{and}(A, B) === \text{and}(B, A)$ (hash-cons canonical identity)
2. **SAT Equivalence:**
   * De Morgan equivalence: $\neg(A \land B) \equiv (\neg A \lor \neg B)$.
   * MUX identity equivalence using different boolean gate layouts.
3. **Unrolling & Fixpoint:**
   * Constructive loop stabilizes at step 1.
   * Oscillator reaches `maxK` without claiming equivalence.
   * Multi-variable feedback convergence.
4. **Topological Order:**
   * Netlist emitted by `exportNetlist` strictly guarantees every node's inputs precede the node itself.
