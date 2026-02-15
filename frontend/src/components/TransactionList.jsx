import React from "react";
import TxWithReceiptButtons from "../components/TxWithReceiptButtons";

export default function TransactionList({ items = [] }) {
  if (!items.length) {
    return (
      <div className="card">
        <h3 className="font-medium mb-2">Recent transactions</h3>
        <p className="text-sm text-muted">No transactions yet.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="font-medium mb-2">Recent transactions</h3>

      <ul className="space-y-3">
        {items.map((t) => (
          <li
            key={t.id}
            className="border-b pb-2 text-sm"
          >
            <div className="flex justify-between">
              <div>
                <strong>#{t.id?.slice(0, 8)}</strong> —{" "}
                {t.pump ? `Pump ${t.pump}` : "No pump"} —{" "}
                {t.volume}L
              </div>

              <div className="text-muted">
                {t.total_amount}
              </div>
            </div>

            {/* Receipt buttons */}
            <div className="mt-2">
              <TxWithReceiptButtons
                tx={t}
                onReceiptCreated={(receipt) =>
                  console.log("Receipt created:", receipt)
                }
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
