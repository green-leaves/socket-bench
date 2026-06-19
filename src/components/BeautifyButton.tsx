import { useEffect, useState } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/** Pretty-prints the JSON in `value`; flags invalid JSON instead of throwing. */
export function BeautifyButton({ value, onChange }: Props) {
  const [invalid, setInvalid] = useState(false);

  // Clear the warning as soon as the payload changes (user edited, or we formatted).
  useEffect(() => setInvalid(false), [value]);

  const beautify = () => {
    try {
      const formatted = JSON.stringify(JSON.parse(value), null, 2);
      if (formatted !== value) onChange(formatted);
    } catch {
      setInvalid(true);
    }
  };

  return (
    <button
      type="button"
      onClick={beautify}
      className="sb-fmt-btn"
      title={invalid ? "Invalid JSON — can't format" : "Beautify JSON"}
      style={{
        flex: "none",
        background: "transparent",
        border: "1px solid " + (invalid ? "#ff7b72" : "#2a3340"),
        borderRadius: "6px",
        padding: "4px 9px",
        color: invalid ? "#ff7b72" : "#8a93a4",
        font: "600 10px 'IBM Plex Sans'",
        cursor: "pointer",
      }}
    >
      {invalid ? "Invalid JSON" : "{ } Beautify"}
    </button>
  );
}
