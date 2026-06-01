import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useFileUploader } from "../hooks/useFileUploader";

type UploadContextValue = ReturnType<typeof useFileUploader>;

const UploadContext = createContext<UploadContextValue | null>(null);

/**
 * Hosts a single uploader instance ABOVE the router so in-flight uploads survive
 * client-side navigation — the user can browse the site while files upload.
 * (A full page reload / closing the tab still aborts uploads; see the beforeunload guard.)
 */
export function UploadProvider({ children }: { children: ReactNode }) {
  const uploader = useFileUploader();

  // Warn before a reload / tab close would kill an in-progress upload.
  useEffect(() => {
    if (!uploader.uploading) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [uploader.uploading]);

  return <UploadContext.Provider value={uploader}>{children}</UploadContext.Provider>;
}

export function useUpload() {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used inside UploadProvider");
  return ctx;
}
