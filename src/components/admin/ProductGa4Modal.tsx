"use client";

import React, { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const GA_ID_REGEX = /^G-[A-Za-z0-9]+$/;

type Props = {
  productId: string;
  open: boolean;
  onClose: () => void;
};

type ProductGa4Fields = {
  ga4_enabled_override: boolean | null;
  ga4_measurement_id_override: string | null;
};

type Mode = "inherit" | "on" | "off";

export default function ProductGa4Modal({ productId, open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("inherit");
  const [measurementId, setMeasurementId] = useState<string>("");
  const [idWarning, setIdWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const { data, error } = await supabaseBrowser
          .from("products")
          .select("ga4_enabled_override, ga4_measurement_id_override")
          .eq("id", productId)
          .maybeSingle<ProductGa4Fields>();
        if (error) throw error;
        if (data) {
          const enabled = (data as any).ga4_enabled_override as boolean | null;
          const mid = (data as any).ga4_measurement_id_override as string | null;
          setMode(enabled === true ? "on" : enabled === false ? "off" : "inherit");
          setMeasurementId(mid || "");
        } else {
          setMode("inherit");
          setMeasurementId("");
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load GA4 settings");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, productId]);

  const handleIdChange = (value: string) => {
    setMeasurementId(value);
    if (!value.trim()) {
      setIdWarning(null);
      return;
    }
    if (!GA_ID_REGEX.test(value.trim())) {
      setIdWarning(
        "This does not look like a GA4 Measurement ID (expected format: G-XXXXXXXXXX). You can still save it.",
      );
    } else {
      setIdWarning(null);
    }
  };

  const save = async () => {
    try {
      setSaving(true);
      setError(null);
      const patch: Partial<ProductGa4Fields> = {
        ga4_enabled_override: mode === "inherit" ? null : mode === "on" ? true : false,
        ga4_measurement_id_override: measurementId.trim() || null,
      };
      const { error } = await supabaseBrowser
        .from("products")
        .update(patch)
        .eq("id", productId);
      if (error) throw error;
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to save GA4 settings");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={() => !saving && onClose()}
      />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-lg bg-white shadow-xl p-6 overflow-y-auto rounded-l-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Google Analytics (GA4)</h2>
          <button
            className="text-gray-500 hover:text-gray-700"
            onClick={() => !saving && onClose()}
          >
            X
          </button>
        </div>

        {error && (
          <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </div>
        )}

        {loading ? (
          <div>Loading...</div>
        ) : (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1">
                Enable GA4 for this product
              </label>
              <div className="space-y-1 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="ga4-mode"
                    value="inherit"
                    checked={mode === "inherit"}
                    onChange={() => setMode("inherit")}
                    disabled={saving}
                  />
                  <span>
                    Inherit global setting
                    <span className="block text-xs text-gray-600">
                      Use the global GA4 Measurement ID and default enable/disable setting.
                    </span>
                  </span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="ga4-mode"
                    value="on"
                    checked={mode === "on"}
                    onChange={() => setMode("on")}
                    disabled={saving}
                  />
                  <span>
                    Override: On
                    <span className="block text-xs text-gray-600">
                      Force GA4 on for this product, using either the override Measurement ID below or the global ID.
                    </span>
                  </span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="ga4-mode"
                    value="off"
                    checked={mode === "off"}
                    onChange={() => setMode("off")}
                    disabled={saving}
                  />
                  <span>
                    Override: Off
                    <span className="block text-xs text-gray-600">
                      Never send GA4 events for this product, even if a global ID is configured.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium">Override Measurement ID (optional)</label>
              <input
                type="text"
                value={measurementId}
                onChange={(e) => handleIdChange(e.target.value)}
                placeholder="e.g. G-XXXXXXXXXX"
                className="mt-1 border rounded px-3 py-2 w-full text-sm"
                disabled={saving}
              />
              <p className="text-xs text-gray-600 mt-1">
                If provided, this Measurement ID will be used for this product's LP and checkout.
                If left empty, the global GA4 ID (if any) will be used.
              </p>
              {idWarning && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                  {idWarning}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={saving}
                className={`px-4 py-2 rounded text-white text-sm ${
                  saving ? "bg-gray-400" : "bg-black hover:bg-gray-900"
                }`}
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 rounded border text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

