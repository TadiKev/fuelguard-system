// src/pages/PumpDetails.jsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export default function PumpDetails() {
  const { id } = useParams();
  const { api } = useAuth();
  const [pump, setPump] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await api.get(`pumps/${id}/`).catch(async (e) => {
          // if there's no pumps/<id>/ endpoint, try stations/<station>/pumps/ list fallback
          throw e;
        });
        if (!mounted) return;
        setPump(r.data);
      } catch (e) {
        setErr(e.response?.data || e.message || "Failed to load pump");
      } finally {
        setLoading(false);
      }
    })();
    return () => (mounted = false);
  }, [api, id]);

  if (loading) return <div>Loading pump...</div>;
  if (err) return <div className="text-red-600">Error: {JSON.stringify(err)}</div>;
  if (!pump) return <div>No pump found</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Pump {pump.pump_number}</h1>
      <div className="bg-white p-4 rounded shadow">
        <div><strong>Fuel type:</strong> {pump.fuel_type}</div>
        <div><strong>Status:</strong> {pump.status}</div>
        <div><strong>Nozzle ID:</strong> {pump.nozzle_id}</div>
        <div><strong>Calibration factor:</strong> {pump.calibration_factor}</div>
        <div className="mt-3">
          <button className="px-3 py-1 bg-indigo-600 text-white rounded">Start transaction (UI)</button>
          <button className="ml-2 px-3 py-1 border rounded">Show transactions</button>
        </div>
      </div>
    </div>
  );
}
