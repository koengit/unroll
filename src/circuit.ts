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
    const checkRule = (a: Point, andP: Point): Point | undefined => {
      const node = this.nodes[nodeId(andP)];
      if (!node || node.type !== 'AND' || node.left === undefined || node.right === undefined) {
        return undefined;
      }
      const { left: l, right: r } = node;
      if (!isNegated(andP)) {
        // a & (a & b) => a & b
        if (l === a || r === a) return andP;
        // a & (~a & b) => FALSE
        if (l === negate(a) || r === negate(a)) return this.CONST_FALSE;
      } else {
        // a & ~(a & b) => a & ~b
        if (l === a) return this.and(a, negate(r));
        if (r === a) return this.and(a, negate(l));
        // a & ~(~a & b) => a (absorption)
        if (l === negate(a) || r === negate(a)) return a;
      }
      return undefined;
    };

    const ruleR = checkRule(left, right);
    if (ruleR !== undefined) return ruleR;
    const ruleL = checkRule(right, left);
    if (ruleL !== undefined) return ruleL;

    // Direct semantic equivalence check
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

      // 2.e. If allStabilized is true: simplify and return
      if (allStabilized) {
        const simplifiedOutputs = this.simplify(currentOutputs);
        this.lastUnrollResult = {
          step,
          stabilized: true,
          outputs: simplifiedOutputs,
        };
        return simplifiedOutputs;
      }

      // 2.f. currentOutputs = nextOutputs
      currentOutputs = nextOutputs;
    }

    const simplifiedOutputs = this.simplify(currentOutputs);
    this.lastUnrollResult = {
      step: maxK,
      stabilized: false,
      outputs: simplifiedOutputs,
    };
    return simplifiedOutputs;
  }

  /**
   * Simplifies the circuit reachable from the given root points using
   * simulation-guided SAT equivalence reduction and topological rebuilding.
   */
  simplify(roots?: Point[]): Point[] {
    const targetRoots = roots ?? this.lastUnrollResult?.outputs ?? [];
    if (targetRoots.length === 0) {
      return [];
    }

    const netlist = this.exportNetlist(targetRoots);
    const subst = new Map<number, Point>();
    const simValues = new Map<number, bigint>();
    const MASK = 0xffffffffffffffffn;

    simValues.set(0, 0n);

    const getSim = (p: Point): bigint => {
      const nid = nodeId(p);
      if (!simValues.has(nid)) {
        const internal = this.nodes[nid];
        if (internal && internal.type === 'AND' && internal.left !== undefined && internal.right !== undefined) {
          const sL = getSim(internal.left);
          const sR = getSim(internal.right);
          simValues.set(nid, sL & sR);
        } else {
          simValues.set(nid, 0n);
        }
      }
      const val = simValues.get(nid)!;
      return isNegated(p) ? (~val & MASK) : val;
    };

    const mapPoint = (p: Point): Point => {
      const nid = nodeId(p);
      const target = subst.get(nid);
      const mapped = target !== undefined ? target : makePoint(nid, false);
      return isNegated(p) ? this.not(mapped) : mapped;
    };

    const candidates: Point[] = [this.CONST_FALSE];

    let seed = 0x12345678n;
    const nextRandom = (): bigint => {
      seed = (seed * 6364136223846793005n + 1442695040888963407n) & MASK;
      return seed;
    };

    for (const node of netlist.nodes) {
      if (node.type === 'CONST') {
        subst.set(node.id, this.CONST_FALSE);
        simValues.set(node.id, 0n);
      } else if (node.type === 'INPUT') {
        const pt = makePoint(node.id, false);
        subst.set(node.id, pt);
        const simVal = nextRandom();
        simValues.set(node.id, simVal);
        candidates.push(pt);
      } else if (node.type === 'AND') {
        const internal = this.nodes[node.id];
        const newL = mapPoint(internal.left!);
        const newR = mapPoint(internal.right!);
        let res = this.and(newL, newR);

        if (res === this.CONST_FALSE || res === this.CONST_TRUE) {
          subst.set(node.id, res);
          continue;
        }

        const resSim = getSim(res);
        let matched = false;

        for (const cand of candidates) {
          if (cand === res) {
            matched = true;
            break;
          }
          const candSim = getSim(cand);
          if (candSim === resSim) {
            if (this.areEquivalent(res, cand)) {
              res = cand;
              matched = true;
              break;
            }
          } else if (candSim === (~resSim & MASK)) {
            if (this.areEquivalent(res, this.not(cand))) {
              res = this.not(cand);
              matched = true;
              break;
            }
          }
        }

        if (!matched) {
          candidates.push(res);
        }

        subst.set(node.id, res);
      }
    }

    return targetRoots.map((r) => mapPoint(r));
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
