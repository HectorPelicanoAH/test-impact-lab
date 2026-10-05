import { useState } from 'react';
import type { DemoFile } from '../types';

interface TreeNode { name: string; path?: string; children: Map<string, TreeNode> }

function buildTree(files: DemoFile[]) {
  const root: TreeNode = { name: '', children: new Map() };
  for (const file of files) {
    let current = root;
    const parts = file.path.split('/');
    parts.forEach((part, index) => {
      const child = current.children.get(part) ?? { name: part, children: new Map<string, TreeNode>() };
      if (index === parts.length - 1) child.path = file.path;
      current.children.set(part, child);
      current = child;
    });
  }
  return root;
}

function Branch({ node, selected, modified, onSelect, depth = 0 }: {
  node: TreeNode; selected: string; modified: Set<string>; onSelect: (path: string) => void; depth?: number;
}) {
  const entries = [...node.children.values()].sort((a, b) => Number(Boolean(a.path)) - Number(Boolean(b.path)) || a.name.localeCompare(b.name));
  return <>{entries.map(child => child.path
    ? <button key={child.path} className={`tree-file ${selected === child.path ? 'active' : ''}`} style={{ paddingLeft: 12 + depth * 14 }} onClick={() => onSelect(child.path!)}>
      <span>{child.name}</span>{modified.has(child.path) && <i aria-label="modified" />}
    </button>
    : <TreeFolder key={`${depth}:${child.name}`} node={child} selected={selected} modified={modified} onSelect={onSelect} depth={depth} />)}</>;
}

function TreeFolder({ node, selected, modified, onSelect, depth }: {
  node: TreeNode; selected: string; modified: Set<string>; onSelect: (path: string) => void; depth: number;
}) {
  const [expanded, setExpanded] = useState(true);
  return <div className="tree-branch"><button className="tree-folder" style={{ paddingLeft: 10 + depth * 14 }} onClick={() => setExpanded(value => !value)} aria-expanded={expanded}><span>{expanded ? '⌄' : '›'}</span>{node.name}</button>
    {expanded && <Branch node={node} selected={selected} modified={modified} onSelect={onSelect} depth={depth + 1} />}
  </div>;
}

export function RepositoryTree(props: { files: DemoFile[]; selected: string; modified: Set<string>; onSelect: (path: string) => void }) {
  return <aside className="repo-tree panel"><div className="panel-title">REPOSITORY</div><Branch node={buildTree(props.files)} {...props} /></aside>;
}
