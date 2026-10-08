declare module 'logic-solver' {
  export class Solver {
    require(formula: any): void;
    forbid(formula: any): void;
    solve(assumpVar?: any): any;
    solveAssuming(formula: any): any;
  }

  export function not(operand: any): any;
  export function and(...operands: any[]): any;
  export function or(...operands: any[]): any;
  export function xor(...operands: any[]): any;
  export function implies(f1: any, f2: any): any;
  export function equiv(f1: any, f2: any): any;

  interface LogicDefault {
    Solver: typeof Solver;
    not: typeof not;
    and: typeof and;
    or: typeof or;
    xor: typeof xor;
    implies: typeof implies;
    equiv: typeof equiv;
    [key: string]: any;
  }

  const logicDefault: LogicDefault;
  export default logicDefault;
}
