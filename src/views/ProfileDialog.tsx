import { useEffect, useRef, useState } from "react";
import { Avatar, Icon } from "../components/bits";
import { reportError, update, useStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import { PROJECT_COLORS } from "../lib/util";

const SIZE = 256; // stored avatars are square JPEGs this many pixels across

// Centre-crops any image to a square and shrinks it, so uploads stay small.
async function squareJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn’t read that image."))), "image/jpeg", 0.88),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const me = s.me ? s.profiles[s.me] : null;
  const [name, setName] = useState(me?.name ?? "");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!me) return null;

  const saveName = (value: string) => {
    const v = value.trim();
    if (v && v !== me.name) update("profiles", me.id, { name: v });
    else setName(me.name);
  };

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const blob = await squareJpeg(file);
      const storage = (supabase() as { storage?: ReturnType<typeof supabase>["storage"] }).storage;
      if (!storage) {
        // Demo mode has no file storage; keep the picture in memory.
        update("profiles", me.id, { avatar_url: URL.createObjectURL(blob) });
        return;
      }
      const path = `${me.id}/${Date.now()}.jpg`;
      const { error } = await storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      const old = me.avatar_url?.split("/avatars/")[1];
      update("profiles", me.id, { avatar_url: storage.from("avatars").getPublicUrl(path).data.publicUrl });
      // Tidy away the previous upload (a Google photo isn't ours to delete).
      if (old?.startsWith(me.id + "/")) storage.from("avatars").remove([old]);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <div className="dialog-head">
          <h2 id="profile-title">Profile</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>

        <div className="profile-photo">
          <Avatar profile={{ ...me, name: name || me.name }} size={88} />
          <div className="profile-photo-actions">
            <button type="button" className="primary" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? "Uploading…" : me.avatar_url ? "Change photo" : "Upload photo"}
            </button>
            {me.avatar_url && (
              <button type="button" className="ghost" disabled={busy}
                onClick={() => update("profiles", me.id, { avatar_url: null })}>
                Remove photo
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) upload(f);
              }} />
          </div>
        </div>

        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={(e) => saveName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} maxLength={60} />
          <small className="muted">What everyone else sees on tasks and comments.</small>
        </label>

        <div className="field">
          <span>Colour</span>
          <div className="swatch-row">
            {PROJECT_COLORS.map((c) => (
              <button key={c} type="button" className={"swatch" + (me.color === c ? " is-on" : "")}
                style={{ background: c }} aria-label={"Colour " + c} aria-pressed={me.color === c}
                onClick={() => update("profiles", me.id, { color: c })} />
            ))}
          </div>
          <small className="muted">Shown behind your initials when there’s no photo.</small>
        </div>

        <div className="field">
          <span>Email</span>
          <div className="muted">{me.email}</div>
        </div>
      </div>
    </div>
  );
}
