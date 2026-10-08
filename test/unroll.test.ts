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

  it('stabilizes Malik cyclic multiplexers', () => {
    const c = new Circuit();
    const c1 = c.createInput('C1');
    const c2 = c.createInput('C2');
    const a = c.createInput('A');
    const b = c.createInput('B');
    const x = c.createInput('X');
    const y = c.createInput('Y');

    const xNext = c.mux(c1, y, a);
    const yNext = c.mux(c2, x, b);

    const stabilized = c.unroll(
      [x, y],
      [xNext, yNext],
      [c.CONST_FALSE, c.CONST_FALSE],
      6
    );

    expect(c.lastUnrollResult).toBeDefined();
    expect(c.lastUnrollResult!.stabilized).toBe(true);
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
