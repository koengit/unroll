import { describe, it, expect } from 'vitest';
import { Circuit } from '../src/circuit.js';
import { nodeId } from '../src/point.js';

describe('Circuit Simplifications', () => {
  it('simplifies A and A = A (idempotence)', () => {
    const c = new Circuit();
    const a = c.createInput('A');
    const res = c.and(a, a);
    expect(res).toBe(a);
  });

  it('simplifies A and not(A) = FALSE (contradiction)', () => {
    const c = new Circuit();
    const a = c.createInput('A');
    const res = c.and(a, c.not(a));
    expect(res).toBe(c.CONST_FALSE);
  });

  it('simplifies A and TRUE = A (constant propagation)', () => {
    const c = new Circuit();
    const a = c.createInput('A');
    const res = c.and(a, c.CONST_TRUE);
    expect(res).toBe(a);
  });

  it('simplifies A and FALSE = FALSE (constant propagation)', () => {
    const c = new Circuit();
    const a = c.createInput('A');
    const res = c.and(a, c.CONST_FALSE);
    expect(res).toBe(c.CONST_FALSE);
  });

  it('ensures and(A, B) === and(B, A) by hash-consing and commutativity normalization', () => {
    const c = new Circuit();
    const a = c.createInput('A');
    const b = c.createInput('B');
    const p1 = c.and(a, b);
    const p2 = c.and(b, a);
    expect(p1).toBe(p2);
  });

  it('simplifies structural redundancies: A and (A and B) = A and B', () => {
    const c = new Circuit();
    const a = c.createInput('A');
    const b = c.createInput('B');
    const ab = c.and(a, b);
    const a_ab = c.and(a, ab);
    expect(a_ab).toBe(ab);
  });

  it('simplifies structural redundancies: A and (not(A) and B) = FALSE', () => {
    const c = new Circuit();
    const a = c.createInput('A');
    const b = c.createInput('B');
    const notA_b = c.and(c.not(a), b);
    const res = c.and(a, notA_b);
    expect(res).toBe(c.CONST_FALSE);
  });

  it('simplifies (~a & ~a) --> ~a directly and under equivalent expressions', () => {
    const c = new Circuit();
    const a = c.createInput('A');
    const b = c.createInput('B');

    // Direct (~a & ~a) => ~a
    const notA = c.not(a);
    expect(c.and(notA, notA)).toBe(notA);

    // Equivalent expression for ~a: (~a & b) | (~a & ~b)
    const equivNotA = c.or(c.and(notA, b), c.and(notA, c.not(b)));
    // ANDing notA with equivNotA must simplify to notA
    expect(c.and(notA, equivNotA)).toBe(notA);
  });

  it('simplifies absorption laws: A and (A or B) = A, and ~A and (~A or B) = ~A', () => {
    const c = new Circuit();
    const a = c.createInput('A');
    const b = c.createInput('B');

    expect(c.and(a, c.or(a, b))).toBe(a);
    expect(c.and(c.not(a), c.or(c.not(a), b))).toBe(c.not(a));
  });
});

describe('SAT Equivalence Checking', () => {
  it('verifies De Morgan equivalence: not(A and B) === (not(A) or not(B))', () => {
    const c = new Circuit();
    const a = c.createInput('A');
    const b = c.createInput('B');

    const lhs = c.not(c.and(a, b));
    const rhs = c.or(c.not(a), c.not(b));

    expect(c.areEquivalent(lhs, rhs)).toBe(true);
  });

  it('verifies MUX equivalence across different gate encodings', () => {
    const c = new Circuit();
    const s = c.createInput('S');
    const a = c.createInput('A');
    const b = c.createInput('B');

    // Layout 1: via circuit.mux
    const mux1 = c.mux(s, a, b);

    // Layout 2: via manual OR of ANDs
    const mux2 = c.or(c.and(s, a), c.and(c.not(s), b));

    // Layout 3: via (s => a) and (~s => b)
    const mux3 = c.and(c.implies(s, a), c.implies(c.not(s), b));

    expect(c.areEquivalent(mux1, mux2)).toBe(true);
    expect(c.areEquivalent(mux1, mux3)).toBe(true);
  });

  it('verifies XOR formulations are equivalent', () => {
    const c = new Circuit();
    const a = c.createInput('A');
    const b = c.createInput('B');

    const xor1 = c.xor(a, b);
    const xor2 = c.and(c.or(a, b), c.not(c.and(a, b)));

    expect(c.areEquivalent(xor1, xor2)).toBe(true);
  });

  it('correctly detects non-equivalent signals', () => {
    const c = new Circuit();
    const a = c.createInput('A');
    const b = c.createInput('B');

    expect(c.areEquivalent(a, b)).toBe(false);
    expect(c.areEquivalent(a, c.not(a))).toBe(false);
    expect(c.areEquivalent(c.and(a, b), c.or(a, b))).toBe(false);
  });
});

describe('Topological Order & Netlist Export', () => {
  it('guarantees dependencies appear before consumers and omits unreferenced gates', () => {
    const c = new Circuit();
    const x = c.createInput('X');
    const y = c.createInput('Y');
    const z = c.createInput('Z');

    // Unreferenced gate
    const unreferenced = c.and(x, z);

    // Referenced logic
    const xy = c.and(x, y);
    const root = c.and(xy, z);

    const netlist = c.exportNetlist([root]);

    // Unreferenced node should not be in exported netlist
    const unreferencedNodeId = nodeId(unreferenced);
    expect(netlist.nodes.some((n) => n.id === unreferencedNodeId)).toBe(false);

    // Topological order check
    const seenNodeIds = new Set<number>();
    for (const node of netlist.nodes) {
      if (node.type === 'AND') {
        expect(seenNodeIds.has(node.left!.nodeId)).toBe(true);
        expect(seenNodeIds.has(node.right!.nodeId)).toBe(true);
      }
      seenNodeIds.add(node.id);
    }

    expect(netlist.roots).toEqual([root]);
  });
});
