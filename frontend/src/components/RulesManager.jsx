import React, { useEffect, useState } from "react";
import api from "../services/api";

/**
 * RulesManager — list and create simple rules
 * Props:
 *  - stationId (optional) to filter or pass to create payload
 */
export default function RulesManager({ stationId = null }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const r = await api.get("rules/?page_size=50");
        const list = r.data?.results || r.data || [];
        if (!mounted) return;
        setRules(list);
      } catch (e) {
        console.error("load rules failed", e);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  async function createRule(e) {
    e?.preventDefault();
    if (!name || !slug) return alert("name & slug required");
    setCreating(true);
    try {
      const payload = { name, slug, description, enabled: true, rule_type: "custom", config: {} };
      const r = await api.post("rules/", payload);
      setRules((p) => [r.data, ...p]);
      setName(""); setSlug(""); setDescription("");
    } catch (err) {
      console.error("create rule failed", err);
      alert("failed to create rule");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <form onSubmit={createRule} className="space-y-2 mb-3">
        <div className="flex gap-2">
          <input placeholder="Name" value={name} onChange={e=>setName(e.target.value)} className="flex-1 border p-2 rounded" />
          <input placeholder="Slug" value={slug} onChange={e=>setSlug(e.target.value)} className="w-36 border p-2 rounded" />
        </div>
        <textarea placeholder="Description (optional)" value={description} onChange={e=>setDescription(e.target.value)} className="w-full border p-2 rounded" />
        <div className="flex gap-2">
          <button disabled={creating} className="px-3 py-1 bg-indigo-600 text-white rounded">{creating ? "Creating..." : "Create Rule"}</button>
        </div>
      </form>

      {loading ? <div className="text-sm text-gray-500">Loading rules...</div> : (
        <div className="space-y-2">
          {rules.length === 0 ? <div className="text-sm text-gray-500">No rules</div> : rules.map(r => (
            <div key={r.id} className="p-2 border rounded flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-medium truncate">{r.name} <span className="text-xs text-gray-400">({r.slug})</span></div>
                <div className="text-xs text-gray-500 truncate">{r.description}</div>
              </div>
              <div className="text-xs text-gray-500">{r.enabled ? "Enabled" : "Disabled"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
