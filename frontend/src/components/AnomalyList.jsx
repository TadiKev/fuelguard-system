// src/components/AnomalyList.jsx
import React from "react";
import AnomalyCard from "./AnomalyCard";

/**
 * AnomalyList
 * props:
 *  - items: array of anomalies
 *  - onAcknowledge(id)   (expected signature: id)
 *  - onResolve(id)       (expected signature: id)
 *
 * This component maps each anomaly to AnomalyCard and adapts callbacks so
 * existing pages that expect `onAcknowledge(id)` still work.
 */

export default function AnomalyList({ items = [], onAcknowledge = () => {}, onResolve = () => {}, onView = () => {} }) {
  if (!items || items.length === 0) {
    return <div className="text-sm text-slate-500">No anomalies.</div>;
  }

  return (
    <div className="space-y-3">
      {items.map((a) => (
        <AnomalyCard
          key={a.id}
          anomaly={a}
          onView={(an) => onView(an)}
          onAcknowledge={(an) => {
            // maintain backward compatibility: if consumer expects id, pass id
            // consumer may also accept the anomaly object — try id first
            try {
              onAcknowledge(an.id ?? an);
            } catch {
              onAcknowledge(an);
            }
          }}
          onResolve={(an) => {
            try {
              onResolve(an.id ?? an);
            } catch {
              onResolve(an);
            }
          }}
        />
      ))}
    </div>
  );
}
