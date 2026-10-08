import { Netlist } from '../types.js';
import { nodeId, isNegated } from '../point.js';

export interface DotOptions {
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
export function exportDot(netlist: Netlist, options: DotOptions = {}): string {
  const lines: string[] = [];
  lines.push('digraph Netlist {');
  lines.push('  rankdir=LR;');
  lines.push('  node [fontname="sans-serif", fontsize=10];');
  lines.push('  edge [fontname="sans-serif", fontsize=9];');

  if (options.title) {
    lines.push('  labelloc="t";');
    lines.push(`  label="${options.title.replace(/"/g, '\\"')}";`);
  }

  // Nodes
  for (const node of netlist.nodes) {
    if (node.type === 'INPUT') {
      const label = node.name ? (options.showNodeIds ? `${node.name} (${node.id})` : node.name) : `in_${node.id}`;
      lines.push(`  n_${node.id} [shape=box, style=filled, fillcolor="#e1f5fe", color="#0288d1", label="${label}"];`);
    } else if (node.type === 'CONST') {
      lines.push(`  n_${node.id} [shape=doublecircle, style=filled, fillcolor="#eeeeee", color="#757575", label="0"];`);
    } else if (node.type === 'AND') {
      const label = options.showNodeIds ? `&\\n(${node.id})` : '&';
      lines.push(`  n_${node.id} [shape=ellipse, style=filled, fillcolor="#ffffff", color="#333333", label="${label}"];`);
    }
  }

  // AND edges
  for (const node of netlist.nodes) {
    if (node.type === 'AND') {
      if (node.left) {
        const edgeAttrs = node.left.inverted
          ? 'color="#d32f2f", arrowhead=dot'
          : 'color="#111827", arrowhead=normal';
        lines.push(`  n_${node.left.nodeId} -> n_${node.id} [${edgeAttrs}];`);
      }
      if (node.right) {
        const edgeAttrs = node.right.inverted
          ? 'color="#d32f2f", arrowhead=dot'
          : 'color="#111827", arrowhead=normal';
        lines.push(`  n_${node.right.nodeId} -> n_${node.id} [${edgeAttrs}];`);
      }
    }
  }

  // Root output terminals
  netlist.roots.forEach((root, idx) => {
    const rootNid = nodeId(root);
    const rootInv = isNegated(root);
    const outName = `out_${idx}`;
    lines.push(`  ${outName} [shape=doubleoctagon, style=filled, fillcolor="#f3e8ff", color="#7e22ce", label="Output ${idx}"];`);
    const edgeAttrs = rootInv
      ? 'color="#d32f2f", arrowhead=dot'
      : 'color="#111827", arrowhead=normal';
    lines.push(`  n_${rootNid} -> ${outName} [${edgeAttrs}];`);
  });

  lines.push('}');
  return lines.join('\n');
}
