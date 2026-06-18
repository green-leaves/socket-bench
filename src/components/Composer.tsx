import type { CSSProperties } from "react";
import type { AppState } from "../state/appState";
import type { RsModel } from "../types";
import { MONO, seg } from "../styles";
import { JsonEditor } from "./JsonEditor";

interface Props {
  state: AppState;
  setField: (
    field: keyof AppState,
  ) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  setFieldValue: (field: keyof AppState) => (value: string) => void;
  setHeader: (
    field: "stompConnectHeaders" | "stompSendHeaders",
    index: number,
    column: "key" | "value",
  ) => (event: React.ChangeEvent<HTMLInputElement>) => void;
  addHeader: (field: "stompConnectHeaders" | "stompSendHeaders") => () => void;
  removeHeader: (field: "stompConnectHeaders" | "stompSendHeaders", index: number) => () => void;
  onProtoModel: (model: RsModel) => void;
  wsSend: () => void;
  stompSubscribe: () => void;
  stompSend: () => void;
  rsRequest: () => void;
  rsChannelPush: () => void;
  rsChannelComplete: () => void;
}

const labelStyle: CSSProperties = {
  display: "block",
  font: "600 10px 'IBM Plex Sans'",
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: "#59616f",
  marginBottom: "6px",
};

const fieldStyle: CSSProperties = {
  width: "100%",
  background: "#0c0f15",
  border: "1px solid #1c232f",
  borderRadius: "7px",
  padding: "8px 11px",
  color: "#dce1ea",
  font: "13px " + MONO,
  outline: "none",
};

const accentBtn: CSSProperties = {
  background: "var(--accent,#2dd4a7)",
  border: "none",
  borderRadius: "7px",
  padding: "8px 18px",
  color: "#06120d",
  font: "600 12.5px 'IBM Plex Sans'",
  cursor: "pointer",
};

const softBtn: CSSProperties = {
  background: "#151a22",
  border: "1px solid #2a3340",
  borderRadius: "7px",
  padding: "8px 14px",
  color: "#dce1ea",
  font: "600 12px 'IBM Plex Sans'",
  cursor: "pointer",
};

const RS_MODELS: { value: RsModel; label: string }[] = [
  { value: "stream", label: "Req · Stream" },
  { value: "rr", label: "Req · Response" },
  { value: "channel", label: "Channel" },
  { value: "fnf", label: "Fire & Forget" },
];

const RS_LABELS: Record<RsModel, string> = {
  rr: "Request",
  stream: "Request stream",
  channel: "Open channel",
  fnf: "Fire",
};

