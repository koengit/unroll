import { Solver } from 'logic-solver';

type Point = number;
interface NetlistNode {
    id: number;
    type: 'CONST' | 'INPUT' | 'AND';
    name?: string;
    left?: {
        nodeId: number;
        inverted: boolean;
    };
    right?: {
        nodeId: number;
        inverted: boolean;
    };
}
interface Netlist {
    nodes: NetlistNode[];
    roots: Point[];
}
interface InternalNode {
    id: number;
    type: 'CONST' | 'INPUT' | 'AND';
    name?: string;
    left?: Point;
    right?: Point;
}
interface UnrollResult {
    step: number;
    stabilized: boolean;
    outputs: Point[];
}

declare const CONST_FALSE_NODE = 0;
declare const CONST_FALSE: Point;
declare const CONST_TRUE: Point;
/** Logical negation (O(1) bit flip) */
declare function negate(p: Point): Point;
/** Check whether point has inverted flag set */
declare function isNegated(p: Point): boolean;
/** Extract node ID from bit-packed point */
declare function nodeId(p: Point): number;
/** Construct bit-packed point from node ID and inversion flag */
declare function makePoint(nodeId: number, inverted: boolean): Point;

declare class CircuitSolver {
    private solver;
    constructor();
    /**
     * Returns the SAT literal expression for a bit-packed Point.
     */
    lit(p: Point): any;
    /**
     * Registers Tseitin clauses for a newly allocated AND node: z = p1 & p2.
     * Clause 1: v_z => lit(p1)
     * Clause 2: v_z => lit(p2)
     * Clause 3: (lit(p1) & lit(p2)) => v_z
     */
    registerAndNode(z: number, p1: Point, p2: Point): void;
    /**
     * Tests whether p1 and p2 must be logically equivalent under all input assignments
     * using incremental SAT assumptions.
     */
    areEquivalent(p1: Point, p2: Point): boolean;
    /**
     * Directly solves assuming the given formula.
     */
    solveAssuming(formula: any): any;
    /**
     * Exposes the underlying solver instance if needed.
     */
    getRawSolver(): Solver;
}

declare class Circuit {
    readonly CONST_FALSE: Point;
    readonly CONST_TRUE: Point;
    private nodes;
    private hashTable;
    private solver;
    stats: {
        equivalenceQueries: number;
    };
    lastUnrollResult?: UnrollResult;
    constructor();
    /**
     * Creates a primary or unrolling input point.
     */
    createInput(name?: string): Point;
    /**
     * Logical negation (O(1) bit flip).
     */
    not(p: Point): Point;
    /**
     * Creates or retrieves an existing AND gate with constant propagation and hash-consing.
     */
    and(p1: Point, p2: Point): Point;
    /**
     * Convenience boolean helper: OR
     */
    or(p1: Point, p2: Point): Point;
    /**
     * Convenience boolean helper: XOR
     */
    xor(p1: Point, p2: Point): Point;
    /**
     * Convenience boolean helper: Implies (p1 => p2 = ~p1 | p2)
     */
    implies(p1: Point, p2: Point): Point;
    /**
     * Convenience boolean helper: MUX (cond ? thenPoint : elsePoint)
     */
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
    unroll(unrollInputs: Point[], unrollOutputs: Point[], initValues: Point[], maxK: number): Point[];
    /**
     * Exports a topologically sorted netlist containing only gates reachable from the given root points.
     */
    exportNetlist(roots: Point[]): Netlist;
    /**
     * Returns internal node by ID.
     */
    getNode(id: number): InternalNode | undefined;
    /**
     * Returns total number of allocated nodes.
     */
    getNodeCount(): number;
}

interface DotOptions {
    title?: string;
    showNodeIds?: boolean;
}
/**
 * Converts a Netlist into Graphviz DOT format.
 * - INPUT: Green boxes (shape=box, style=filled, fillcolor="#e1f5fe")
 * - CONST: Gray double circles (shape=doublecircle, fillcolor="#eeeeee")
 * - AND: White ovals (shape=ellipse, label="&")
 * - Regular edges: Solid black lines (arrowhead=normal)
 * - Inverted edges: Red lines with dot bubble (color="#d32f2f", arrowhead=dot)
 */
declare function exportDot(netlist: Netlist, options?: DotOptions): string;

interface SvgOptions {
    title?: string;
    columnSpacing?: number;
    rowSpacing?: number;
    padding?: number;
}
/**
 * Zero-dependency SVG generator.
 * Computes horizontal levels by topological distance from inputs.
 * Layout: Inputs/CONST on the left column, intermediate gates in middle columns, root points on the right.
 * Renders clear logic gates, wire lines, and invert bubbles.
 */
declare function exportSvg(netlist: Netlist, options?: SvgOptions): string;

export { CONST_FALSE, CONST_FALSE_NODE, CONST_TRUE, Circuit, CircuitSolver, type DotOptions, type InternalNode, type Netlist, type NetlistNode, type Point, type SvgOptions, type UnrollResult, exportDot, exportSvg, isNegated, makePoint, negate, nodeId };
