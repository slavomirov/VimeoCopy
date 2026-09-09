import { useContext } from "react";
import {
  DownloadRequestsContext,
  EMPTY_SUMMARY,
  type DownloadRequestsValue,
} from "./DownloadRequestsContext";

/** Download-request state. Safe to call outside the provider — see the context's note. */
export function useDownloadRequests(): DownloadRequestsValue {
  return (
    useContext(DownloadRequestsContext) ?? {
      statusFor: () => null,
      summary: EMPTY_SUMMARY,
      openRequestDialog: () => {},
      refresh: () => {},
    }
  );
}
