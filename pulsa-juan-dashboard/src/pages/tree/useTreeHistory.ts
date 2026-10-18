import { SegmentTree } from 'pulsa-juan-common';
import { useCallback, useState } from 'react';

// Flat map makes snapshots cheap: undo/redo is just a stack of trees.
export function useTreeHistory(initial: SegmentTree | null) {
  const [state, setState] = useState<{ past: SegmentTree[]; present: SegmentTree | null; future: SegmentTree[] }>({ past: [], present: initial, future: [] });
  const set = useCallback((next: SegmentTree) => setState((s) => ({ past: s.present ? [...s.past.slice(-49), s.present] : s.past, present: next, future: [] })), []);
  const reset = useCallback((next: SegmentTree | null) => setState({ past: [], present: next, future: [] }), []);
  const undo = useCallback(() => setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: s.present ? [s.present, ...s.future] : s.future } : s)), []);
  const redo = useCallback(() => setState((s) => (s.future.length ? { past: s.present ? [...s.past, s.present] : s.past, present: s.future[0], future: s.future.slice(1) } : s)), []);
  return { tree: state.present, set, reset, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
