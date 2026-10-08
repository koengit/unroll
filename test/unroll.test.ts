import { describe, it, expect } from 'vitest';
import { Circuit } from '../src/circuit.js';

describe('Circuit Unrolling & Fixpoint Detection', () => {
  it('stabilizes Esterel constructive loop at step 1', () => {
    const c = new Circuit();
    const y = c.createInput('Y');
    const x = c.createInput('X');

    // Loop logic: X = X and Y
    const xNext = c.and(x, y);

    const stabilized = c.unroll([x], [xNext], [c.CONST_FALSE], 10);

    expect(c.lastUnrollResult).toBeDefined();
    expect(c.lastUnrollResult!.stabilized).toBe(true);
    expect(c.lastUnrollResult!.step).toBe(1);
    expect(stabilized[0]).toBe(c.CONST_FALSE);
  });

  it('runs oscillator until maxK without stabilizing', () => {
    const c = new Circuit();
    const x = c.createInput('X');

    // Oscillator logic: X = not(X)
    const xNext = c.not(x);

    const maxK = 6;
    const finalOutputs = c.unroll([x], [xNext], [c.CONST_FALSE], maxK);

    expect(c.lastUnrollResult).toBeDefined();
    expect(c.lastUnrollResult!.stabilized).toBe(false);
    expect(c.lastUnrollResult!.step).toBe(maxK);
    // At even step 6, alternating 0 -> 1 -> 0 -> 1 -> 0 -> 1 -> 0
    expect(finalOutputs[0]).toBe(c.CONST_FALSE);
  });

  it('stabilizes multi-variable feedback (arbiter / multiplexer) across multiple steps', () => {
    const c = new Circuit();
    const m = c.createInput('M');
    const a = c.createInput('A');
    const b = c.createInput('B');

    // Coupled logic:
    // A_next = M and B
    // B_next = not(M) or A
    const aNext = c.and(m, b);
    const bNext = c.or(c.not(m), a);

    const stabilized = c.unroll(
      [a, b],
      [aNext, bNext],
      [c.CONST_FALSE, c.CONST_FALSE],
      10
    );

    expect(c.lastUnrollResult).toBeDefined();
    expect(c.lastUnrollResult!.stabilized).toBe(true);
    expect(c.lastUnrollResult!.step).toBe(2);

    // After step 2:
    // A stabilized to CONST_FALSE
    // B stabilized to not(M)
    expect(stabilized[0]).toBe(c.CONST_FALSE);
    expect(c.areEquivalent(stabilized[1], c.not(m))).toBe(true);
  });

  it('handles latch/accumulator loop (Q = D or Q) stabilizing at step 2', () => {
    const c = new Circuit();
    const d = c.createInput('D');
    const q = c.createInput('Q');

    const qNext = c.or(d, q);

    const stabilized = c.unroll([q], [qNext], [c.CONST_FALSE], 5);

    expect(c.lastUnrollResult).toBeDefined();
    expect(c.lastUnrollResult!.stabilized).toBe(true);
    expect(c.lastUnrollResult!.step).toBe(2);
    // After step 1: Q1 = D | 0 = D
    // After step 2: Q2 = D | D = D (equivalent to Q1)
    expect(c.areEquivalent(stabilized[0], d)).toBe(true);
  });

  it('stabilizes Esterel constructive SR latch (Q = Set or (~Reset and Q))', () => {
    const c = new Circuit();
    const set = c.createInput('Set');
    const reset = c.createInput('Reset');
    const q = c.createInput('Q');

    const notResetAndQ = c.and(c.not(reset), q);
    const qNext = c.or(set, notResetAndQ);

    const stabilized = c.unroll(
      [q],
      [qNext],
      [c.CONST_FALSE],
      6
    );

    expect(c.lastUnrollResult).toBeDefined();
    expect(c.lastUnrollResult!.stabilized).toBe(true);
    expect(c.lastUnrollResult!.step).toBe(2);
    // After step 2: Q stabilizes to Set
    expect(c.areEquivalent(stabilized[0], set)).toBe(true);
  });

  it('stabilizes Malik cyclic network with multi-I/O components F and G', () => {
    const c = new Circuit();
    const c1 = c.createInput('C1');
    const c2 = c.createInput('C2');
    const a1 = c.createInput('A1');
    const a2 = c.createInput('A2');
    const b1 = c.createInput('B1');
    const b2 = c.createInput('B2');

    const y1 = c.createInput('Y1');
    const y2 = c.createInput('Y2');
    const x1 = c.createInput('X1');
    const x2 = c.createInput('X2');

    // Component F: inputs (C1, A1, A2, Y1, Y2), outputs (X1, X2)
    const x1Next = c.mux(c1, y1, a1);
    const x2Next = c.mux(c1, y2, a2);

    // Component G: inputs (C2, B1, B2, X1, X2), outputs (Y1, Y2)
    const y1Next = c.mux(c2, x2, b1);
    const y2Next = c.mux(c2, x1, b2);

    const stabilized = c.unroll(
      [x1, x2, y1, y2],
      [x1Next, x2Next, y1Next, y2Next],
      [c.CONST_FALSE, c.CONST_FALSE, c.CONST_FALSE, c.CONST_FALSE],
      6
    );

    expect(c.lastUnrollResult).toBeDefined();
    expect(c.lastUnrollResult!.stabilized).toBe(true);
    expect(c.lastUnrollResult!.step).toBe(3);
  });

  it('stabilizes Muller C-element hysteresis loop at step 2', () => {
    const c = new Circuit();
    const inA = c.createInput('InA');
    const inB = c.createInput('InB');
    const outC = c.createInput('C');

    const both = c.and(inA, inB);
    const either = c.or(inA, inB);
    const cNext = c.or(both, c.and(outC, either));

    const stabilized = c.unroll([outC], [cNext], [c.CONST_FALSE], 6);

    expect(c.lastUnrollResult).toBeDefined();
    expect(c.lastUnrollResult!.stabilized).toBe(true);
    expect(c.lastUnrollResult!.step).toBe(2);
    expect(c.areEquivalent(stabilized[0], both)).toBe(true);
  });
});