export function Composer({ state, ...props }: Props) {
  return (
    <div
      data-screen-label="Composer"
      style={{
        flex: "none",
        width: state.splitW + "px",
        overflowY: "auto",
        overflowX: "hidden",
        background: "#0a0c10",
        borderRight: "1px solid #1c232f",
      }}
    >
      <div
        style={{
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: "15px",
          minHeight: "100%",
          boxSizing: "border-box",
        }}
      >
        {state.protocol === "ws" && (
          <>
            <div>
              <label style={labelStyle}>
                Sub-protocols{" "}
                <span style={{ textTransform: "none", letterSpacing: 0, color: "#3f4754", fontWeight: 400 }}>
                  (optional, comma separated)
                </span>
              </label>
              <input
                value={state.wsProtocols}
                onChange={props.setField("wsProtocols")}
                placeholder="e.g. graphql-ws"
                spellCheck={false}
                className="sb-input"
                style={{ ...fieldStyle, maxWidth: "360px" }}
              />
            </div>
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <label style={{ font: "600 10px 'IBM Plex Sans'", letterSpacing: ".1em", textTransform: "uppercase", color: "#59616f" }}>
                  Message payload
                </label>
                <button onClick={props.wsSend} className="sb-brighten" style={accentBtn}>
                  Send ↵
                </button>
              </div>
              <div style={{ flex: 1, minHeight: 0, border: "1px solid #1c232f", borderRadius: "8px", overflow: "hidden" }}>
                <JsonEditor value={state.wsPayload} onChange={props.setFieldValue("wsPayload")} fillHeight />
              </div>
            </div>
          </>
        )}

        {state.protocol === "stomp" && (
          <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div style={{ background: "#0b0e13", border: "1px solid #1c232f", borderRadius: "10px", padding: "13px 14px" }}>
              <div style={{ font: "700 11px 'IBM Plex Sans'", color: "#8a93a4", letterSpacing: ".06em", marginBottom: "10px" }}>
                SUBSCRIBE
              </div>
              <label style={labelStyle}>Destination</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  value={state.stompSubDest}
                  onChange={props.setField("stompSubDest")}
                  placeholder="/topic/messages"
                  spellCheck={false}
                  className="sb-input"
                  style={{ ...fieldStyle, flex: 1, minWidth: 0 }}
                />
                <button onClick={props.stompSubscribe} className="sb-soft-btn" style={{ ...softBtn, flex: "none" }}>
                  Subscribe
                </button>
              </div>
              <div style={{ marginTop: "13px" }}>
                <label style={labelStyle}>
                  Connect headers{" "}
                  <span style={{ textTransform: "none", letterSpacing: 0, color: "#3f4754", fontWeight: 400 }}>
                    (applied on Connect)
                  </span>
                </label>
                {state.stompConnectHeaders.map((row, index) => (
                  <div key={index} style={{ display: "flex", gap: "6px", marginBottom: "5px" }}>
                    <input
                      value={row.key}
                      onChange={props.setHeader("stompConnectHeaders", index, "key")}
                      placeholder="login"
                      spellCheck={false}
                      style={{ ...fieldStyle, flex: 1, minWidth: 0, borderRadius: "6px", padding: "6px 9px", color: "#c4ccd8", font: "12px " + MONO }}
                    />
                    <input
                      value={row.value}
                      onChange={props.setHeader("stompConnectHeaders", index, "value")}
                      placeholder="value"
                      spellCheck={false}
                      style={{ ...fieldStyle, flex: 1, minWidth: 0, borderRadius: "6px", padding: "6px 9px", color: "#c4ccd8", font: "12px " + MONO }}
                    />
                    <button
                      onClick={props.removeHeader("stompConnectHeaders", index)}
                      className="sb-danger"
                      style={{ flex: "none", width: "28px", background: "transparent", border: "1px solid #1e2632", borderRadius: "6px", color: "#59616f", cursor: "pointer", fontSize: "14px" }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={props.addHeader("stompConnectHeaders")}
                  className="sb-add"
                  style={{ background: "transparent", border: "none", color: "#59616f", font: "600 11px 'IBM Plex Sans'", cursor: "pointer", padding: "2px 0" }}
                >
                  + Add header
                </button>
              </div>
            </div>

            <div style={{ background: "#0b0e13", border: "1px solid #1c232f", borderRadius: "10px", padding: "13px 14px", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <div style={{ font: "700 11px 'IBM Plex Sans'", color: "#8a93a4", letterSpacing: ".06em" }}>SEND</div>
                <button onClick={props.stompSend} className="sb-brighten" style={{ ...accentBtn, padding: "7px 16px", fontSize: "12px" }}>
                  Send
                </button>
              </div>
              <label style={labelStyle}>Destination</label>
              <input
                value={state.stompSendDest}
                onChange={props.setField("stompSendDest")}
                placeholder="/app/hello"
                spellCheck={false}
                className="sb-input"
                style={{ ...fieldStyle, marginBottom: "10px" }}
              />
              <label style={labelStyle}>Body</label>
              <div style={{ flex: 1, minHeight: 0, border: "1px solid #1c232f", borderRadius: "8px", overflow: "hidden" }}>
                <JsonEditor value={state.stompBody} onChange={props.setFieldValue("stompBody")} fillHeight />
              </div>
            </div>
          </div>
        )}

        {state.protocol === "rsocket" && (
          <>
            <div style={{ display: "flex", gap: "3px", background: "#0c0f15", border: "1px solid #1c232f", borderRadius: "9px", padding: "3px", flexWrap: "wrap" }}>
              {RS_MODELS.map((option) => (
                <button key={option.value} onClick={() => props.onProtoModel(option.value)} style={seg(state.rsModel === option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: "14px" }}>
              <div>
                <label style={labelStyle}>
                  Route{" "}
                  <span style={{ textTransform: "none", letterSpacing: 0, color: "#3f4754", fontWeight: 400 }}>
                    (routing metadata)
                  </span>
                </label>
                <input
                  value={state.rsRoute}
                  onChange={props.setField("rsRoute")}
                  placeholder="greeting"
                  spellCheck={false}
                  className="sb-input"
                  style={fieldStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Initial requestN</label>
                <input
                  value={state.rsInitialN}
                  onChange={props.setField("rsInitialN")}
                  spellCheck={false}
                  className="sb-input"
                  style={fieldStyle}
                />
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", gap: "8px", flexWrap: "wrap" }}>
                <label style={{ font: "600 10px 'IBM Plex Sans'", letterSpacing: ".1em", textTransform: "uppercase", color: "#59616f" }}>
                  Data payload
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {state.rsModel === "channel" && (
                    <>
                      <button onClick={props.rsChannelPush} className="sb-soft-btn2" style={{ ...softBtn, padding: "7px 13px" }}>
                        Push frame
                      </button>
                      <button onClick={props.rsChannelComplete} className="sb-soft-btn2" style={{ ...softBtn, padding: "7px 13px", color: "#8a93a4" }}>
                        Complete
                      </button>
                    </>
                  )}
                  <button onClick={props.rsRequest} className="sb-brighten" style={accentBtn}>
                    {RS_LABELS[state.rsModel]}
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 0, border: "1px solid #1c232f", borderRadius: "8px", overflow: "hidden" }}>
                <JsonEditor value={state.rsData} onChange={props.setFieldValue("rsData")} fillHeight />
              </div>
              <div style={{ marginTop: "8px", font: "11.5px 'IBM Plex Sans'", color: "#5a6270", lineHeight: 1.5 }}>
                ⚗ Experimental — sends SETUP with composite-metadata /{" "}
                <span style={{ fontFamily: MONO }}>application/json</span> over the WebSocket
                transport (Spring-style, no frame-length prefix).
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
