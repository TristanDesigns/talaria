import { useEffect, useRef, useState } from "react";
import { extension, fileUrl, formatSize, isImage, MAX_FILE_BYTES, openFile, uploadFiles } from "../lib/files";
import { remove, useStore } from "../lib/store";
import type { Attachment, Task } from "../lib/types";
import { timeAgo } from "../lib/util";
import { Icon } from "./bits";

// The "Files" section of the task pane.
export function Attachments({ task, pending }: { task: Task; pending: string | null }) {
  const s = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const files = Object.values(s.attachments)
    .filter((a) => a.task_id === task.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const busy = uploading ?? pending;

  return (
    <div className="files">
      {files.map((a) => (
        <FileRow key={a.id} file={a} who={a.uploaded_by ? s.profiles[a.uploaded_by]?.name : undefined} />
      ))}
      {busy && (
        <div className="file is-uploading">
          <span className="file-thumb"><Icon name="clip" size={16} /></span>
          <span className="file-name">Uploading {busy}…</span>
        </div>
      )}
      <div className="files-add">
        <button type="button" className="quick-add" onClick={() => input.current?.click()}>
          <Icon name="plus" size={14} /> Add files
        </button>
        <span className="muted">or drop them here · up to {formatSize(MAX_FILE_BYTES)} each</span>
        <input ref={input} type="file" multiple hidden onChange={(e) => {
          const picked = [...(e.target.files ?? [])];
          e.target.value = "";
          if (picked.length) uploadFiles(task, picked, setUploading);
        }} />
      </div>
    </div>
  );
}

function FileRow({ file, who }: { file: Attachment; who?: string }) {
  const [thumb, setThumb] = useState<string | null>(null);
  const image = isImage(file);
  useEffect(() => {
    let live = true;
    if (image) fileUrl(file).then((u) => live && setThumb(u));
    return () => {
      live = false;
    };
  }, [file, image]);

  return (
    <div className="file">
      <button type="button" className="file-thumb" onClick={() => openFile(file)} title="Open">
        {thumb ? <img src={thumb} alt="" draggable={false} /> : <span className="file-ext">{extension(file.name).slice(0, 5) || "file"}</span>}
      </button>
      <button type="button" className="file-main" onClick={() => openFile(file)} title="Open">
        <span className="file-name">{file.name}</span>
        <span className="file-meta muted">
          {formatSize(file.size)} · {who ? `${who}, ` : ""}{timeAgo(file.created_at)}
        </span>
      </button>
      <button type="button" className="ghost tiny" onClick={() => openFile(file, true)} title="Download" aria-label={`Download ${file.name}`}>
        <Icon name="download" size={14} />
      </button>
      <button type="button" className="ghost tiny" title="Remove" aria-label={`Remove ${file.name}`}
        onClick={() => confirm(`Remove “${file.name}” from this task?`) && remove("attachments", file.id)}>
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
}
