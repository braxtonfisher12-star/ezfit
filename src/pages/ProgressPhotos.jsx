import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Pill } from "../components/Card";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import { toISODate } from "../lib/dateUtils";

const ANGLES = ["front", "side", "back"];

export default function ProgressPhotos() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputs = { front: useRef(null), side: useRef(null), back: useRef(null) };

  const [photosByDate, setPhotosByDate] = useState({});
  const [urls, setUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [compareAngle, setCompareAngle] = useState("front");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("progress_photos").select("*").eq("user_id", user.id).order("photo_date", { ascending: false });
    const grouped = {};
    for (const p of data ?? []) {
      grouped[p.photo_date] = grouped[p.photo_date] || {};
      grouped[p.photo_date][p.angle] = p;
    }
    setPhotosByDate(grouped);

    const paths = (data ?? []).map((p) => p.storage_path);
    if (paths.length) {
      const { data: signed } = await supabase.storage.from("progress-photos").createSignedUrls(paths, 3600);
      const map = {};
      (signed ?? []).forEach((s) => { if (s.signedUrl) map[s.path] = s.signedUrl; });
      setUrls(map);
    }
    setLoading(false);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const upload = async (angle, file) => {
    setUploading(angle);
    const today = toISODate(new Date());
    const path = `${user.id}/${today}-${angle}.jpg`;
    const { error: uploadError } = await supabase.storage.from("progress-photos").upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      alert(`Upload failed: ${uploadError.message}`);
      setUploading(null);
      return;
    }
    await supabase.from("progress_photos").upsert({ user_id: user.id, photo_date: today, angle, storage_path: path }, { onConflict: "user_id,photo_date,angle" });
    setUploading(null);
    load();
  };

  const dates = Object.keys(photosByDate).sort().reverse();
  const todayISO = toISODate(new Date());
  const todaysSet = photosByDate[todayISO] ?? {};

  if (loading) return <div className="content">Loading…</div>;

  return (
    <div className="content">
      <button onClick={() => navigate("/progress")} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 10 }}>&larr; Back</button>
      <h1 className="pageTitle" style={{ fontSize: 22 }}>Progress photos</h1>
      <p className="muted">Same lighting, distance, and pose each time for the cleanest comparison.</p>

      <Card>
        <div className="eyebrow">Today</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8 }}>
          {ANGLES.map((angle) => {
            const photo = todaysSet[angle];
            return (
              <div key={angle}>
                <div
                  onClick={() => fileInputs[angle].current.click()}
                  style={{
                    aspectRatio: "3/4", borderRadius: 10, cursor: "pointer", overflow: "hidden",
                    background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center",
                    border: photo ? "none" : "1px dashed var(--border)",
                  }}
                >
                  {photo && urls[photo.storage_path] ? (
                    <img src={urls[photo.storage_path]} alt={angle} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span className="muted" style={{ fontSize: 11, textTransform: "capitalize" }}>{uploading === angle ? "Uploading…" : angle}</span>
                  )}
                </div>
                <input ref={fileInputs[angle]} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => e.target.files[0] && upload(angle, e.target.files[0])} />
              </div>
            );
          })}
        </div>
      </Card>

      {dates.length >= 2 && (
        <Card>
          <div className="eyebrow">Compare</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, marginBottom: 8 }}>
            {ANGLES.map((a) => (
              <button key={a} onClick={() => setCompareAngle(a)} style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: compareAngle === a ? "1.5px solid var(--primary)" : "1px solid var(--border)", background: compareAngle === a ? "var(--primary-tint)" : "var(--surface)", fontSize: 12, textTransform: "capitalize", cursor: "pointer" }}>{a}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={compareA} onChange={(e) => setCompareA(e.target.value)} style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}>
              <option value="">Earlier date</option>
              {dates.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={compareB} onChange={(e) => setCompareB(e.target.value)} style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}>
              <option value="">Later date</option>
              {dates.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          {compareA && compareB && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              {[compareA, compareB].map((d) => {
                const photo = photosByDate[d]?.[compareAngle];
                return (
                  <div key={d} style={{ flex: 1 }}>
                    <div style={{ aspectRatio: "3/4", borderRadius: 10, overflow: "hidden", background: "var(--surface-2)" }}>
                      {photo && urls[photo.storage_path] && <img src={urls[photo.storage_path]} alt={d} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                    </div>
                    <div className="muted" style={{ fontSize: 11, textAlign: "center", marginTop: 4 }}>{d}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      <div className="eyebrow" style={{ marginTop: 16 }}>History</div>
      {dates.filter((d) => d !== todayISO).map((d) => (
        <Card tight key={d}>
          <div className="row">
            <span style={{ fontSize: 13 }}>{d}</span>
            <Pill tone="gray">{Object.keys(photosByDate[d]).length} photo{Object.keys(photosByDate[d]).length === 1 ? "" : "s"}</Pill>
          </div>
        </Card>
      ))}
    </div>
  );
}
