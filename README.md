# AIG Unroller

Incremental And-Inverter Graph (AIG) circuit builder and SAT-based unroller for constructive causality analysis and cyclic circuit stabilization (e.g. Esterel compilation).

[![Interactive Demo](https://img.shields.io/badge/Demo-Interactive%20Visualizer-blue)](https://koengit.github.io/unroll/examples/)

## Features

- **Hash-Consed AIG Representation**: Canonical gate de-duplication, structural hashing, and on-the-fly local optimizations (idempotence, contradiction, constant propagation, commutativity).
- **Bit-Packed Directed Pointers**: Unsigned 32-bit `Point` representation with low bit signaling logical inversion and $O(1)$ negation.
- **Incremental SAT Solver**: Embedded synchronous MiniSat via `logic-solver` with Tseitin encoding.
- **Incremental Equivalence Checking**: Directional counterexample detection under assumptions ($P \land \neg Q$ and $\neg P \land Q$).
- **Loop Unrolling & Fixpoint Detection**: Step-by-step substitution, partial freeze for stabilized lines, and fixpoint detection.
- **Clean Netlist Export**: Post-order topological ordering of reachable logic, dead node elimination.
- **Zero-Dependency Visualization**: Standalone SVG renderer and Graphviz DOT exporter.
- **Interactive Browser Visualizer**: Side-by-side comparison before and after unrolling with live metric calculations.

## Installation

```bash
npm install
```

## Build & Test

```bash
# Run automated vitest suite
npm test

# Build ES module and type declarations
npm run build
```

## Running Examples

```bash
# Example 1: Esterel Constructive Loop (X = X and Y)
npm run example:constructive

# Example 2: Inverter Loop / Oscillator (X = not X)
npm run example:oscillator

# Example 3: Multi-Signal Arbiter Multiplexer Feedback
npm run example:arbiter
```

## Interactive Browser Showcase

Open `examples/index.html` in your browser, or visit the live GitHub Pages showcase:
👉 **[https://koengit.github.io/unroll/examples/](https://koengit.github.io/unroll/examples/)**

## Canonical Examples

1. **Esterel Constructive Loop** (`examples/01-constructive-loop.ts`):
   - Circuit: $X = X \land Y$, initial state $X_0 = \text{FALSE}$.
   - Result: Stabilizes at step 1 because $\text{FALSE} \land Y \equiv \text{FALSE}$.

2. **Inverter Loop / Oscillator** (`examples/02-oscillator-loop.ts`):
   - Circuit: $X = \neg X$, initial state $X_0 = \text{FALSE}$.
   - Result: Alternates $0 \to 1 \to 0 \to 1$, never reaches a fixpoint, stops at `maxK`.

3. **Multi-Signal Arbiter** (`examples/03-arbiter-multiplexer.ts`):
   - Circuit: $A = M \land B$, $B = \neg M \lor A$ with $A_0 = \text{FALSE}, B_0 = \text{FALSE}$.
   - Result: Demonstrates multi-step partial freezing where $A$ stabilizes at step 1 to $\text{FALSE}$ and $B$ stabilizes at step 2 to $\neg M$.

## License

MIT
