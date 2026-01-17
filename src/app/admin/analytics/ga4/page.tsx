"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const GA_ID_REGEX = /^G-[A-Za-z0-9]+$/;

type AppSettingsRow = {
  ga4_measurement_id: string | null;
  ga4_enabled_default: boolean | null;
};

export default function AdminGa4SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [measurementId, setMeasurementId] = useState<string>("");
  const [enabledDefault, setEnabledDefault] = useState<boolean>(true);
  const [idWarning, setIdWarning] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const { data, error } = await supabaseBrowser
          .from("app_settings")
          .select("ga4_measurement_id, ga4_enabled_default")
          .limit(1)
          .maybeSingle<AppSettingsRow>();
        if (error) throw error;
        if (data) {
          setMeasurementId((data as any).ga4_measurement_id || "");
          setEnabledDefault(Boolean((data as any).ga4_enabled_default ?? true));
        } else {
          setMeasurementId("");
          setEnabledDefault(true);
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load GA4 settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleIdChange = (value: string) => {
    setMeasurementId(value);
    if (!value.trim()) {
      setIdWarning(null);
      return;
    }
    if (!GA_ID_REGEX.test(value.trim())) {
      setIdWarning("This does not look like a GA4 Measurement ID (expected format: G-XXXXXXXXXX). You can still save it.");
    } else {
      setIdWarning(null);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const payload: Partial<AppSettingsRow> = {
        ga4_measurement_id: measurementId.trim() || null,
        ga4_enabled_default: enabledDefault,
      };
      // Treat app_settings as a singleton row without an id column.
      // If a row exists, update all rows; otherwise insert one row.
      const { data: existing, error: loadErr } = await supabaseBrowser
        .from("app_settings")
        .select("ga4_measurement_id")
        .limit(1)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (existing) {
        const { error: updErr } = await supabaseBrowser
          .from("app_settings")
          .update(payload)
          .is("ga4_measurement_id", (existing as any).ga4_measurement_id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabaseBrowser
          .from("app_settings")
          .insert(payload);
        if (insErr) throw insErr;
      }
      setSuccess("GA4 settings saved.");
    } catch (e: any) {
      setError(e?.message || "Failed to save GA4 settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">Analytics / GA4</h1>
        <p className="text-sm text-gray-600 mt-1">
          Configure the default Google Analytics 4 Measurement ID for Afal Store. Products can optionally override this ID.
        </p>
      </div>

      <div className="border rounded p-4 space-y-4 bg-white">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
        )}
        {success && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">{success}</div>
        )}

        <div className="space-y-2">
          <label className="block text-sm font-medium">Default GA4 Measurement ID</label>
          <input
            type="text"
            value={measurementId}
            onChange={(e) => handleIdChange(e.target.value)}
            placeholder="e.g. G-XXXXXXXXXX"
            className="border rounded px-3 py-2 w-full text-sm"
            disabled={loading || saving}
          />
          <p className="text-xs text-gray-600">
            Paste the Measurement ID from your GA4 Web data stream. Leave empty to disable GA4 globally (unless a product override is set).
          </p>
          {idWarning && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">{idWarning}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            id="ga4-enabled-default"
            type="checkbox"
            checked={enabledDefault}
            onChange={(e) => setEnabledDefault(e.target.checked)}
            disabled={loading || saving}
          />
          <label htmlFor="ga4-enabled-default" className="text-sm font-medium">
            Enable GA4 for products by default
          </label>
        </div>

        <p className="text-xs text-gray-600">
          When enabled, products without an explicit GA4 override will send events to this Measurement ID (if set).
        </p>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving}
            className={`px-4 py-2 rounded text-white text-sm ${
              saving ? "bg-gray-400" : "bg-black hover:bg-gray-900"
            } disabled:opacity-50`}
          >
            {saving ? "Saving..." : "Save settings"}
          </button>
        </div>
      </div>

      <aside className="text-xs text-gray-600 space-y-2 max-w-xl">
        <p>
          GA4 will be loaded on LP, Checkout, and Order Success pages using either this global Measurement ID or a per-product override.
        </p>
        <ul className="list-disc pl-4 space-y-1">
          <li>
            If a product has GA4 enabled with its own Measurement ID, that ID is used for its LP and checkout.
          </li>
          <li>
            Otherwise, if GA4 is enabled by default and this global ID is set, events use the global ID.
          </li>
          <li>
            If neither applies, GA4 will not be loaded.
          </li>
        </ul>
      </aside>
    </div>
  );
}
