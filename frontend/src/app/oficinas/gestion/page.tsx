"use client";

import React, { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Utensils, Building, User, Sun, Moon, LogOut } from "lucide-react";
import EncargadoPanel from "./EncargadoPanel";

interface SisarSession {
  token: string;
  userRole: number;
  userId: number;
  hospitalName: string | null;
  servicioName: string | null;
  username: string;
}

export default function GestionOficinaPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [session, setSession] = useState<SisarSession | null>(null);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("sisar_session") || localStorage.getItem("sisar_session");
        if (saved) {
          const data = JSON.parse(saved);
          if (data && data.token && (data.userRole === 4 || data.userRole === 1)) {
            setSession(data);
            return;
          }
        }
      } catch (e) {
        console.error("Error verificando sesión de SisAR:", e);
      }
      // Si no hay sesión válida para encargado, redirigir al login principal de SisAR
      window.location.href = "/";
    }
  }, []);

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("sisar_session");
      localStorage.removeItem("sisar_session");
      window.location.href = "/";
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
        <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
          Redirigiendo al inicio de sesión de SisAR...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans transition-colors duration-300">
      <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg shadow-sm border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 rounded-xl shadow-md">
              <Utensils className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 leading-tight">
                SisAR - Módulo Oficinas Públicas
              </h1>
              <p className="text-[11px] font-bold text-gray-400 dark:text-gray-400 tracking-wide">
                Panel del Encargado (Rol 4)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 bg-gray-100 dark:bg-gray-800 px-4 py-2 rounded-2xl border border-gray-200 dark:border-gray-700">
            <Building className="w-4 h-4 text-indigo-500 hidden md:block flex-shrink-0" />
            <div className="hidden md:flex flex-col border-r border-gray-300 dark:border-gray-600 pr-3 mr-1 text-left justify-center">
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200 leading-tight" title="Oficina / Sede">
                {session.hospitalName || "Casa Central - SIPROSA"}
              </span>
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 leading-tight mt-0.5">
                Oficina Administrativa
              </span>
            </div>

            <User className="w-4 h-4 text-gray-500 dark:text-gray-400 ml-2" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {session.username} (Encargado)
            </span>

            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-2"></div>

            {mounted && (
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="p-1 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors focus:outline-none"
                title="Cambiar tema claro / oscuro"
              >
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            )}

            <button
              onClick={handleLogout}
              className="ml-2 p-1 rounded-full text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors focus:outline-none"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
        <EncargadoPanel
          token={session.token}
          hospitalName={session.hospitalName}
          username={session.username}
        />
      </main>
    </div>
  );
}
