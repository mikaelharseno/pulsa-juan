import { FlowSession, FlowStep, NodeId } from 'pulsa-juan-common';
import { create } from 'zustand';

interface FlowState {
  sessions: Record<string, FlowSession>;
  start: (segmentId: string, treeVersion: number) => void;
  commit: (segmentId: string, step: FlowStep) => void;
  truncateAt: (segmentId: string, nodeId: NodeId) => void;
  clear: (segmentId: string) => void;
}

// `steps` is the only source of truth; committing a step for a node drops
// everything chosen after it, and focusing a node truncates the same way so
// going back and choosing differently never leaves stale steps behind.
export const useFlowStore = create<FlowState>((set) => ({
  sessions: {},
  start: (segmentId, treeVersion) =>
    set((s) => {
      const existing = s.sessions[segmentId];
      if (existing && existing.treeVersion === treeVersion) return s;
      return { sessions: { ...s.sessions, [segmentId]: { segmentId, treeVersion, steps: [] } } };
    }),
  commit: (segmentId, step) =>
    set((s) => {
      const session = s.sessions[segmentId] ?? { segmentId, treeVersion: 0, steps: [] };
      const idx = session.steps.findIndex((x) => x.nodeId === step.nodeId);
      const steps = idx >= 0 ? [...session.steps.slice(0, idx), step] : [...session.steps, step];
      return { sessions: { ...s.sessions, [segmentId]: { ...session, steps } } };
    }),
  truncateAt: (segmentId, nodeId) =>
    set((s) => {
      const session = s.sessions[segmentId];
      if (!session) return s;
      const idx = session.steps.findIndex((x) => x.nodeId === nodeId);
      if (idx < 0) return s;
      return { sessions: { ...s.sessions, [segmentId]: { ...session, steps: session.steps.slice(0, idx + 1) } } };
    }),
  clear: (segmentId) =>
    set((s) => {
      const { [segmentId]: _drop, ...rest } = s.sessions;
      return { sessions: rest };
    }),
}));

export function useFlowSession(segmentId: string): FlowSession | undefined {
  return useFlowStore((s) => s.sessions[segmentId]);
}
