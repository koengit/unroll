import { Point } from './types.js';

export const CONST_FALSE_NODE = 0;
export const CONST_FALSE: Point = 0; // (0 << 1) | 0
export const CONST_TRUE: Point = 1;  // (0 << 1) | 1

/** Logical negation (O(1) bit flip) */
export function negate(p: Point): Point {
  return (p ^ 1) >>> 0;
}

/** Check whether point has inverted flag set */
export function isNegated(p: Point): boolean {
  return (p & 1) === 1;
}

/** Extract node ID from bit-packed point */
export function nodeId(p: Point): number {
  return p >>> 1;
}

/** Construct bit-packed point from node ID and inversion flag */
export function makePoint(nodeId: number, inverted: boolean): Point {
  return ((nodeId << 1) | (inverted ? 1 : 0)) >>> 0;
}
