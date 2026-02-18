import { UploadPanel } from "./UploadUI";
import "../App.css";

export function Upload() {
  return (
    <div className="container" style={{ maxWidth: "700px", margin: "0 auto" }}>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Upload Your Media</h2>
          <p className="text-muted" style={{ marginBottom: 0, fontSize: "var(--font-size-sm)" }}>
            Drag & drop or browse to upload multiple files. Supported: MP4, WebM, MOV, PNG, JPG, MP3, OGG
          </p>
        </div>

        <div className="card-body">
          <UploadPanel />
        </div>
      </div>
    </div>
  );
}
