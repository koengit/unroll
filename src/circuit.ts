import { Point, Netlist, NetlistNode, InternalNode, UnrollResult } from './types.js';
import { CONST_FALSE, CONST_TRUE, makePoint, nodeId, isNegated, negate } from './point.js';
import { CircuitSolver } from './solver.js';

export class Circuit {
  readonly CONST_FALSE: Point = CONST_FALSE;
  readonly CONST_TRUE: Point = CONST_TRUE;

  private nodes: InternalNode[] = [];
  private hashTable: Map<string, number> = new Map();
  private solver: CircuitSolver;

  public stats = {
    equivalenceQueries: 0,
  };

  public lastUnrollResult?: UnrollResult;

  constructor() {
    this.solver = new CircuitSolver();
    // Allocate Node 0 as CONST_FALSE
    this.nodes.push({ id: 0, type: 'CONST' });
  }

  /**
   * Creates a primary or unrolling input point.
   */
  createInput(name?: string): Point {
    const id = this.nodes.length;
    this.nodes.push({
      id,
      type: 'INPUT',
      ...(name ? { name } : {}),
    });
    return makePoint(id, false);
  }

  /**
   * Logical negation (O(1) bit flip).
   */
  not(p: Point): Point {
    return negate(p);
  }

  /**
   * Creates or retrieves an existing AND gate with constant propagation and hash-consing.
   */
  and(p1: Point, p2: Point): Point {
    // 1. Constant Propagation
    if (p1 === this.CONST_FALSE || p2 === this.CONST_FALSE) {
      return this.CONST_FALSE;
    }
    if (p1 === this.CONST_TRUE) {
      return p2;
    }
    if (p2 === this.CONST_TRUE) {
      return p1;
    }

    // 2. Idempotence & Contradiction
    if (p1 === p2) {
      return p1;
    }
    if (p1 === negate(p2)) {
      return this.CONST_FALSE;
    }

    // 3. Commutativity Normalization
    const left = Math.min(p1, p2);
    const right = Math.max(p1, p2);

    // 4. Local Structural Redundancies
    // Check right child if it is an AND node
    const rId = nodeId(right);
    const rNode = this.nodes[rId];
    if (rNode && rNode.type === 'AND' && rNode.left !== undefined && rNode.right !== undefined) {
      if (!isNegated(right)) {
        // A & (A & B) => A & B (= right)
        if (rNode.left === left || rNode.right === left) {
          return right;
        }
        // A & (~A & B) => FALSE
        if (rNode.left === negate(left) || rNode.right === negate(left)) {
          return this.CONST_FALSE;
        }

        // Associative sub-term absorption:
        // If left & rNode.left => left, then left & (rNode.left & rNode.right) => left & rNode.right
        const tryL = this.and(left, rNode.left);
        if (tryL === this.CONST_FALSE) {
          return this.CONST_FALSE;
        }
        if (tryL === left) {
          return this.and(left, rNode.right);
        }

        const tryR = this.and(left, rNode.right);
        if (tryR === this.CONST_FALSE) {
          return this.CONST_FALSE;
        }
        if (tryR === left) {
          return this.and(left, rNode.left);
        }
      } else {
        // A & ~(A & B) => A & ~B
        if (rNode.left === left) {
          return this.and(left, negate(rNode.right));
        }
        if (rNode.right === left) {
          return this.and(left, negate(rNode.left));
        }
        // Absorption: A & ~(~A & B) => A
        if (rNode.left === negate(left) || rNode.right === negate(left)) {
          return left;
        }
      }
    }

    // Check left child if it is an AND node
    const lId = nodeId(left);
    const lNode = this.nodes[lId];
    if (lNode && lNode.type === 'AND' && lNode.left !== undefined && lNode.right !== undefined) {
      if (!isNegated(left)) {
        // (A & B) & B => A & B (= left)
        if (lNode.left === right || lNode.right === right) {
          return left;
        }
        // (~A & B) & A => FALSE
        if (lNode.left === negate(right) || lNode.right === negate(right)) {
          return this.CONST_FALSE;
        }

        const tryL = this.and(right, lNode.left);
        if (tryL === this.CONST_FALSE) {
          return this.CONST_FALSE;
        }
        if (tryL === right) {
          return this.and(right, lNode.right);
        }

        const tryR = this.and(right, lNode.right);
        if (tryR === this.CONST_FALSE) {
          return this.CONST_FALSE;
        }
        if (tryR === right) {
          return this.and(right, lNode.left);
        }
      } else {
        // ~(A & B) & B => ~A & B
        if (lNode.left === right) {
          return this.and(negate(lNode.right), right);
        }
        if (lNode.right === right) {
          return this.and(negate(lNode.left), right);
        }
        // Absorption: ~(~B & A) & B => B
        if (lNode.left === negate(right) || lNode.right === negate(right)) {
          return right;
        }
      }
    }

    // Semantic Equivalence Check: (~a & ~a) => ~a, and (a & ~a) => FALSE
    if (this.areEquivalent(left, right)) {
      return left;
    }
    if (this.areEquivalent(left, negate(right))) {
      return this.CONST_FALSE;
    }

    // 5. Lookup & Insertion
    const key = `${left},${right}`;
    const existing = this.hashTable.get(key);
    if (existing !== undefined) {
      return makePoint(existing, false);
    }

    const newId = this.nodes.length;
    this.nodes.push({
      id: newId,
      type: 'AND',
      left,
      right,
    });
    this.solver.registerAndNode(newId, left, right);
    this.hashTable.set(key, newId);
    return makePoint(newId, false);
  }

