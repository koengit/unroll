import { Netlist, NetlistNode } from '../types.js';
import { nodeId, isNegated } from '../point.js';

export interface SvgOptions {
  title?: string;
  columnSpacing?: number;
  rowSpacing?: number;
  padding?: number;
}

interface Position {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Zero-dependency SVG generator.
 * Computes horizontal levels by topological distance from inputs.
 * Layout: Inputs/CONST on the left column, intermediate gates in middle columns, root points on the right.
 * Renders clear logic gates, wire lines, and invert bubbles.
 */
export function exportSvg(netlist: Netlist, options: SvgOptions = {}): string {
  const colSpacing = options.columnSpacing ?? 140;
  const rowSpacing = options.rowSpacing ?? 70;
  const pad = options.padding ?? 40;

  // 1. Compute topological level for each node
  const levelMap = new Map<number, number>();
  for (const node of netlist.nodes) {
    if (node.type === 'CONST' || node.type === 'INPUT') {
      levelMap.set(node.id, 0);
    } else if (node.type === 'AND') {
      const lLev = levelMap.get(node.left?.nodeId ?? 0) ?? 0;
      const rLev = levelMap.get(node.right?.nodeId ?? 0) ?? 0;
      levelMap.set(node.id, Math.max(lLev, rLev) + 1);
    }
  }

  // 2. Group nodes by level
  const columns = new Map<number, NetlistNode[]>();
  let maxGateLevel = 0;
  for (const node of netlist.nodes) {
    const lev = levelMap.get(node.id) ?? 0;
    if (lev > maxGateLevel) {
      maxGateLevel = lev;
    }
    if (!columns.has(lev)) {
      columns.set(lev, []);
    }
    columns.get(lev)!.push(node);
  }

  const rootColIndex = maxGateLevel + 1;

  // 3. Calculate layout positions
  const nodePositions = new Map<number, Position>();
  const rootPositions: Position[] = [];

  // Determine max rows in any column to center or size vertically
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

  // Position nodes
  for (const [colIndex, colNodes] of columns.entries()) {
    const colX = pad + colIndex * colSpacing;
    const colCount = colNodes.length;
    const startY = headerHeight + pad + (contentHeight - colCount * rowSpacing) / 2;

    colNodes.forEach((node, rowIdx) => {
      const y = startY + rowIdx * rowSpacing + (rowSpacing - 36) / 2;
      const width = node.type === 'INPUT' ? 80 : node.type === 'CONST' ? 44 : 50;
      const height = node.type === 'CONST' ? 44 : 36;
      nodePositions.set(node.id, { x: colX, y, width, height });
    });
  }

  // Position roots in the final column
  const rootColX = pad + rootColIndex * colSpacing;
  const rootCount = netlist.roots.length;
  const rootStartY = headerHeight + pad + (contentHeight - rootCount * rowSpacing) / 2;
  netlist.roots.forEach((_, idx) => {
    const y = rootStartY + idx * rowSpacing + (rowSpacing - 32) / 2;
    rootPositions.push({ x: rootColX, y, width: 80, height: 32 });
  });

  const totalWidth = pad * 2 + (rootColIndex + 1) * colSpacing;

  // 4. Generate SVG output
  const svgParts: string[] = [];
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

  // Optional background
  svgParts.push(`  <rect width="100%" height="100%" fill="#fafafa" rx="8"/>`);

  if (options.title) {
    svgParts.push(`  <text x="${pad}" y="${pad + 10}" class="title">${escapeXml(options.title)}</text>`);
  }

  // Wires helper
  const drawWire = (x1: number, y1: number, x2: number, y2: number, inverted: boolean) => {
    const dx = Math.max(20, (x2 - x1) * 0.45);
    const targetX = inverted ? x2 - 8 : x2;
    const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${targetX - dx} ${y2}, ${targetX} ${y2}`;
    const wireClass = inverted ? 'wire-inv' : 'wire';
    svgParts.push(`  <path d="${path}" class="${wireClass}"/>`);
    if (inverted) {
      svgParts.push(`  <circle cx="${x2 - 4}" cy="${y2}" r="3.5" class="bubble"/>`);
    }
  };

  // 5. Draw Wires between gates
  for (const node of netlist.nodes) {
    if (node.type === 'AND') {
      const tgtPos = nodePositions.get(node.id)!;
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

  // Draw Wires to roots
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

  // 6. Draw Nodes
  for (const node of netlist.nodes) {
    const pos = nodePositions.get(node.id)!;
    const centerX = pos.x + pos.width / 2;
    const centerY = pos.y + pos.height / 2;

    if (node.type === 'INPUT') {
      const label = node.name || `in_${node.id}`;
      svgParts.push(
        `  <rect x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" class="gate-in"/>`
      );
      svgParts.push(
        `  <text x="${centerX}" y="${centerY}" class="lbl">${escapeXml(label)}</text>`
      );
    } else if (node.type === 'CONST') {
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
    } else if (node.type === 'AND') {
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

  // Draw Roots
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
  return svgParts.join('\n');
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
