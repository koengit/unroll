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

export interface InternalNode {
  id: number;
  type: 'CONST' | 'INPUT' | 'AND';
  name?: string;
  left?: Point;
  right?: Point;
}

export interface UnrollResult {
  step: number;
  stabilized: boolean;
  outputs: Point[];
}
