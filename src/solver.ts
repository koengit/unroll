import Logic, { Solver } from 'logic-solver';
import { Point } from './types.js';
import { nodeId, isNegated } from './point.js';

export class CircuitSolver {
  private solver: Solver;

  constructor() {
    this.solver = new Logic.Solver();
    // Constant node 0 is permanently fixed to false
    this.solver.require(Logic.not('v0'));
  }

  /**
   * Returns the SAT literal expression for a bit-packed Point.
   */
  lit(p: Point): any {
    const varName = `v${nodeId(p)}`;
    return isNegated(p) ? Logic.not(varName) : varName;
  }

  /**
   * Registers Tseitin clauses for a newly allocated AND node: z = p1 & p2.
   * Clause 1: v_z => lit(p1)
   * Clause 2: v_z => lit(p2)
   * Clause 3: (lit(p1) & lit(p2)) => v_z
   */
  registerAndNode(z: number, p1: Point, p2: Point): void {
    const varZ = `v${z}`;
    const lit1 = this.lit(p1);
    const lit2 = this.lit(p2);

    this.solver.require(Logic.implies(varZ, lit1));
    this.solver.require(Logic.implies(varZ, lit2));
    this.solver.require(Logic.implies(Logic.and(lit1, lit2), varZ));
  }

  /**
   * Tests whether p1 and p2 must be logically equivalent under all input assignments
   * using incremental SAT assumptions.
   */
  areEquivalent(p1: Point, p2: Point): boolean {
    if (p1 === p2) {
      return true;
    }
    if ((p1 ^ p2) === 1 && nodeId(p1) === nodeId(p2)) {
      return false;
    }

    const lit1 = this.lit(p1);
    const lit2 = this.lit(p2);

    // Direction 1: p1 AND NOT p2
    const sol1 = this.solver.solveAssuming(Logic.and(lit1, Logic.not(lit2)));
    if (sol1 !== null) {
      return false;
    }

    // Direction 2: NOT p1 AND p2
    const sol2 = this.solver.solveAssuming(Logic.and(Logic.not(lit1), lit2));
    if (sol2 !== null) {
      return false;
    }

    return true;
  }

  /**
   * Directly solves assuming the given formula.
   */
  solveAssuming(formula: any): any {
    return this.solver.solveAssuming(formula);
  }

  /**
   * Exposes the underlying solver instance if needed.
   */
  getRawSolver(): Solver {
    return this.solver;
  }
}
