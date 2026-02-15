import React, {useEffect, useState} from 'react'
import api from '../services/api'

export default function RegulatorDashboard(){
  const [anoms,setAnoms] = useState([])
  useEffect(()=>{ api.get('/anomalies/?page_size=50').then(r=> setAnoms(r.data.results || r.data)) },[])
  function csv(){
    const hdr = 'id,rule,severity,tx_id\n'
    const rows = anoms.map(a=> `${a.id},${a.rule?.slug||''},${a.severity},${a.transaction?.id||''}`)
    const csv = hdr + rows.join('\n')
    const blob = new Blob([csv],{type:'text/csv'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download='anomalies.csv'; a.click()
  }
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="card flex justify-between items-center">
        <h3 className="font-medium">Anomalies</h3>
        <button onClick={csv} className="px-3 py-1 rounded bg-slate-100">Export CSV</button>
      </div>
      <div className="space-y-2">
        {anoms.map(a=> (
          <div key={a.id} className="card flex justify-between">
            <div>
              <div className="font-semibold">{a.rule?.slug || 'rule'}</div>
              <div className="text-sm text-muted">{JSON.stringify(a.details)}</div>
            </div>
            <div className="text-sm">{a.severity}</div>
          </div>
        ))}
      </div>
    </div>
  )
}