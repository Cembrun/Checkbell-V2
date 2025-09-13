import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import { useSocket } from '../context/SocketProvider';
import { useNavigate } from 'react-router-dom';
import { Handle, Position, useReactFlow } from 'reactflow';
import 'reactflow/dist/style.css';

// Simple demo: three fixed floor/container nodes plus some employee nodes
// start with an empty canvas (user requested no pre-existing fields)
const FIXED_FLOORS = [];
const initialNodes = [];
const initialEdges = [];

export default function EinteilungAnlagenbetreuer() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [rfInstance, setRfInstance] = useState(null);
  const [selection, setSelection] = useState({ nodes: [], edges: [] });
  const [editingLabelFor, setEditingLabelFor] = useState(null);
  const [editingLabelValue, setEditingLabelValue] = useState('');
  const socket = useSocket();
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [showAddInline, setShowAddInline] = useState(false);
  const [newNodeText, setNewNodeText] = useState('');
  const [newNodeType, setNewNodeType] = useState('person');
  const [colorPickerVal, setColorPickerVal] = useState('#2b6cb0');
  const [brightnessVal, setBrightnessVal] = useState(100); // percent
  const [widthVal, setWidthVal] = useState(null);
  const [heightVal, setHeightVal] = useState(null);
  const [fontSizeVal, setFontSizeVal] = useState(null);

  // color helpers (moved early so useEffects can reference applyStyleToNode via onUpdate)
  const hexToRgb = (hex) => {
    const h = hex.replace('#', '');
    const bigint = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
  };
  const getContrastColor = (hex) => {
    try {
      const { r, g, b } = hexToRgb(hex);
      // relative luminance
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return lum > 0.6 ? '#111' : '#fff';
    } catch (e) {
      return '#fff';
    }
  };

  // live update emit (debounced) - define early so other helpers can call it
  const emitTimer = useRef(null);
  const serverSaveTimerRef = useRef(null);
  const emitLayout = useCallback(() => {
    if (emitTimer.current) clearTimeout(emitTimer.current);
    emitTimer.current = setTimeout(() => {
      try {
        if (socket && socket.connected) socket.emit('assignment:update', { nodes, edges });
        localStorage.setItem('einteilung:nodes', JSON.stringify(nodes));
        localStorage.setItem('einteilung:edges', JSON.stringify(edges));
        // debounced server-side persist
        try {
          if (serverSaveTimerRef.current) clearTimeout(serverSaveTimerRef.current);
          serverSaveTimerRef.current = setTimeout(async () => {
            serverSaveTimerRef.current = null;
            try {
              await fetch('/api/einteilung/layout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ nodes, edges }),
              });
            } catch (e) {
              // ignore server save errors for now
            }
          }, 600);
        } catch (e) {}
      } catch (e) {}
    }, 300);
  }, [socket, nodes, edges]);

  // cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (emitTimer.current) clearTimeout(emitTimer.current);
      if (serverSaveTimerRef.current) clearTimeout(serverSaveTimerRef.current);
    };
  }, []);

  const applyStyleToNode = (nodeId, stylePatch) => {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, style: { ...(n.style || {}), ...stylePatch }, data: { ...(n.data || {}), label: n.data?.label } } : n)));
    // emit change quickly
    setTimeout(() => emitLayout(), 0);
  };

  const resetNodeStyle = (nodeId) => {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, style: {}, data: { ...(n.data || {}), label: n.data?.label } } : n)));
    // reset local controls
    setColorPickerVal('#2b6cb0');
    setBrightnessVal(100);
    setWidthVal(null);
    setHeightVal(null);
    setFontSizeVal(null);
    // emit
    setTimeout(() => emitLayout(), 0);
  };

  // helper: get bounding box of a node (uses position + style widths/heights)
  const getNodeBounds = (n) => {
    const x = n.position?.x ?? 0;
    const y = n.position?.y ?? 0;
    const w = n.style && n.style.width ? parseInt(String(n.style.width).replace('px', ''), 10) : n.width || 200;
    const h = n.style && n.style.height ? parseInt(String(n.style.height).replace('px', ''), 10) : n.height || 100;
    return { x1: x, y1: y, x2: x + w, y2: y + h };
  };

  const pointInBounds = (px, py, bounds) => px >= bounds.x1 && px <= bounds.x2 && py >= bounds.y1 && py <= bounds.y2;

  // load saved layout from localStorage if present
  useEffect(() => {
    try {
      const rawN = localStorage.getItem('einteilung:nodes');
      const rawE = localStorage.getItem('einteilung:edges');
      if (rawN) {
        const parsed = JSON.parse(rawN);
        setNodes((parsed || []).map((n) => ({ ...n, type: n.type || 'resizable', data: { ...(n.data || {}), onUpdate: (patch) => applyStyleToNode(n.id, patch) } })));
      }
      if (rawE) setEdges(JSON.parse(rawE));
    } catch (err) {
      // ignore
    }
  }, [setNodes, setEdges]);

  // load server layout if available
  useEffect(() => {
    (async () => {
      setLoadingRemote(true);
      try {
        const res = await fetch('http://localhost:4000/api/einteilung/layout', { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          if (json?.nodes && Array.isArray(json.nodes)) setNodes((json.nodes || []).map((n) => ({ ...n, type: n.type || 'resizable', data: { ...(n.data || {}), onUpdate: (patch) => applyStyleToNode(n.id, patch) } })));
          if (json?.edges && Array.isArray(json.edges)) setEdges(json.edges);
        }
      } catch (e) {}
      setLoadingRemote(false);
    })();
  }, [setNodes, setEdges]);

  const navigate = useNavigate();

  // socket.io client for basic real-time sync
  useEffect(() => {
    if (!socket) return;
    const onAssign = (payload) => {
      try {
        if (payload?.nodes) setNodes((payload.nodes || []).map((n) => ({ ...n, type: 'resizable', data: { ...(n.data || {}), onUpdate: (patch) => applyStyleToNode(n.id, patch) } })));
        if (payload?.edges) setEdges(payload.edges);
      } catch (e) {}
    };
    socket.on('assignment:updated', onAssign);
    // ensure we join the canonical room used by the container UI
    if (socket.connected) socket.emit('joinRoom', 'einteilung:containers');
    else socket.on('connect', () => socket.emit('joinRoom', 'einteilung:containers'));
    return () => {
      socket.off('assignment:updated', onAssign);
    };
  }, [setNodes, setEdges, socket]);

  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  const onNodeDragStop = useCallback((event, node) => {
    // Persist position locally
    setNodes((nds) => nds.map((n) => (n.id === node.id ? { ...n, position: node.position } : n)));
  // no auto-attachment behavior when dragging; simple position persist
    // emit changes
      setTimeout(() => emitLayout(), 0);
    }, [setNodes, setEdges, nodes, emitLayout]);

  const onSelectionChange = useCallback((sel) => {
    setSelection({ nodes: sel.nodes || [], edges: sel.edges || [] });
  }, []);

  const selectedNodeId = selection.nodes && selection.nodes.length === 1 ? selection.nodes[0].id : null;

  // when a single node is selected, sync the picker to its current style
  useEffect(() => {
    if (selectedNodeId) {
      const n = nodes.find((x) => x.id === selectedNodeId);
      if (n) {
        const bg = (n.style && (n.style.background || n.style.backgroundColor)) || n.style?.backgroundColor || '#2b6cb0';
        // normalize rgb -> hex if needed
        if (typeof bg === 'string' && bg.startsWith('rgb')) {
          const m = bg.match(/(\d+),\s*(\d+),\s*(\d+)/);
          if (m) {
            const hex = '#' + [1,2,3].map(i=>Number(m[i]).toString(16).padStart(2,'0')).join('');
            setColorPickerVal(hex);
          }
        } else if (typeof bg === 'string') {
          setColorPickerVal(bg);
        }
        const op = n.style?.opacity ?? 1;
        setBrightnessVal(Math.round((Number(op) || 1) * 100));
        // size
        const px = (v) => {
          if (v === undefined || v === null) return null;
          if (typeof v === 'number') return Math.round(v);
          const m = String(v).match(/(\d+(?:\.\d+)?)/);
          return m ? Math.round(Number(m[1])) : null;
        };
        setWidthVal(px(n.style?.width) || null);
        setHeightVal(px(n.style?.height) || null);
        const fs = px(n.style?.fontSize) || 14;
        setFontSizeVal(fs);
      }
    }
  }, [selectedNodeId]);

  const addNode = (type = 'person', label = null) => {
    const id = String(Date.now());
    const basePos = rfInstance?.project ? rfInstance.project({ x: 100, y: 100 }) : { x: 100 + nodes.length * 10, y: 120 + nodes.length * 10 };
    const newNode = {
      id,
      position: basePos,
  type: 'resizable',
  data: { label: label || (type === 'person' ? 'Neue Person' : type === 'circle' ? 'Kreis' : 'Bereich'), onUpdate: (patch) => applyStyleToNode(id, patch), role: type === 'person' ? 'person' : 'area' },
      style:
        type === 'circle'
          ? { width: 120, height: 120, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }
          : type === 'area'
          ? { width: 200, height: 80, borderRadius: 6, padding: 8 }
          : { padding: 8 },
    };
    setNodes((nds) => nds.concat(newNode));
    // immediate emit
    setTimeout(() => emitLayout(), 0);
    return newNode;
  };

  // ResizableNode component
  function ResizableNode({ id, data, selected }) {
    const rf = useReactFlow();
    const onResize = (dx, dy) => {
      const node = nodes.find((n) => n.id === id);
      if (!node) return;
      // don't allow floors to be resized
      if (node.data?.role === 'floor') return;
      const curW = parseInt(node.style?.width || 120, 10) || 120;
      const curH = parseInt(node.style?.height || 60, 10) || 60;
      const nextW = Math.max(40, curW + dx);
      const nextH = Math.max(24, curH + dy);
      applyStyleToNode(id, { width: `${nextW}px`, height: `${nextH}px` });
    };

    const isFloor = data?.role === 'floor';

    return (
      <div style={{ width: data?.style?.width || undefined, height: data?.style?.height || undefined, padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: data?.style?.background || data?.style?.backgroundColor || undefined, color: data?.style?.color || undefined, position: 'relative' }}>
        <Handle type="target" position={Position.Top} />
        <div style={{ textAlign: 'center', fontSize: data?.style?.fontSize || 14 }}>{data?.label}</div>
        <Handle type="source" position={Position.Bottom} />
        {selected && !isFloor && (
          <div style={{ position: 'absolute', right: 6, bottom: 6, cursor: 'nwse-resize' }}
               onPointerDown={(e) => {
                 const startX = e.clientX;
                 const startY = e.clientY;
                 const onMove = (ev) => {
                   const dx = ev.clientX - startX;
                   const dy = ev.clientY - startY;
                   onResize(dx, dy);
                 };
                 const onUp = () => {
                   window.removeEventListener('pointermove', onMove);
                   window.removeEventListener('pointerup', onUp);
                 };
                 window.addEventListener('pointermove', onMove);
                 window.addEventListener('pointerup', onUp);
               }}
          >◢</div>
        )}
      </div>
    );
  }

  const nodeTypes = { resizable: ResizableNode };

  const editLabel = (nodeId) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setEditingLabelFor(nodeId);
    setEditingLabelValue(node.data?.label || '');
  };

  const deleteSelection = () => {
  const nodeIds = selection.nodes.map((n) => n.id);
  if (nodeIds.length === 0 && selection.edges.length === 0) return;
  setNodes((nds) => nds.filter((n) => !nodeIds.includes(n.id)));
  setEdges((eds) => eds.filter((e) => !selection.edges.map((x) => x.id).includes(e.id) && !nodeIds.includes(e.source) && !nodeIds.includes(e.target)));
    setSelection({ nodes: [], edges: [] });
  setTimeout(() => emitLayout(), 0);
  };

  const saveLayout = () => {
    try {
      localStorage.setItem('einteilung:nodes', JSON.stringify(nodes));
      localStorage.setItem('einteilung:edges', JSON.stringify(edges));
      if (socket && socket.connected) socket.emit('assignment:update', { room: 'einteilung', nodes, edges });
      // Persist server-side as well (if logged in)
      try {
        fetch('http://localhost:4000/api/einteilung/layout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ nodes, edges }),
        });
      } catch (e) {}
      alert('Layout gespeichert');
    } catch (e) {
      alert('Speichern fehlgeschlagen');
    }
  };

  const clearLayout = () => {
    if (!confirm('Layout zurücksetzen?')) return;
    setNodes(initialNodes);
    setEdges(initialEdges);
    localStorage.removeItem('einteilung:nodes');
    localStorage.removeItem('einteilung:edges');
    if (socket && socket.connected) socket.emit('assignment:update', { nodes: initialNodes, edges: initialEdges });
  };

  return (
    <div className="p-4 h-screen">
  {/* Header removed */}

  {/* Bedienfeld für Mindmap entfernt auf Nutzerwunsch */}

      {/* ReactFlow Mindmap entfernt auf Nutzerwunsch */}
    <div />
    </div>
  );
}
