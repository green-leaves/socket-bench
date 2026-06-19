import { useRef, type CSSProperties, type ReactNode } from "react";

interface Props {
  onImport: (file: File) => void;
  className?: string;
  style?: CSSProperties;
  title?: string;
  children: ReactNode;
}

/** A button that opens a JSON file picker and hands the chosen File to `onImport`. */
export function ImportButton({ onImport, className, style, title, children }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <button
        type="button"
        title={title}
        className={className}
        style={style}
        onClick={() => inputRef.current?.click()}
      >
        {children}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImport(file);
          event.target.value = ""; // allow re-importing the same file path
        }}
      />
    </>
  );
}
