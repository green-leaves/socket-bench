import { useRef, type CSSProperties } from "react";
import type { Endpoint } from "../state/endpoint";
import type { RsModel } from "../types";
import { MONO, seg } from "../styles";
import { JsonEditor, type JsonEditorHandle } from "./JsonEditor";
import { BeautifyButton } from "./BeautifyButton";
import { VariablesMenu } from "./VariablesMenu";

const payloadLabelStyle: CSSProperties = {
  font: "600 10px 'IBM Plex Sans'",
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: "#59616f",
};

const fixRowStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "5px", minWidth: 0 };

interface Props {
  endpoint: Endpoint;
  splitW: number;
  setField: (
    field: keyof Endpoint,
  ) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  setFieldValue: (field: keyof Endpoint) => (value: string) => void;
  setHeader: (
    field: "stompConnectHeaders" | "stompSendHeaders",
    index: number,
    column: "key" | "value",
  ) => (event: React.ChangeEvent<HTMLInputElement>) => void;
  addHeader: (field: "stompConnectHeaders" | "stompSendHeaders") => () => void;
  removeHeader: (field: "stompConnectHeaders" | "stompSendHeaders", index: number) => () => void;
  setFieldBool: (field: keyof Endpoint) => (value: boolean) => void;
  fixSend: () => void;
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

export function Composer({ endpoint, splitW, ...props }: Props) {
  // One handle per payload editor so the variables picker can insert at the cursor.
  const wsEditorRef = useRef<JsonEditorHandle>(null);
  const stompEditorRef = useRef<JsonEditorHandle>(null);
  const rsEditorRef = useRef<JsonEditorHandle>(null);

  return (
    <div
      data-screen-label="Composer"
      style={{
        flex: "none",
        width: splitW + "px",
        overflowY: "auto",
        overflowX: "hidden",
        background: "#0a0c10",
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
        {endpoint.protocol === "ws" && (
          <>
            <div>
              <label style={labelStyle}>
                Sub-protocols{" "}
                <span style={{ textTransform: "none", letterSpacing: 0, color: "#3f4754", fontWeight: 400 }}>
                  (optional, comma separated)
                </span>
              </label>
              <input
                value={endpoint.wsProtocols}
                onChange={props.setField("wsProtocols")}
                placeholder="e.g. graphql-ws"
                spellCheck={false}
                className="sb-input"
                style={{ ...fieldStyle, maxWidth: "360px" }}
              />
            </div>
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <label style={payloadLabelStyle}>Message payload</label>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <VariablesMenu onInsert={(token) => wsEditorRef.current?.insertText(token)} />
                  <BeautifyButton value={endpoint.wsPayload} onChange={props.setFieldValue("wsPayload")} />
                  <button onClick={props.wsSend} className="sb-brighten" style={accentBtn}>
                    Send ↵
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 0, border: "1px solid #1c232f", borderRadius: "8px", overflow: "hidden" }}>
                <JsonEditor ref={wsEditorRef} value={endpoint.wsPayload} onChange={props.setFieldValue("wsPayload")} fillHeight />
              </div>
            </div>
          </>
        )}

        {endpoint.protocol === "stomp" && (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ flex: "none", background: "#0b0e13", border: "1px solid #1c232f", borderRadius: "10px", padding: "13px 14px" }}>
              <div style={{ font: "700 11px 'IBM Plex Sans'", color: "#8a93a4", letterSpacing: ".06em", marginBottom: "10px" }}>
                SUBSCRIBE
              </div>
              <label style={labelStyle}>Destination</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  value={endpoint.stompSubDest}
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
                {endpoint.stompConnectHeaders.map((row, index) => (
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

            <div style={{ flex: 1, minHeight: 0, background: "#0b0e13", border: "1px solid #1c232f", borderRadius: "10px", padding: "13px 14px", display: "flex", flexDirection: "column" }}>
              <div style={{ font: "700 11px 'IBM Plex Sans'", color: "#8a93a4", letterSpacing: ".06em", marginBottom: "10px" }}>
                SEND
              </div>
              <label style={labelStyle}>Destination</label>
              <div style={{ display: "flex", gap: "8px", marginBottom: "13px" }}>
                <input
                  value={endpoint.stompSendDest}
                  onChange={props.setField("stompSendDest")}
                  placeholder="/app/hello"
                  spellCheck={false}
                  className="sb-input"
                  style={{ ...fieldStyle, flex: 1, minWidth: 0 }}
                />
                <button onClick={props.stompSend} className="sb-brighten" style={{ ...accentBtn, flex: "none" }}>
                  Send
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <label style={payloadLabelStyle}>Body</label>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <VariablesMenu onInsert={(token) => stompEditorRef.current?.insertText(token)} />
                  <BeautifyButton value={endpoint.stompBody} onChange={props.setFieldValue("stompBody")} />
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 0, border: "1px solid #1c232f", borderRadius: "8px", overflow: "hidden" }}>
                <JsonEditor ref={stompEditorRef} value={endpoint.stompBody} onChange={props.setFieldValue("stompBody")} fillHeight />
              </div>
            </div>
          </div>
        )}

        {endpoint.protocol === "fix" && (
          <>
            <div
              style={{
                background: "#0b0e13",
                border: "1px solid #1c232f",
                borderRadius: "10px",
                padding: "13px 14px",
              }}
            >
              <div
                style={{
                  font: "700 11px 'IBM Plex Sans'",
                  color: "#8a93a4",
                  letterSpacing: ".06em",
                  marginBottom: "10px",
                }}
              >
                GATEWAY &amp; SESSION
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "10px",
                }}
              >
                <div style={fixRowStyle}>
                  <label style={labelStyle}>Gateway URL</label>
                  <input
                    value={endpoint.fixGatewayUrl}
                    onChange={props.setField("fixGatewayUrl")}
                    placeholder="ws://localhost:9988"
                    spellCheck={false}
                    className="sb-input"
                    style={fieldStyle}
                  />
                </div>
                <div style={fixRowStyle}>
                  <label style={labelStyle}>BeginString</label>
                  <input
                    value={endpoint.fixBeginString}
                    onChange={props.setField("fixBeginString")}
                    placeholder="FIX.4.4"
                    spellCheck={false}
                    className="sb-input"
                    style={fieldStyle}
                  />
                </div>
                <div style={fixRowStyle}>
                  <label style={labelStyle}>Acceptor host</label>
                  <input
                    value={endpoint.fixHost}
                    onChange={props.setField("fixHost")}
                    placeholder="fix.venue.com"
                    spellCheck={false}
                    className="sb-input"
                    style={fieldStyle}
                  />
                </div>
                <div style={fixRowStyle}>
                  <label style={labelStyle}>Acceptor port</label>
                  <input
                    value={endpoint.fixPort}
                    onChange={props.setField("fixPort")}
                    placeholder="9823"
                    spellCheck={false}
                    className="sb-input"
                    style={fieldStyle}
                  />
                </div>
                <div style={fixRowStyle}>
                  <label style={labelStyle}>SenderCompID</label>
                  <input
                    value={endpoint.fixSenderCompID}
                    onChange={props.setField("fixSenderCompID")}
                    spellCheck={false}
                    className="sb-input"
                    style={fieldStyle}
                  />
                </div>
                <div style={fixRowStyle}>
                  <label style={labelStyle}>TargetCompID</label>
                  <input
                    value={endpoint.fixTargetCompID}
                    onChange={props.setField("fixTargetCompID")}
                    spellCheck={false}
                    className="sb-input"
                    style={fieldStyle}
                  />
                </div>
                <div style={fixRowStyle}>
                  <label style={labelStyle}>HeartBtInt (s)</label>
                  <input
                    value={endpoint.fixHeartBtInt}
                    onChange={props.setField("fixHeartBtInt")}
                    placeholder="30"
                    spellCheck={false}
                    className="sb-input"
                    style={fieldStyle}
                  />
                </div>
                <div style={fixRowStyle}>
                  <label style={labelStyle}>Username / Password</label>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input
                      value={endpoint.fixUsername}
                      onChange={props.setField("fixUsername")}
                      placeholder="user (553)"
                      spellCheck={false}
                      className="sb-input"
                      style={{ ...fieldStyle, flex: 1, minWidth: 0 }}
                    />
                    <input
                      value={endpoint.fixPassword}
                      onChange={props.setField("fixPassword")}
                      placeholder="pass (554)"
                      spellCheck={false}
                      className="sb-input"
                      style={{ ...fieldStyle, flex: 1, minWidth: 0 }}
                    />
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "18px", marginTop: "12px" }}>
                <label
                  style={{ display: "flex", alignItems: "center", gap: "7px", cursor: "pointer", color: "#c4ccd8", font: "12px 'IBM Plex Sans'" }}
                >
                  <input
                    type="checkbox"
                    checked={endpoint.fixTls}
                    onChange={(event) => props.setFieldBool("fixTls")(event.target.checked)}
                  />
                  TLS to acceptor
                </label>
                <label
                  style={{ display: "flex", alignItems: "center", gap: "7px", cursor: "pointer", color: "#c4ccd8", font: "12px 'IBM Plex Sans'" }}
                >
                  <input
                    type="checkbox"
                    checked={endpoint.fixResetSeq}
                    onChange={(event) => props.setFieldBool("fixResetSeq")(event.target.checked)}
                  />
                  Reset seq on logon (141=Y)
                </label>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "6px",
                }}
              >
                <label style={payloadLabelStyle}>Application message</label>
                <button onClick={props.fixSend} className="sb-brighten" style={accentBtn}>
                  Send ↵
                </button>
              </div>
              <textarea
                value={endpoint.fixMessage}
                onChange={props.setField("fixMessage")}
                spellCheck={false}
                className="sb-input"
                style={{
                  flex: 1,
                  minHeight: "120px",
                  resize: "none",
                  background: "#0c0f15",
                  border: "1px solid #1c232f",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  color: "#dce1ea",
                  font: "13px " + MONO,
                  outline: "none",
                }}
              />
              <div
                style={{ marginTop: "8px", font: "11.5px 'IBM Plex Sans'", color: "#5a6270", lineHeight: 1.5 }}
              >
                Separate fields with <span style={{ fontFamily: MONO }}>|</span> or new lines (e.g.
                <span style={{ fontFamily: MONO }}> 35=D|55=AAPL|38=100</span>). Header tags
                (8/9/34/35/49/52/56) and checksum are managed for you; <span style={{ fontFamily: MONO }}>{"{{uuid}}"}</span>{" "}
                and other variables expand on send. Connect performs Logon; Disconnect performs Logout.
              </div>
            </div>
          </>
        )}

        {endpoint.protocol === "rsocket" && (
          <>
            <div style={{ display: "flex", gap: "3px", background: "#0c0f15", border: "1px solid #1c232f", borderRadius: "9px", padding: "3px", flexWrap: "wrap" }}>
              {RS_MODELS.map((option) => (
                <button key={option.value} onClick={() => props.onProtoModel(option.value)} style={seg(endpoint.rsModel === option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
            <div>
              <label style={labelStyle}>
                Route{" "}
                <span style={{ textTransform: "none", letterSpacing: 0, color: "#3f4754", fontWeight: 400 }}>
                  (routing metadata)
                </span>
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  value={endpoint.rsRoute}
                  onChange={props.setField("rsRoute")}
                  placeholder="greeting"
                  spellCheck={false}
                  className="sb-input"
                  style={{ ...fieldStyle, flex: 1, minWidth: 0 }}
                />
                <button onClick={props.rsRequest} className="sb-brighten" style={{ ...accentBtn, flex: "none" }}>
                  Send
                </button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", gap: "8px", flexWrap: "wrap" }}>
                <label style={payloadLabelStyle}>Data payload</label>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <VariablesMenu onInsert={(token) => rsEditorRef.current?.insertText(token)} />
                  <BeautifyButton value={endpoint.rsData} onChange={props.setFieldValue("rsData")} />
                  {endpoint.rsModel === "channel" && (
                    <>
                      <button onClick={props.rsChannelPush} className="sb-soft-btn2" style={{ ...softBtn, padding: "7px 13px" }}>
                        Push frame
                      </button>
                      <button onClick={props.rsChannelComplete} className="sb-soft-btn2" style={{ ...softBtn, padding: "7px 13px", color: "#8a93a4" }}>
                        Complete
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 0, border: "1px solid #1c232f", borderRadius: "8px", overflow: "hidden" }}>
                <JsonEditor ref={rsEditorRef} value={endpoint.rsData} onChange={props.setFieldValue("rsData")} fillHeight />
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
