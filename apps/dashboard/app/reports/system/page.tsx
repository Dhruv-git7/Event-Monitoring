// FILE: apps/dashboard/app/reports/system/page.tsx
'use client'
import { useEffect,useState } from 'react'
import Layout from '../../../components/Layout'
import DataTable from '../../../components/DataTable'
import { getSystemReport } from '../../../lib/api'
export default function SystemReport(){const[report,setReport]=useState<any>(null);async function load(){setReport(await getSystemReport())}useEffect(()=>{load()},[]);return <Layout title="System Information" breadcrumbs={['Reports','System Info']} actions={[{label:'Refresh',onClick:load}]}>{!report?'Loading...':<div style={{display:'grid',gap:10}}><section className="panel" style={{padding:10}}><h3>Platform</h3><p>Version: {report.platform.version}</p><p>Time: {report.platform.time}</p><p>Tenant: {report.platform.tenant}</p></section><section className="panel" style={{padding:10}}><h3>Database</h3><p>PostgreSQL size: {report.database.size}</p><DataTable data={report.database.tables||[]} columns={[{key:'table_name',header:'Table'},{key:'rows',header:'Rows'}]}/></section><section className="panel" style={{padding:10}}><h3>Metrics</h3><pre>{JSON.stringify(report.metrics,null,2)}</pre></section><section className="panel" style={{padding:10}}><h3>Problems</h3><pre>{JSON.stringify(report.problems,null,2)}</pre></section></div>}</Layout>}
