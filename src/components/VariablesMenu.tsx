import { useEffect, useRef, useState } from "react";
import { MONO } from "../styles";
import { VARIABLES } from "../lib/templating";

interface Props {
  onInsert: (token: string) => void;
}

/** Small "{{ }} Vars" button that drops a list of dynamic variables; picking one
    inserts its token into the associated editor at the cursor. */
export function VariablesMenu({ onInsert }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: "none" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="sb-fmt-btn"
        title="Insert a dynamic variable"
        style={{
          background: "transparent",
          border: "1px solid #2a3340",
          borderRadius: "6px",
          padding: "4px 9px",
          color: "#8a93a4",
          font: "600 10px 'IBM Plex Sans'",
          cursor: "pointer",
        }}
      >
        {"{{ }}"} Vars
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 20,
            width: "262px",
            background: "#0c0f15",
            border: "1px solid #2a3340",
            borderRadius: "8px",
            padding: "5px",
            boxShadow: "0 10px 28px rgba(0,0,0,.45)",
          }}
        >
          {VARIABLES.map((variable) => (
            <button
              key={variable.insert}
              type="button"
              onClick={() => {
                onInsert(variable.insert);
                setOpen(false);
              }}
              className="sb-var-row"
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                borderRadius: "6px",
                padding: "6px 8px",
                cursor: "pointer",
              }}
            >
              <span style={{ font: "600 11px " + MONO, color: "#7ee0b5" }}>{variable.insert}</span>
              <span
                style={{
                  display: "block",
                  font: "10.5px 'IBM Plex Sans'",
                  color: "#6b7480",
                  marginTop: "1px",
                }}
              >
                {variable.hint}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
