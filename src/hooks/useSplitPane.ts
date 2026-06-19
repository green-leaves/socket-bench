import { useCallback, useEffect, useRef } from "react";
import type { WorkspaceState } from "../state/endpoint";

export function useSplitPane(patch: (update: Partial<WorkspaceState>) => void) {
  const splitElRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!draggingRef.current || !splitElRef.current) return;
      const rect = splitElRef.current.getBoundingClientRect();
      const width = event.clientX - rect.left;
      patch({ splitW: Math.max(320, Math.min(rect.width - 360, width)) });
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [patch]);

  const onDragStart = useCallback((event: React.MouseEvent) => {
    draggingRef.current = true;
    event.preventDefault();
  }, []);

  return { splitElRef, onDragStart };
}
