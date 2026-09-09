import { createContext } from "react";

export type DownloadRequestStatus = "Pending" | "Approved" | "Denied";

export interface DownloadRequestSummary {
  pendingIncoming: number;
  pendingOutgoing: number;
  approvedOutgoing: number;
}

export interface AskTarget {
  id: string;
  fileName: string | null;
}

export interface DownloadRequestsValue {
  /** The signed-in viewer's own request state, keyed by media id. */
  statusFor: (mediaId: string) => DownloadRequestStatus | null;
  summary: DownloadRequestSummary;
  /** Opens the ask dialog. Sends unauthenticated visitors to sign in instead. */
  openRequestDialog: (target: AskTarget) => void;
  /** Re-reads the viewer's requests and the badge counts — call after deciding one. */
  refresh: () => void;
}

export const EMPTY_SUMMARY: DownloadRequestSummary = {
  pendingIncoming: 0,
  pendingOutgoing: 0,
  approvedOutgoing: 0,
};

/**
 * Null outside the provider, and the hook substitutes an inert value rather than throwing: the
 * embed player renders its own tree with no app shell, and a hard throw there would black out the
 * page over a button it never shows.
 */
export const DownloadRequestsContext = createContext<DownloadRequestsValue | null>(null);
