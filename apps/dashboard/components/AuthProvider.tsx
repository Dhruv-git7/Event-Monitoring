// FILE: apps/dashboard/components/AuthProvider.tsx
'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getMe, logoutUser } from '../lib/api'
const AuthContext=createContext<any>(null)
export function useAuth(){return useContext(AuthContext)}
export default function AuthProvider({children}:{children:React.ReactNode}){const[loading,setLoading]=useState(true);const[user,setUser]=useState<any>(null);const router=useRouter();const path=usePathname();useEffect(()=>{let alive=true;(async()=>{try{const r=await getMe();if(alive)setUser(r.user)}catch{if(path!=='/login')router.replace('/login')}finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[path,router]);async function logout(){await logoutUser().catch(()=>{});setUser(null);router.replace('/login')}if(loading&&path!=='/login')return <div style={{padding:24}}>Loading...</div>;return <AuthContext.Provider value={{user,setUser,loading,logout}}>{children}</AuthContext.Provider>}