  /**
   * Convenience boolean helper: OR
   */
  or(p1: Point, p2: Point): Point {
    return this.not(this.and(this.not(p1), this.not(p2)));
  }

  /**
   * Convenience boolean helper: XOR
   */
  xor(p1: Point, p2: Point): Point {
    return this.or(this.and(p1, this.not(p2)), this.and(this.not(p1), p2));
  }

  /**
   * Convenience boolean helper: Implies (p1 => p2 = ~p1 | p2)
   */
  implies(p1: Point, p2: Point): Point {
    return this.or(this.not(p1), p2);
  }

  /**
   * Convenience boolean helper: MUX (cond ? thenPoint : elsePoint)
   */
  mux(cond: Point, thenPoint: Point, elsePoint: Point): Point {
    return this.or(
      this.and(cond, thenPoint),
      this.and(this.not(cond), elsePoint)
    );
  }

  /**
   * Tests whether p1 and p2 must be logically equivalent under all input assignments
   * using incremental SAT assumptions.
   */
  areEquivalent(p1: Point, p2: Point): boolean {
    this.stats.equivalenceQueries++;
    return this.solver.areEquivalent(p1, p2);
  }

  /**
   * Unrolls the logic loop from `unrollInputs` to `unrollOutputs`.
   * Stops when all outputs stabilize (reach a fixpoint) or when maxK iterations are reached.
   */
  unroll(
    unrollInputs: Point[],
    unrollOutputs: Point[],
    initValues: Point[],
    maxK: number
  ): Point[] {
    if (unrollInputs.length !== unrollOutputs.length || unrollInputs.length !== initValues.length) {
      throw new Error('unrollInputs, unrollOutputs, and initValues must have the same length');
    }

    let currentOutputs = [...initValues];
    const n = unrollInputs.length;

    for (let step = 1; step <= maxK; step++) {
      // 2.a. Build substitution map
      const memo = new Map<Point, Point>();
      for (let i = 0; i < n; i++) {
        memo.set(unrollInputs[i], currentOutputs[i]);
        memo.set(this.not(unrollInputs[i]), this.not(currentOutputs[i]));
      }

      // 2.b. Instantiation / Copying helper copyPoint(p)
      const copyPoint = (p: Point): Point => {
        if (memo.has(p)) {
          return memo.get(p)!;
        }
        if (memo.has(this.not(p))) {
          return this.not(memo.get(this.not(p))!);
        }

        const nId = nodeId(p);
        const node = this.nodes[nId];
        if (!node || node.type === 'CONST' || node.type === 'INPUT') {
          return p;
        }

        if (node.type === 'AND') {
          const newL = copyPoint(node.left!);
          const newR = copyPoint(node.right!);
          const andRes = this.and(newL, newR);
          const res = isNegated(p) ? this.not(andRes) : andRes;
          memo.set(p, res);
          memo.set(this.not(p), this.not(res));
          return res;
        }

        return p;
      };

      // 2.c. Evaluate next step outputs
      const nextOutputs = unrollOutputs.map((o) => copyPoint(o));

      // 2.d. Convergence and Fixpoint Check
      let allStabilized = true;
      for (let i = 0; i < n; i++) {
        if (this.areEquivalent(nextOutputs[i], currentOutputs[i])) {
          nextOutputs[i] = currentOutputs[i]; // Freeze to previous point
        } else {
          allStabilized = false;
        }
      }

      // 2.e. If allStabilized is true: return currentOutputs
      if (allStabilized) {
        this.lastUnrollResult = {
          step,
          stabilized: true,
          outputs: currentOutputs,
        };
        return currentOutputs;
      }

      // 2.f. currentOutputs = nextOutputs
      currentOutputs = nextOutputs;
    }

    this.lastUnrollResult = {
      step: maxK,
      stabilized: false,
      outputs: currentOutputs,
    };
    return currentOutputs;
  }

  /**
   * Exports a topologically sorted netlist containing only gates reachable from the given root points.
   */
  exportNetlist(roots: Point[]): Netlist {
    const visited = new Set<number>();
    const orderedNodes: NetlistNode[] = [];

    const visit = (nid: number) => {
      if (visited.has(nid)) {
        return;
      }
      visited.add(nid);

      const internal = this.nodes[nid];
      if (!internal) {
        return;
      }

      if (internal.type === 'AND') {
        if (internal.left !== undefined) {
          visit(nodeId(internal.left));
        }
        if (internal.right !== undefined) {
          visit(nodeId(internal.right));
        }
        orderedNodes.push({
          id: internal.id,
          type: 'AND',
          left: {
            nodeId: nodeId(internal.left!),
            inverted: isNegated(internal.left!),
          },
          right: {
            nodeId: nodeId(internal.right!),
            inverted: isNegated(internal.right!),
          },
        });
      } else if (internal.type === 'INPUT') {
        orderedNodes.push({
          id: internal.id,
          type: 'INPUT',
          ...(internal.name ? { name: internal.name } : {}),
        });
      } else if (internal.type === 'CONST') {
        orderedNodes.push({
          id: internal.id,
          type: 'CONST',
        });
      }
    };

    for (const root of roots) {
      visit(nodeId(root));
    }

    return {
      nodes: orderedNodes,
      roots: [...roots],
    };
  }

  /**
   * Returns internal node by ID.
   */
  getNode(id: number): InternalNode | undefined {
    return this.nodes[id];
  }

  /**
   * Returns total number of allocated nodes.
   */
  getNodeCount(): number {
    return this.nodes.length;
  }
}
