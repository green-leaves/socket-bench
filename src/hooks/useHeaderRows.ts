import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppState } from "../state/appState";

type HeaderField = "stompConnectHeaders" | "stompSendHeaders";

export function useHeaderRows(setState: Dispatch<SetStateAction<AppState>>) {
  const setHeader = useCallback(
    (field: HeaderField, index: number, column: "key" | "value") =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setState((prev) => {
          const rows = prev[field].slice();
          rows[index] = { ...rows[index], [column]: value };
          return { ...prev, [field]: rows };
        });
      },
    [setState],
  );

  const addHeader = useCallback(
    (field: HeaderField) => () =>
      setState((prev) => ({ ...prev, [field]: prev[field].concat([{ key: "", value: "" }]) })),
    [setState],
  );

  const removeHeader = useCallback(
    (field: HeaderField, index: number) => () =>
      setState((prev) => {
        const rows = prev[field].filter((_, position) => position !== index);
        return { ...prev, [field]: rows.length ? rows : [{ key: "", value: "" }] };
      }),
    [setState],
  );

  return { setHeader, addHeader, removeHeader };
}
