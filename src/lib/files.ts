import { getState, insert, reportError } from "./store";
import { supabase } from "./supabase";
import type { Attachment, Task } from "./types";

// Supabase's free plan caps a single file at 50 MB.
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
const BUCKET = "attachments";

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export const extension = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

export const isImage = (a: Pick<Attachment, "mime" | "name">) =>
  a.mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"].includes(extension(a.name));

// Storage paths can't hold every character a file name can.
const safe = (name: string) => name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-120) || "file";

function storage() {
  const db = supabase() as { storage?: ReturnType<typeof supabase>["storage"] };
  return db.storage ?? null;
}

// Demo mode keeps files in memory as object URLs.
const demoUrls = new Map<string, string>();

/** Uploads files to a task. Returns the names that failed. */
export async function uploadFiles(task: Task, files: File[], onProgress?: (name: string | null) => void) {
  const failed: string[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      reportError(`“${file.name}” is ${formatSize(file.size)} — files can be up to ${formatSize(MAX_FILE_BYTES)}.`);
      failed.push(file.name);
      continue;
    }
    onProgress?.(file.name);
    const path = `${task.space_id}/${task.id}/${crypto.randomUUID()}-${safe(file.name)}`;
    const st = storage();
    if (st) {
      const { error } = await st.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (error) {
        reportError(`Couldn’t upload “${file.name}”: ${error.message}`);
        failed.push(file.name);
        continue;
      }
    } else {
      demoUrls.set(path, URL.createObjectURL(file));
    }
    insert("attachments", {
      space_id: task.space_id,
      task_id: task.id,
      name: file.name,
      path,
      size: file.size,
      mime: file.type || "",
      uploaded_by: getState().me,
    });
  }
  onProgress?.(null);
  return failed;
}

/** A short-lived link to a file; with `download`, the browser saves it instead of showing it. */
export async function fileUrl(a: Attachment, download = false): Promise<string | null> {
  const st = storage();
  if (!st) return demoUrls.get(a.path) ?? null;
  const { data, error } = await st.from(BUCKET).createSignedUrl(a.path, 60 * 60, download ? { download: a.name } : undefined);
  if (error) {
    reportError(error);
    return null;
  }
  return data.signedUrl;
}

/** Opens a file in the system browser (desktop app) or a new tab. */
export async function openFile(a: Attachment, download = false) {
  const url = await fileUrl(a, download);
  if (!url) return;
  if ("__TAURI_INTERNALS__" in window && url.startsWith("https://")) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}
