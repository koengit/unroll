// src/point.ts
var CONST_FALSE_NODE = 0;
var CONST_FALSE = 0;
var CONST_TRUE = 1;
function negate(p) {
  return (p ^ 1) >>> 0;
}
function isNegated(p) {
  return (p & 1) === 1;
}
function nodeId(p) {
  return p >>> 1;
}
function makePoint(nodeId2, inverted) {
  return (nodeId2 << 1 | (inverted ? 1 : 0)) >>> 0;
}

// src/solver.ts
import Logic from "logic-solver";
var CircuitSolver = class {
  solver;
  constructor() {
    this.solver = new Logic.Solver();
    this.solver.require(Logic.not("v0"));
  }
  /**
   * Returns the SAT literal expression for a bit-packed Point.
   */
  lit(p) {
    const varName = `v${nodeId(p)}`;
    return isNegated(p) ? Logic.not(varName) : varName;
  }
  /**
   * Registers Tseitin clauses for a newly allocated AND node: z = p1 & p2.
   * Clause 1: v_z => lit(p1)
   * Clause 2: v_z => lit(p2)
   * Clause 3: (lit(p1) & lit(p2)) => v_z
   */
  registerAndNode(z, p1, p2) {
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
  areEquivalent(p1, p2) {
    if (p1 === p2) {
      return true;
    }
    if ((p1 ^ p2) === 1 && nodeId(p1) === nodeId(p2)) {
      return false;
    }
    const lit1 = this.lit(p1);
    const lit2 = this.lit(p2);
    const sol1 = this.solver.solveAssuming(Logic.and(lit1, Logic.not(lit2)));
    if (sol1 !== null) {
      return false;
    }
    const sol2 = this.solver.solveAssuming(Logic.and(Logic.not(lit1), lit2));
    if (sol2 !== null) {
      return false;
    }
    return true;
  }
  /**
   * Directly solves assuming the given formula.
   */
  solveAssuming(formula) {
    return this.solver.solveAssuming(formula);
  }
  /**
   * Exposes the underlying solver instance if needed.
   */
  getRawSolver() {
    return this.solver;
  }
};

// src/circuit.ts
var Circuit = class {
  CONST_FALSE = CONST_FALSE;
  CONST_TRUE = CONST_TRUE;
  nodes = [];
  hashTable = /* @__PURE__ */ new Map();
  solver;
  stats = {
    equivalenceQueries: 0
  };
  lastUnrollResult;
  constructor() {
    this.solver = new CircuitSolver();
    this.nodes.push({ id: 0, type: "CONST" });
  }
  /**
   * Creates a primary or unrolling input point.
   */
  createInput(name) {
    const id = this.nodes.length;
    this.nodes.push({
      id,
      type: "INPUT",
      ...name ? { name } : {}
    });
    return makePoint(id, false);
  }
  /**
   * Logical negation (O(1) bit flip).
   */
  not(p) {
    return negate(p);
  }
  /**
   * Creates or retrieves an existing AND gate with constant propagation and hash-consing.
   */
  and(p1, p2) {
    if (p1 === this.CONST_FALSE || p2 === this.CONST_FALSE) {
      return this.CONST_FALSE;
    }
    if (p1 === this.CONST_TRUE) {
      return p2;
    }
    if (p2 === this.CONST_TRUE) {
      return p1;
    }
    if (p1 === p2) {
      return p1;
    }
    if (p1 === negate(p2)) {
      return this.CONST_FALSE;
    }
    const left = Math.min(p1, p2);
    const right = Math.max(p1, p2);
    const rId = nodeId(right);
    const rNode = this.nodes[rId];
    if (rNode && rNode.type === "AND" && rNode.left !== void 0 && rNode.right !== void 0) {
      if (!isNegated(right)) {
        if (rNode.left === left || rNode.right === left) {
          return right;
        }
        if (rNode.left === negate(left) || rNode.right === negate(left)) {
          return this.CONST_FALSE;
        }
      } else {
        if (rNode.left === left) {
          return this.and(left, negate(rNode.right));
        }
        if (rNode.right === left) {
          return this.and(left, negate(rNode.left));
        }
        if (rNode.left === negate(left) || rNode.right === negate(left)) {
          return left;
        }
      }
    }
    const lId = nodeId(left);
    const lNode = this.nodes[lId];
    if (lNode && lNode.type === "AND" && lNode.left !== void 0 && lNode.right !== void 0) {
      if (!isNegated(left)) {
        if (lNode.left === right || lNode.right === right) {
          return left;
        }
        if (lNode.left === negate(right) || lNode.right === negate(right)) {
          return this.CONST_FALSE;
        }
      } else {
        if (lNode.left === right) {
          return this.and(negate(lNode.right), right);
        }
        if (lNode.right === right) {
          return this.and(negate(lNode.left), right);
        }
        if (lNode.left === negate(right) || lNode.right === negate(right)) {
          return right;
        }
      }
    }
    if (this.areEquivalent(left, right)) {
      return left;
    }
    if (this.areEquivalent(left, negate(right))) {
      return this.CONST_FALSE;
    }
    const key = `${left},${right}`;
    const existing = this.hashTable.get(key);
    if (existing !== void 0) {
      return makePoint(existing, false);
    }
    const newId = this.nodes.length;
    this.nodes.push({
      id: newId,
      type: "AND",
      left,
      right
    });
    this.solver.registerAndNode(newId, left, right);
    this.hashTable.set(key, newId);
    return makePoint(newId, false);
  }
  /**
   * Convenience boolean helper: OR
   */
  or(p1, p2) {
    return this.not(this.and(this.not(p1), this.not(p2)));
  }
  /**
   * Convenience boolean helper: XOR
   */
  xor(p1, p2) {
    return this.or(this.and(p1, this.not(p2)), this.and(this.not(p1), p2));
  }
  /**
   * Convenience boolean helper: Implies (p1 => p2 = ~p1 | p2)
   */
  implies(p1, p2) {
    return this.or(this.not(p1), p2);
  }
  /**
   * Convenience boolean helper: MUX (cond ? thenPoint : elsePoint)
   */
  mux(cond, thenPoint, elsePoint) {
    return this.or(
      this.and(cond, thenPoint),
      this.and(this.not(cond), elsePoint)
    );
  }
  /**
   * Tests whether p1 and p2 must be logically equivalent under all input assignments
   * using incremental SAT assumptions.
   */
  areEquivalent(p1, p2) {
    this.stats.equivalenceQueries++;
    return this.solver.areEquivalent(p1, p2);
  }
  /**
   * Unrolls the logic loop from `unrollInputs` to `unrollOutputs`.
   * Stops when all outputs stabilize (reach a fixpoint) or when maxK iterations are reached.
   */
  unroll(unrollInputs, unrollOutputs, initValues, maxK) {
    if (unrollInputs.length !== unrollOutputs.length || unrollInputs.length !== initValues.length) {
      throw new Error("unrollInputs, unrollOutputs, and initValues must have the same length");
    }
    let currentOutputs = [...initValues];
    const n = unrollInputs.length;
    for (let step = 1; step <= maxK; step++) {
      const memo = /* @__PURE__ */ new Map();
      for (let i = 0; i < n; i++) {
        memo.set(unrollInputs[i], currentOutputs[i]);
        memo.set(this.not(unrollInputs[i]), this.not(currentOutputs[i]));
      }
      const copyPoint = (p) => {
        if (memo.has(p)) {
          return memo.get(p);
        }
        if (memo.has(this.not(p))) {
          return this.not(memo.get(this.not(p)));
        }
        const nId = nodeId(p);
        const node = this.nodes[nId];
        if (!node || node.type === "CONST" || node.type === "INPUT") {
          return p;
        }
        if (node.type === "AND") {
          const newL = copyPoint(node.left);
          const newR = copyPoint(node.right);
          const andRes = this.and(newL, newR);
          const res = isNegated(p) ? this.not(andRes) : andRes;
          memo.set(p, res);
          memo.set(this.not(p), this.not(res));
          return res;
        }
        return p;
      };
      const nextOutputs = unrollOutputs.map((o) => copyPoint(o));
      let allStabilized = true;
      for (let i = 0; i < n; i++) {
        if (this.areEquivalent(nextOutputs[i], currentOutputs[i])) {
          nextOutputs[i] = currentOutputs[i];
        } else {
          allStabilized = false;
        }
      }
      if (allStabilized) {
        this.lastUnrollResult = {
          step,
          stabilized: true,
          outputs: currentOutputs
        };
        return currentOutputs;
      }
      currentOutputs = nextOutputs;
    }
    this.lastUnrollResult = {
      step: maxK,
      stabilized: false,
      outputs: currentOutputs
    };
    return currentOutputs;
  }
  /**
   * Exports a topologically sorted netlist containing only gates reachable from the given root points.
   */
  exportNetlist(roots) {
    const visited = /* @__PURE__ */ new Set();
    const orderedNodes = [];
    const visit = (nid) => {
      if (visited.has(nid)) {
        return;
      }
      visited.add(nid);
      const internal = this.nodes[nid];
      if (!internal) {
        return;
      }
      if (internal.type === "AND") {
        if (internal.left !== void 0) {
          visit(nodeId(internal.left));
        }
        if (internal.right !== void 0) {
          visit(nodeId(internal.right));
        }
        orderedNodes.push({
          id: internal.id,
          type: "AND",
          left: {
            nodeId: nodeId(internal.left),
            inverted: isNegated(internal.left)
          },
          right: {
            nodeId: nodeId(internal.right),
            inverted: isNegated(internal.right)
          }
        });
      } else if (internal.type === "INPUT") {
        orderedNodes.push({
          id: internal.id,
          type: "INPUT",
          ...internal.name ? { name: internal.name } : {}
        });
      } else if (internal.type === "CONST") {
        orderedNodes.push({
          id: internal.id,
          type: "CONST"
        });
      }
    };
    for (const root of roots) {
      visit(nodeId(root));
    }
    return {
      nodes: orderedNodes,
      roots: [...roots]
    };
  }
  /**
   * Returns internal node by ID.
   */
  getNode(id) {
    return this.nodes[id];
  }
  /**
   * Returns total number of allocated nodes.
   */
  getNodeCount() {
    return this.nodes.length;
  }
};

// src/visualizer/dot.ts
function exportDot(netlist, options = {}) {
  const lines = [];
  lines.push("digraph Netlist {");
  lines.push("  rankdir=LR;");
  lines.push('  node [fontname="sans-serif", fontsize=10];');
  lines.push('  edge [fontname="sans-serif", fontsize=9];');
  if (options.title) {
    lines.push('  labelloc="t";');
    lines.push(`  label="${options.title.replace(/"/g, '\\"')}";`);
  }
  for (const node of netlist.nodes) {
    if (node.type === "INPUT") {
      const label = node.name ? options.showNodeIds ? `${node.name} (${node.id})` : node.name : `in_${node.id}`;
      lines.push(`  n_${node.id} [shape=box, style=filled, fillcolor="#e1f5fe", color="#0288d1", label="${label}"];`);
    } else if (node.type === "CONST") {
      lines.push(`  n_${node.id} [shape=doublecircle, style=filled, fillcolor="#eeeeee", color="#757575", label="0"];`);
    } else if (node.type === "AND") {
      const label = options.showNodeIds ? `&\\n(${node.id})` : "&";
      lines.push(`  n_${node.id} [shape=ellipse, style=filled, fillcolor="#ffffff", color="#333333", label="${label}"];`);
    }
  }
  for (const node of netlist.nodes) {
    if (node.type === "AND") {
      if (node.left) {
        const edgeAttrs = node.left.inverted ? 'color="#d32f2f", arrowhead=dot' : 'color="#111827", arrowhead=normal';
        lines.push(`  n_${node.left.nodeId} -> n_${node.id} [${edgeAttrs}];`);
      }
      if (node.right) {
        const edgeAttrs = node.right.inverted ? 'color="#d32f2f", arrowhead=dot' : 'color="#111827", arrowhead=normal';
        lines.push(`  n_${node.right.nodeId} -> n_${node.id} [${edgeAttrs}];`);
      }
    }
  }
  netlist.roots.forEach((root, idx) => {
    const rootNid = nodeId(root);
    const rootInv = isNegated(root);
    const outName = `out_${idx}`;
    lines.push(`  ${outName} [shape=doubleoctagon, style=filled, fillcolor="#f3e8ff", color="#7e22ce", label="Output ${idx}"];`);
    const edgeAttrs = rootInv ? 'color="#d32f2f", arrowhead=dot' : 'color="#111827", arrowhead=normal';
    lines.push(`  n_${rootNid} -> ${outName} [${edgeAttrs}];`);
  });
  lines.push("}");
  return lines.join("\n");
}

// src/visualizer/svg.ts
function exportSvg(netlist, options = {}) {
  const colSpacing = options.columnSpacing ?? 140;
  const rowSpacing = options.rowSpacing ?? 70;
  const pad = options.padding ?? 40;
  const levelMap = /* @__PURE__ */ new Map();
  for (const node of netlist.nodes) {
    if (node.type === "CONST" || node.type === "INPUT") {
      levelMap.set(node.id, 0);
    } else if (node.type === "AND") {
      const lLev = levelMap.get(node.left?.nodeId ?? 0) ?? 0;
      const rLev = levelMap.get(node.right?.nodeId ?? 0) ?? 0;
      levelMap.set(node.id, Math.max(lLev, rLev) + 1);
    }
  }
  const columns = /* @__PURE__ */ new Map();
  let maxGateLevel = 0;
  for (const node of netlist.nodes) {
    const lev = levelMap.get(node.id) ?? 0;
    if (lev > maxGateLevel) {
      maxGateLevel = lev;
    }
    if (!columns.has(lev)) {
      columns.set(lev, []);
    }
    columns.get(lev).push(node);
  }
  const rootColIndex = maxGateLevel + 1;
  const nodePositions = /* @__PURE__ */ new Map();
  const rootPositions = [];
  let maxRows = netlist.roots.length;
  for (const [, colNodes] of columns.entries()) {
    if (colNodes.length > maxRows) {
      maxRows = colNodes.length;
    }
  }
  maxRows = Math.max(maxRows, 1);
  const headerHeight = options.title ? 45 : 0;
  const contentHeight = maxRows * rowSpacing;
  const totalHeight = headerHeight + pad * 2 + contentHeight;
  for (const [colIndex, colNodes] of columns.entries()) {
    const colX = pad + colIndex * colSpacing;
    const colCount = colNodes.length;
    const startY = headerHeight + pad + (contentHeight - colCount * rowSpacing) / 2;
    colNodes.forEach((node, rowIdx) => {
      const y = startY + rowIdx * rowSpacing + (rowSpacing - 36) / 2;
      const width = node.type === "INPUT" ? 80 : node.type === "CONST" ? 44 : 50;
      const height = node.type === "CONST" ? 44 : 36;
      nodePositions.set(node.id, { x: colX, y, width, height });
    });
  }
  const rootColX = pad + rootColIndex * colSpacing;
  const rootCount = netlist.roots.length;
  const rootStartY = headerHeight + pad + (contentHeight - rootCount * rowSpacing) / 2;
  netlist.roots.forEach((_, idx) => {
    const y = rootStartY + idx * rowSpacing + (rowSpacing - 32) / 2;
    rootPositions.push({ x: rootColX, y, width: 80, height: 32 });
  });
  const totalWidth = pad * 2 + (rootColIndex + 1) * colSpacing;
  const svgParts = [];
  svgParts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}">`
  );
  svgParts.push(`  <defs>
    <style>
      .title { font-family: system-ui, -apple-system, sans-serif; font-size: 16px; font-weight: 600; fill: #111827; }
      .lbl { font-family: system-ui, -apple-system, sans-serif; font-size: 11px; fill: #1f2937; dominant-baseline: central; text-anchor: middle; }
      .sublbl { font-family: system-ui, -apple-system, sans-serif; font-size: 8px; fill: #6b7280; text-anchor: middle; }
      .gate-and { fill: #ffffff; stroke: #374151; stroke-width: 1.5; }
      .gate-in { fill: #e1f5fe; stroke: #0288d1; stroke-width: 1.5; rx: 6px; }
      .gate-const { fill: #eeeeee; stroke: #757575; stroke-width: 1.5; }
      .gate-out { fill: #f3e8ff; stroke: #7e22ce; stroke-width: 1.5; rx: 6px; }
      .wire { fill: none; stroke: #374151; stroke-width: 1.75; stroke-linecap: round; }
      .wire-inv { fill: none; stroke: #d32f2f; stroke-width: 1.75; stroke-linecap: round; }
      .bubble { fill: #ffffff; stroke: #d32f2f; stroke-width: 1.5; }
    </style>
  </defs>`);
  svgParts.push(`  <rect width="100%" height="100%" fill="#fafafa" rx="8"/>`);
  if (options.title) {
    svgParts.push(`  <text x="${pad}" y="${pad + 10}" class="title">${escapeXml(options.title)}</text>`);
  }
  const drawWire = (x1, y1, x2, y2, inverted) => {
    const dx = Math.max(20, (x2 - x1) * 0.45);
    const targetX = inverted ? x2 - 8 : x2;
    const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${targetX - dx} ${y2}, ${targetX} ${y2}`;
    const wireClass = inverted ? "wire-inv" : "wire";
    svgParts.push(`  <path d="${path}" class="${wireClass}"/>`);
    if (inverted) {
      svgParts.push(`  <circle cx="${x2 - 4}" cy="${y2}" r="3.5" class="bubble"/>`);
    }
  };
  for (const node of netlist.nodes) {
    if (node.type === "AND") {
      const tgtPos = nodePositions.get(node.id);
      const tgtInput1Y = tgtPos.y + tgtPos.height * 0.3;
      const tgtInput2Y = tgtPos.y + tgtPos.height * 0.7;
      if (node.left) {
        const srcPos = nodePositions.get(node.left.nodeId);
        if (srcPos) {
          const srcX = srcPos.x + srcPos.width;
          const srcY = srcPos.y + srcPos.height / 2;
          drawWire(srcX, srcY, tgtPos.x, tgtInput1Y, node.left.inverted);
        }
      }
      if (node.right) {
        const srcPos = nodePositions.get(node.right.nodeId);
        if (srcPos) {
          const srcX = srcPos.x + srcPos.width;
          const srcY = srcPos.y + srcPos.height / 2;
          drawWire(srcX, srcY, tgtPos.x, tgtInput2Y, node.right.inverted);
        }
      }
    }
  }
  netlist.roots.forEach((root, idx) => {
    const rootNid = nodeId(root);
    const rootInv = isNegated(root);
    const srcPos = nodePositions.get(rootNid);
    const tgtPos = rootPositions[idx];
    if (srcPos && tgtPos) {
      const srcX = srcPos.x + srcPos.width;
      const srcY = srcPos.y + srcPos.height / 2;
      const tgtY = tgtPos.y + tgtPos.height / 2;
      drawWire(srcX, srcY, tgtPos.x, tgtY, rootInv);
    }
  });
  for (const node of netlist.nodes) {
    const pos = nodePositions.get(node.id);
    const centerX = pos.x + pos.width / 2;
    const centerY = pos.y + pos.height / 2;
    if (node.type === "INPUT") {
      const label = node.name || `in_${node.id}`;
      svgParts.push(
        `  <rect x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" class="gate-in"/>`
      );
      svgParts.push(
        `  <text x="${centerX}" y="${centerY}" class="lbl">${escapeXml(label)}</text>`
      );
    } else if (node.type === "CONST") {
      const r = pos.width / 2;
      svgParts.push(
        `  <circle cx="${centerX}" cy="${centerY}" r="${r}" class="gate-const"/>`
      );
      svgParts.push(
        `  <circle cx="${centerX}" cy="${centerY}" r="${r - 4}" class="gate-const"/>`
      );
      svgParts.push(
        `  <text x="${centerX}" y="${centerY}" class="lbl">0</text>`
      );
    } else if (node.type === "AND") {
      svgParts.push(
        `  <ellipse cx="${centerX}" cy="${centerY}" rx="${pos.width / 2}" ry="${pos.height / 2}" class="gate-and"/>`
      );
      svgParts.push(
        `  <text x="${centerX}" y="${centerY - 2}" class="lbl" font-weight="bold">&amp;</text>`
      );
      svgParts.push(
        `  <text x="${centerX}" y="${centerY + 10}" class="sublbl">#${node.id}</text>`
      );
    }
  }
  netlist.roots.forEach((_, idx) => {
    const pos = rootPositions[idx];
    const centerX = pos.x + pos.width / 2;
    const centerY = pos.y + pos.height / 2;
    svgParts.push(
      `  <rect x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" class="gate-out"/>`
    );
    svgParts.push(
      `  <text x="${centerX}" y="${centerY}" class="lbl">out[${idx}]</text>`
    );
  });
  svgParts.push(`</svg>`);
  return svgParts.join("\n");
}
function escapeXml(unsafe) {
  return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
export {
  CONST_FALSE,
  CONST_FALSE_NODE,
  CONST_TRUE,
  Circuit,
  CircuitSolver,
  exportDot,
  exportSvg,
  isNegated,
  makePoint,
  negate,
  nodeId
};
