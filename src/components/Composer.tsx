import type { CSSProperties } from "react";
import type { AppState } from "../state/appState";
import type { RsModel } from "../types";
import { MONO, seg } from "../styles";

interface Props {
  state: AppState;
  setField: (
    k: keyof AppState,
  ) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  setHeader: (
    field: "stompConnectHeaders" | "stompSendHeaders",
    i: number,
    key: "k" | "v",
  ) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  addHeader: (field: "stompConnectHeaders" | "stompSendHeaders") => () => void;
  removeHeader: (field: "stompConnectHeaders" | "stompSendHeaders", i: number) => () => void;
  onProtoModel: (m: RsModel) => void;
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

const textareaStyle: CSSProperties = {
  width: "100%",
  resize: "vertical",
  background: "#0c0f15",
  border: "1px solid #1c232f",
  borderRadius: "8px",
  padding: "12px 13px",
  color: "#cdd6e0",
  font: "12.5px/1.5 " + MONO,
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

const RS_MODELS: { k: RsModel; l: string }[] = [
  { k: "rr", l: "Req · Response" },
  { k: "stream", l: "Req · Stream" },
  { k: "channel", l: "Channel" },
  { k: "fnf", l: "Fire & Forget" },
];
const RS_LABELS: Record<RsModel, string> = {
  rr: "Request",
  stream: "Request stream",
  channel: "Open channel",
  fnf: "Fire",
};

export function Composer({ state: S, ...p }: Props) {
  return (
    <div
      data-screen-label="Composer"
      style={{
        flex: "none",
        width: S.splitW + "px",
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
        }}
      >
        {S.protocol === "ws" && (
          <>
            <div>
              <label style={labelStyle}>
                Sub-protocols{" "}
                <span style={{ textTransform: "none", letterSpacing: 0, color: "#3f4754", fontWeight: 400 }}>
                  (optional, comma separated)
                </span>
              </label>
              <input
                value={S.wsProtocols}
                onChange={p.setField("wsProtocols")}
                placeholder="e.g. graphql-ws"
                spellCheck={false}
                className="sb-input"
                style={{ ...fieldStyle, maxWidth: "360px" }}
              />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <label style={{ font: "600 10px 'IBM Plex Sans'", letterSpacing: ".1em", textTransform: "uppercase", color: "#59616f" }}>
                  Message payload
                </label>
                <button onClick={p.wsSend} className="sb-brighten" style={accentBtn}>
                  Send ↵
                </button>
              </div>
              <textarea
                value={S.wsPayload}
                onChange={p.setField("wsPayload")}
                spellCheck={false}
                className="sb-input"
                style={{ ...textareaStyle, minHeight: "150px" }}
              />
            </div>
          </>
        )}

        {S.protocol === "stomp" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div style={{ background: "#0b0e13", border: "1px solid #1c232f", borderRadius: "10px", padding: "13px 14px" }}>
              <div style={{ font: "700 11px 'IBM Plex Sans'", color: "#8a93a4", letterSpacing: ".06em", marginBottom: "10px" }}>
                SUBSCRIBE
              </div>
              <label style={labelStyle}>Destination</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  value={S.stompSubDest}
                  onChange={p.setField("stompSubDest")}
                  placeholder="/topic/messages"
                  spellCheck={false}
                  className="sb-input"
                  style={{ ...fieldStyle, flex: 1, minWidth: 0 }}
                />
                <button onClick={p.stompSubscribe} className="sb-soft-btn" style={{ ...softBtn, flex: "none" }}>
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
                {S.stompConnectHeaders.map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: "6px", marginBottom: "5px" }}>
                    <input
                      value={r.k}
                      onChange={p.setHeader("stompConnectHeaders", i, "k")}
                      placeholder="login"
                      spellCheck={false}
                      style={{ ...fieldStyle, flex: 1, minWidth: 0, borderRadius: "6px", padding: "6px 9px", color: "#c4ccd8", font: "12px " + MONO }}
                    />
                    <input
                      value={r.v}
                      onChange={p.setHeader("stompConnectHeaders", i, "v")}
                      placeholder="value"
                      spellCheck={false}
                      style={{ ...fieldStyle, flex: 1, minWidth: 0, borderRadius: "6px", padding: "6px 9px", color: "#c4ccd8", font: "12px " + MONO }}
                    />
                    <button
                      onClick={p.removeHeader("stompConnectHeaders", i)}
                      className="sb-danger"
                      style={{ flex: "none", width: "28px", background: "transparent", border: "1px solid #1e2632", borderRadius: "6px", color: "#59616f", cursor: "pointer", fontSize: "14px" }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={p.addHeader("stompConnectHeaders")}
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
                <button onClick={p.stompSend} className="sb-brighten" style={{ ...accentBtn, padding: "7px 16px", fontSize: "12px" }}>
                  Send
                </button>
              </div>
              <label style={labelStyle}>Destination</label>
              <input
                value={S.stompSendDest}
                onChange={p.setField("stompSendDest")}
                placeholder="/app/hello"
                spellCheck={false}
                className="sb-input"
                style={{ ...fieldStyle, marginBottom: "10px" }}
              />
              <label style={labelStyle}>Body</label>
              <textarea
                value={S.stompBody}
                onChange={p.setField("stompBody")}
                spellCheck={false}
                className="sb-input"
                style={{ ...textareaStyle, flex: 1, minHeight: "96px" }}
              />
            </div>
          </div>
        )}

        {S.protocol === "rsocket" && (
          <>
            <div style={{ display: "flex", gap: "3px", background: "#0c0f15", border: "1px solid #1c232f", borderRadius: "9px", padding: "3px", flexWrap: "wrap" }}>
              {RS_MODELS.map((m) => (
                <button key={m.k} onClick={() => p.onProtoModel(m.k)} style={seg(S.rsModel === m.k)}>
                  {m.l}
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
                  value={S.rsRoute}
                  onChange={p.setField("rsRoute")}
                  placeholder="greeting"
                  spellCheck={false}
                  className="sb-input"
                  style={fieldStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Initial requestN</label>
                <input
                  value={S.rsInitialN}
                  onChange={p.setField("rsInitialN")}
                  spellCheck={false}
                  className="sb-input"
                  style={fieldStyle}
                />
              </div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", gap: "8px", flexWrap: "wrap" }}>
                <label style={{ font: "600 10px 'IBM Plex Sans'", letterSpacing: ".1em", textTransform: "uppercase", color: "#59616f" }}>
                  Data payload
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {S.rsModel === "channel" && (
                    <>
                      <button onClick={p.rsChannelPush} className="sb-soft-btn2" style={{ ...softBtn, padding: "7px 13px" }}>
                        Push frame
                      </button>
                      <button onClick={p.rsChannelComplete} className="sb-soft-btn2" style={{ ...softBtn, padding: "7px 13px", color: "#8a93a4" }}>
                        Complete
                      </button>
                    </>
                  )}
                  <button onClick={p.rsRequest} className="sb-brighten" style={accentBtn}>
                    {RS_LABELS[S.rsModel]}
                  </button>
                </div>
              </div>
              <textarea
                value={S.rsData}
                onChange={p.setField("rsData")}
                spellCheck={false}
                className="sb-input"
                style={{ ...textareaStyle, minHeight: "120px" }}
              />
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
