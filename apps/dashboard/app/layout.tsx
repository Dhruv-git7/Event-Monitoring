// FILE: apps/dashboard/app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'
import AuthProvider from '../components/AuthProvider'
export const metadata: Metadata = { title: 'Enterprise Monitoring Platform', description: 'Zabbix-style infrastructure monitoring' }
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body><AuthProvider>{children}</AuthProvider></body></html> }
