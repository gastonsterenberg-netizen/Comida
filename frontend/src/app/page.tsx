"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import Swal from 'sweetalert2';
import { 
  LogOut, Sun, Moon, AlertTriangle, FileText, Settings, 
  User, Printer, Check, X, Building, Download, Users, Lock, ChevronDown, CheckCircle, Search, Save, Utensils, History
} from "lucide-react";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

type Role = "Jefe" | "Gerente" | "RRHH";

export default function Home() {
  const [role, setRole] = useState<Role | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [hospitalName, setHospitalName] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const [limiteAlmuerzo, setLimiteAlmuerzo] = useState("09:00");
  const [limiteCena, setLimiteCena] = useState("17:00");

  useEffect(() => {
    if (token) {
      fetch("http://localhost:3001/api/hospital/config", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d && d.LimiteAlmuerzo) setLimiteAlmuerzo(d.LimiteAlmuerzo);
        if (d && d.LimiteCena) setLimiteCena(d.LimiteCena);
      }).catch(console.error);
    }
  }, [token]);

  const currentTotalMins = currentTime ? (currentTime.getHours() * 60 + currentTime.getMinutes()) : 0;
  const [lAh, lAm] = limiteAlmuerzo.split(':').map(Number);
  const isPastAlmuerzo = currentTotalMins >= (lAh * 60 + lAm);
  const [lCh, lCm] = limiteCena.split(':').map(Number);
  const isPastCena = currentTotalMins >= (lCh * 60 + lCm);

  const handleLogin = (jwtToken: string, userRole: number, id: number, hospName: string | null, userLoginName: string) => {
    setToken(jwtToken);
    setUserId(id);
    setHospitalName(hospName);
    setUsername(userLoginName);
    if (userRole === 1) setRole("RRHH");
    else if (userRole === 2) setRole("Gerente");
    else if (userRole === 3) setRole("Jefe");
  };

  const handleLogout = () => {
    Swal.fire({
      title: '¿Cerrar sesión?',
      text: "Saldrás de tu cuenta actual.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3b82f6',
      cancelButtonColor: '#ef4444',
      confirmButtonText: 'Sí, salir',
      cancelButtonText: 'Cancelar',
      background: theme === 'dark' ? '#1f2937' : '#ffffff',
      color: theme === 'dark' ? '#ffffff' : '#000000',
    }).then((result) => {
      if (result.isConfirmed) {
        setToken(null);
        setRole(null);
        setUserId(null);
        setHospitalName(null);
        setUsername(null);
      }
    });
  };

  if (!token || !role) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans transition-colors duration-300 selection:bg-blue-200 dark:selection:bg-blue-900">
      <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg shadow-sm border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 rounded-xl shadow-md">
              <Utensils className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
              SisAC - Sistema de Administración de Comida
            </h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className={`hidden md:flex flex-col text-xs border-l-4 ${isPastAlmuerzo && isPastCena ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' : 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'} px-3 py-1.5 rounded-r-lg`}>
              <div className="font-bold mb-0.5">Límites Pedido</div>
              <div>Alm: {limiteAlmuerzo} {isPastAlmuerzo && <span className="font-bold text-red-600 dark:text-red-400">(!)</span>}</div>
              <div>Cen: {limiteCena} {isPastCena && <span className="font-bold text-red-600 dark:text-red-400">(!)</span>}</div>
            </div>

            <div className="flex items-center space-x-3 bg-gray-100 dark:bg-gray-800 px-4 py-2 rounded-full border border-gray-200 dark:border-gray-700">
              <Building className="w-4 h-4 text-indigo-500 hidden md:block" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 hidden md:block border-r border-gray-300 dark:border-gray-600 pr-3 mr-1" title="Efector">
                {hospitalName || "Todos"}
              </span>
              <User className="w-4 h-4 text-gray-500 dark:text-gray-400 ml-2" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {username ? `${username} (${role})` : role}
              </span>
              
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-2"></div>
              
              {mounted && (
                <button 
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="p-1 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors focus:outline-none"
                  title="Cambiar tema"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
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
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {(isPastAlmuerzo || isPastCena) && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/10 border-l-4 border-red-500 p-4 rounded-r-xl shadow-sm flex items-start">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-red-800 dark:text-red-400">Cierre de Pedidos Activo</h3>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">Algunos horarios límite han pasado. Ya no se pueden realizar solicitudes normales para los turnos vencidos.</p>
            </div>
          </div>
        )}

        {role === "Jefe" && <JefePanel isPastAlmuerzo={isPastAlmuerzo} isPastCena={isPastCena} limiteAlmuerzo={limiteAlmuerzo} limiteCena={limiteCena} token={token} userId={userId} />}
        {role === "Gerente" && <GerentePanel token={token} />}
        {role === "RRHH" && <RRHHPanel token={token} />}
      </main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (token: string, roleId: number, id: number, hospitalName: string | null, username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const [tempToken, setTempToken] = useState("");
  const [totp, setTotp] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { theme } = useTheme();

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("http://localhost:3001/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error de credenciales");
      
      if (data.require2FA) {
        setTempToken(data.tempToken);
        if (data.setup && data.qrCode) {
          setQrCodeUrl(data.qrCode);
        }
        setStep(2);
      } else if (data.token) {
        onLogin(data.token, data.user.roleId, data.user.id, data.user.hospitalName || null, data.user.username);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const do2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("http://localhost:3001/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken, token: totp })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Código inválido");
      
      onLogin(data.token, data.user.roleId, data.user.id, data.user.hospitalName || null, data.user.username);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-50 via-gray-50 to-white dark:from-gray-900 dark:via-gray-950 dark:to-black">
      <div className="w-full max-w-md p-8 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 dark:border-gray-800/50 animate-in zoom-in-95 duration-500">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-3 rounded-2xl shadow-lg mb-4">
            <Utensils className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">SisAC</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Sistema de Administración de Comida</p>
        </div>
        
        {error && (
          <div className="mb-6 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-lg flex items-center">
            <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" /> {error}
          </div>
        )}
        
        {step === 1 ? (
          <form onSubmit={doLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Usuario</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input 
                  type="text" 
                  value={username} 
                  onChange={e => setUsername(e.target.value)} 
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-shadow" 
                  placeholder="Ingrese su usuario"
                  required 
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Contraseña</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input 
                  type="password" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-shadow" 
                  placeholder="••••••••"
                  required 
                />
              </div>
            </div>
            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-md text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all transform hover:scale-[1.02] active:scale-95"
            >
              {isLoading ? 'Autenticando...' : 'Iniciar Sesión'}
            </button>
          </form>
        ) : (
          <form onSubmit={do2FA} className="space-y-5">
            {qrCodeUrl && (
              <div className="flex flex-col items-center justify-center p-5 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 mb-4">
                <p className="text-sm text-gray-700 dark:text-gray-300 font-medium mb-4 text-center">Escanea este código con tu app Authenticator</p>
                <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                  <img src={qrCodeUrl} alt="QR Code 2FA" className="w-48 h-48" />
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Código 2FA</label>
              <input 
                type="text" 
                value={totp} 
                onChange={e => setTotp(e.target.value)} 
                className="block w-full text-center tracking-widest font-mono text-xl py-3 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-shadow" 
                placeholder="000000"
                maxLength={6}
                required 
              />
            </div>
            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-md text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all transform hover:scale-[1.02] active:scale-95"
            >
              {isLoading ? 'Verificando...' : 'Verificar Código'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function JefePanel({ isPastAlmuerzo, isPastCena, limiteAlmuerzo, limiteCena, token, userId }: { isPastAlmuerzo: boolean, isPastCena: boolean, limiteAlmuerzo: string, limiteCena: string, token: string, userId: number | null }) {
  const [activeTab, setActiveTab] = useState("Planilla");
  const [planillaTab, setPlanillaTab] = useState<"almuerzo" | "cena">("almuerzo");
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Padron & Plantel Builder
  const [padron, setPadron] = useState<any[]>([]);
  const [plantelDraft, setPlantelDraft] = useState<any[]>([]);
  const [expandedServices, setExpandedServices] = useState<{ [key: string]: boolean }>({});
  const [padronSearchTerm, setPadronSearchTerm] = useState("");

  // Emergency form state
  const [emgNombre, setEmgNombre] = useState("");
  const [emgDni, setEmgDni] = useState("");
  const [emgComida, setEmgComida] = useState("Almuerzo");
  const [emgDieta, setEmgDieta] = useState("Normal");
  const [emgDietaCena, setEmgDietaCena] = useState("Normal");
  const [emgDuracion, setEmgDuracion] = useState("hoy");
  const [emgPeriodoInicio, setEmgPeriodoInicio] = useState("");
  const [emgPeriodoFin, setEmgPeriodoFin] = useState("");
  const [emgTipo, setEmgTipo] = useState("reemplazo");
  const [emgReemplazaId, setEmgReemplazaId] = useState("");
  const [emgJustificacion, setEmgJustificacion] = useState("");
  // Reportes
  const getTodayStr = () => {
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    return today.toISOString().split('T')[0];
  };
  const [repDesde, setRepDesde] = useState("");
  const [repHasta, setRepHasta] = useState("");
  const [repFiltroEmpleado, setRepFiltroEmpleado] = useState("");
  const [reportes, setReportes] = useState<any[]>([]);
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc'|'desc'}>({key: 'fecha', direction: 'desc'});
  const [historialEmergencias, setHistorialEmergencias] = useState<any[]>([]);
  const { theme } = useTheme();
  
  const handleSort = (key: string) => {
    let direction: 'asc'|'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };
  
  const sortedReportes = [...reportes].sort((a, b) => {
    let valA = '';
    let valB = '';
    if (sortConfig.key === 'fecha') { valA = a.FechaPedido; valB = b.FechaPedido; }
    if (sortConfig.key === 'tipo') { valA = a.TipoComida; valB = b.TipoComida; }
    if (sortConfig.key === 'nombre') {
      valA = a.Personal ? `${a.Personal.Apellido} ${a.Personal.Nombre}` : `${a.EmergenciaApellido} ${a.EmergenciaNombre}`;
      valB = b.Personal ? `${b.Personal.Apellido} ${b.Personal.Nombre}` : `${b.EmergenciaApellido} ${b.EmergenciaNombre}`;
    }
    if (sortConfig.key === 'dni') {
      valA = a.Personal ? a.Personal.DNI : a.EmergenciaDNI;
      valB = b.Personal ? b.Personal.DNI : b.EmergenciaDNI;
    }
    if (sortConfig.key === 'estado') { valA = a.Estado; valB = b.Estado; }
    
    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const dietas = ["Normal", "Gastrica", "Diabetica", "Hepatico", "Vegetariano", "Celiaca"];

  const fetchStaff = async () => {
    try {
      const res = await fetch("http://localhost:3001/api/staff/active", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const activeData = data.filter((p: any) => !p.bajaDefinitivaHoy);
        setStaff(activeData);
        // Pre-fill right side list with current active staff
        setPlantelDraft(activeData.map((p: any) => ({
          DNI: p.DNI,
          NombreCompleto: `${p.Apellido}, ${p.Nombre}`,
          Horario: p.Horario === "24h" ? "Guardia 24h" : "Guardia 12h"
        })));
      }
    } catch (e) {
      console.error("Error fetching staff:", e);
    }
  };

  const fetchHistorialEmergencias = async () => {
    try {
      const res = await fetch("http://localhost:3001/api/emergencies/history", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setHistorialEmergencias(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPadron = async () => {
    try {
      const res = await fetch("http://localhost:3001/api/staff/padron", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setPadron(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStaff();
    fetchHistorialEmergencias();
    fetchPadron();
    
    // Set initial dates here to avoid hydration mismatches
    const today = getTodayStr();
    setRepDesde(today);
    setRepHasta(today);
    setEmgPeriodoInicio(today);
    setEmgPeriodoFin(today);
  }, []);

  const filteredPadron = padron.filter(p => 
    p.NombreCompleto.toLowerCase().includes(padronSearchTerm.toLowerCase()) || 
    p.DNI.includes(padronSearchTerm)
  );

  const padronByService = filteredPadron.reduce((acc, p) => {
    const sName = p.Servicio?.Nombre || "Sin Servicio";
    if (!acc[sName]) acc[sName] = [];
    acc[sName].push(p);
    return acc;
  }, {} as Record<string, any[]>);

  const toggleService = (sName: string) => {
    setExpandedServices(prev => ({ ...prev, [sName]: !prev[sName] }));
  };

  const addAgent = (p: any, horario: string) => {
    const existing = plantelDraft.find(x => x.DNI === p.DNI);
    if (existing) {
      if (existing.Horario !== horario) {
        setPlantelDraft(plantelDraft.map(x => x.DNI === p.DNI ? { ...x, Horario: horario } : x));
      }
    } else {
      setPlantelDraft([...plantelDraft, { 
        DNI: p.DNI, 
        NombreCompleto: p.NombreCompleto, 
        Horario: horario 
      }]);
    }
  };

  const removeAgent = (dni: string) => {
    setPlantelDraft(plantelDraft.filter(x => x.DNI !== dni));
  };

  const handleGuardarPlantel = async () => {
    // Convertir el Horario de la BD al formato del Draft para comparar
    const getDraftHorario = (dbHorario: string) => dbHorario === "24h" ? "Guardia 24h" : "Guardia 12h";

    const agentsToAdd = plantelDraft.filter(p => !staff.some(s => s.DNI === p.DNI && getDraftHorario(s.Horario) === p.Horario));
    const agentsToRemove = staff.filter(s => !plantelDraft.some(p => p.DNI === s.DNI && p.Horario === getDraftHorario(s.Horario)));

    if (agentsToAdd.length === 0 && agentsToRemove.length === 0) {
      Swal.fire({ title: "Sin cambios", text: "No hay modificaciones en el plantel", icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }

    try {
      // 1. Process Removals / Updates (Bajas)
      for (const s of agentsToRemove) {
        const bajaRes = await fetch(`http://localhost:3001/api/staff/${s.Id}/baja`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tipo: "DEFINITIVA", motivo: "Reconfiguración de Plantel" })
        });
        if (!bajaRes.ok) {
           const data = await bajaRes.json().catch(()=>({}));
           console.error("Error en baja:", data);
           Swal.fire({ title: "Error removiendo", text: data.error || "No se pudo remover al agente", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
           fetchStaff();
           return;
        }
      }

      // 2. Process Additions
      if (agentsToAdd.length > 0) {
        const res = await fetch("http://localhost:3001/api/staff/plantel", {
           method: "POST",
           headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
           body: JSON.stringify({ plantel: agentsToAdd })
        });
        if (!res.ok) {
           const data = await res.json();
           Swal.fire({ title: "Error agregando", text: data.error, icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
           fetchStaff();
           return;
        }
      }

      Swal.fire({ title: "Éxito", text: "Plantel actualizado correctamente", icon: "success", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      fetchStaff();
    } catch (e) {
      Swal.fire({ title: "Error", text: "Error de conexión al actualizar", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    }
  };



  const [selections, setSelections] = useState<{ [id: number]: { almuerzo: string | null, cena: string | null } }>({});
  const [savedSelections, setSavedSelections] = useState<{ [id: number]: { almuerzo: string | null, cena: string | null } }>({});

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    fetch(`http://localhost:3001/api/reports?fechaInicio=${today}&fechaFin=${today}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(r => r.json())
    .then(data => {
      const newSelections: { [id: number]: { almuerzo: string | null, cena: string | null } } = {};
      data.forEach((r: any) => {
        if (r.PersonalId) {
          if (!newSelections[r.PersonalId]) {
            newSelections[r.PersonalId] = { almuerzo: null, cena: null };
          }
          if (r.TipoComida.toLowerCase() === 'almuerzo') {
            newSelections[r.PersonalId].almuerzo = r.TipoDieta;
          } else if (r.TipoComida.toLowerCase() === 'cena') {
            newSelections[r.PersonalId].cena = r.TipoDieta;
          }
        }
      });
      setSelections(newSelections);
      // Hacemos una copia profunda (deep copy) para que no compartan referencia
      setSavedSelections(JSON.parse(JSON.stringify(newSelections)));
    })
    .catch(console.error);
  }, [token]);

  const toggleSelection = (personalId: number, tipoComida: "almuerzo" | "cena", tipoDieta: string) => {
    const isDeadline = tipoComida === "almuerzo" ? isPastAlmuerzo : isPastCena;
    if (isDeadline) return;

    setSelections(prev => {
      const current = prev[personalId] || { almuerzo: null, cena: null };
      const isSame = current[tipoComida] === tipoDieta;
      return {
        ...prev,
        [personalId]: {
          ...current,
          [tipoComida]: isSame ? null : tipoDieta
        }
      };
    });
  };

  const handleGuardarPedidos = async () => {
    const ordersToSave = Object.keys(selections).map(id => ({
      personalId: Number(id),
      almuerzoDieta: planillaTab === "almuerzo" ? selections[Number(id)].almuerzo : undefined,
      cenaDieta: planillaTab === "cena" ? selections[Number(id)].cena : undefined
    })).filter(o => (planillaTab === "almuerzo" && o.almuerzoDieta !== undefined) || (planillaTab === "cena" && o.cenaDieta !== undefined));

    if (ordersToSave.length === 0) {
      Swal.fire({ title: "Aviso", text: "No hay ningún pedido seleccionado para guardar.", icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }

    try {
      const res = await fetch("http://localhost:3001/api/orders/bulk", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          orders: ordersToSave,
          solicitadoPorUsuarioId: userId,
          tipoComida: planillaTab === "almuerzo" ? "Almuerzo" : "Cena"
        })
      });
      if (res.ok) {
        Swal.fire({ title: "Guardado", text: "Todos los pedidos se guardaron exitosamente.", icon: "success", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        setSavedSelections(prev => {
          const next = JSON.parse(JSON.stringify(prev));
          Object.keys(selections).forEach(idStr => {
            const id = Number(idStr);
            if (!next[id]) next[id] = { almuerzo: null, cena: null };
            if (planillaTab === 'almuerzo') {
              next[id].almuerzo = selections[id].almuerzo;
            } else {
              next[id].cena = selections[id].cena;
            }
          });
          return next;
        });
      } else {
        const data = await res.json();
        Swal.fire({ title: "Error", text: data.error, icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    } catch (e) {
      Swal.fire({ title: "Error", text: "Error al guardar los pedidos", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    }
  };

  const submitEmergency = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const isHoy = emgDuracion === "hoy";
      const start = isHoy ? new Date().toISOString() : emgPeriodoInicio;
      const end = isHoy ? new Date().toISOString() : emgPeriodoFin;

      const res = await fetch("http://localhost:3001/api/emergencies", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          nombre: emgNombre,
          apellido: "", 
          dni: emgDni,
          periodoInicio: start,
          periodoFin: end,
          tipoComida: emgComida,
          tipoDieta: emgDieta,
          tipoDietaCena: emgComida === 'Ambos' ? emgDietaCena : undefined,
          justificacion: emgTipo === "extra" ? emgJustificacion : undefined,
          reemplazaId: emgTipo === "reemplazo" ? emgReemplazaId : undefined,
          solicitadoPorUsuarioId: userId
        })
      });
      if (res.ok) {
        Swal.fire({ title: "Enviado", text: "Solicitud de emergencia creada", icon: "success", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        setEmgNombre(""); setEmgDni(""); setEmgJustificacion("");
        fetchHistorialEmergencias();
      } else {
        const data = await res.json();
        Swal.fire({ title: "Error", text: data.error, icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    } catch (e) {
      Swal.fire({ title: "Error", text: "Error al crear emergencia", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    }
  };

  const handleInhabilitar = async (p: any) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const { value: formValues } = await Swal.fire({
      title: 'Inhabilitar Agente',
      html: `
        <div class="text-sm text-gray-500 mb-4">Configura la inhabilitación para ${p.Nombre} ${p.Apellido}.</div>
        
        <div class="flex flex-col gap-4 text-left">
          
          <div>
            <label class="block text-xs font-bold mb-2">Duración</label>
            <div class="flex gap-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="swal-duracion" value="hoy" checked class="accent-red-500" onchange="document.getElementById('swal-fechas').style.display='none'">
                <span class="text-sm">Solo por hoy</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="swal-duracion" value="rango" class="accent-red-500" onchange="document.getElementById('swal-fechas').style.display='flex'">
                <span class="text-sm">Rango de fechas</span>
              </label>
            </div>
          </div>

          <div id="swal-fechas" style="display: none;" class="flex-col gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <div>
              <label class="block text-xs font-bold mb-1">Desde</label>
              <input id="swal-desde" type="date" value="${todayStr}" class="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white p-2 rounded shadow-sm">
            </div>
            <div>
              <label class="block text-xs font-bold mb-1">Hasta</label>
              <input id="swal-hasta" type="date" value="${todayStr}" class="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white p-2 rounded shadow-sm">
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold mb-1">Motivo</label>
            <select id="swal-motivo" class="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white p-2 rounded shadow-sm">
              <option value="Licencia">Licencia</option>
              <option value="Enfermedad">Enfermedad</option>
              <option value="Maternidad">Maternidad</option>
              <option value="Enfermedad Familiar">Enfermedad Familiar</option>
            </select>
          </div>
          
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Inhabilitar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444',
      background: theme === 'dark' ? '#1f2937' : '#fff', 
      color: theme === 'dark' ? '#fff' : '#000',
      preConfirm: () => {
        const duracion = (document.querySelector('input[name="swal-duracion"]:checked') as HTMLInputElement).value;
        const motivo = (document.getElementById('swal-motivo') as HTMLSelectElement).value;
        if (duracion === 'hoy') {
          return { desde: todayStr, hasta: todayStr, motivo };
        } else {
          return {
            desde: (document.getElementById('swal-desde') as HTMLInputElement).value,
            hasta: (document.getElementById('swal-hasta') as HTMLInputElement).value,
            motivo
          };
        }
      }
    });

    if (formValues) {
      try {
        const res = await fetch(`http://localhost:3001/api/staff/${p.Id}/baja`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tipo: "PROVISORIA", desde: formValues.desde, hasta: formValues.hasta, motivo: formValues.motivo })
        });
        if (res.ok) {
          Swal.fire({ title: "Inhabilitado", text: "El agente ha sido inhabilitado.", icon: "success", timer: 2000, showConfirmButton: false, background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
          setSelections(prev => {
            const next = { ...prev };
            delete next[p.Id];
            return next;
          });
          setSavedSelections(prev => {
            const next = { ...prev };
            delete next[p.Id];
            return next;
          });
          fetchStaff();
        } else {
          Swal.fire({ title: "Error", text: "No se pudo inhabilitar al agente", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        }
      } catch (e) {
        Swal.fire({ title: "Error", text: "Error de conexión", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    }
  };

  const handleRevertir = async (p: any) => {
    const { isConfirmed } = await Swal.fire({
      title: '¿Revertir Inhabilitación?',
      text: `¿Estás seguro de que deseas habilitar nuevamente a ${p.Nombre} ${p.Apellido}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, revertir',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#22c55e',
      background: theme === 'dark' ? '#1f2937' : '#fff', 
      color: theme === 'dark' ? '#fff' : '#000'
    });

    if (isConfirmed) {
      try {
        const res = await fetch(`http://localhost:3001/api/staff/${p.Id}/revertir-baja`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          Swal.fire({ title: "Revertido", text: "El agente vuelve a estar habilitado.", icon: "success", timer: 2000, showConfirmButton: false, background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
          fetchStaff();
        } else {
          Swal.fire({ title: "Error", text: "No se pudo revertir", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        }
      } catch (e) {
        Swal.fire({ title: "Error", text: "Error de conexión", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    }
  };

  const generarReporte = async () => {
    try {
      const res = await fetch(`http://localhost:3001/api/reports?fechaInicio=${repDesde}&fechaFin=${repHasta}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReportes(data);
      }
    } catch (e) {
      Swal.fire({ title: "Error", text: "Error al generar reporte", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    }
  };

  const exportExcel = () => {
    if (reportes.length === 0) return Swal.fire({ title: "Aviso", text: "No hay reportes para exportar.", icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    let csv = "Fecha,Tipo,Personal/Paciente,DNI,Dieta,Estado\n";
    const filtered = sortedReportes.filter(r => {
      if (!repFiltroEmpleado) return true;
      const term = repFiltroEmpleado.toLowerCase();
      const name = r.Personal ? `${r.Personal.Nombre} ${r.Personal.Apellido}`.toLowerCase() : `${r.EmergenciaNombre} ${r.EmergenciaApellido}`.toLowerCase();
      const dni = r.Personal ? (r.Personal.DNI || "").toLowerCase() : (r.EmergenciaDNI || "").toLowerCase();
      return name.includes(term) || dni.includes(term);
    });
    filtered.forEach(r => {
      const fecha = r.FechaPedido.split('T')[0].split('-').reverse().join('/');
      const name = r.Personal ? `${r.Personal.Nombre} ${r.Personal.Apellido}` : `${r.EmergenciaNombre} ${r.EmergenciaApellido}`;
      const dni = r.Personal ? r.Personal.DNI : r.EmergenciaDNI;
      csv += `${fecha},${r.TipoComida},"${name}",${dni},${r.TipoDieta},${r.Estado}\n`;
    });
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Reporte_${repDesde}_al_${repHasta}.csv`;
    link.click();
  };

  const exportPDF = () => {
    if (reportes.length === 0) return Swal.fire({ title: "Aviso", text: "No hay reportes para exportar.", icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    const printWindow = window.open('', '', 'width=800,height=600');
    if (!printWindow) return;
    const filtered = sortedReportes.filter(r => {
      if (!repFiltroEmpleado) return true;
      const term = repFiltroEmpleado.toLowerCase();
      const name = r.Personal ? `${r.Personal.Nombre} ${r.Personal.Apellido}`.toLowerCase() : `${r.EmergenciaNombre} ${r.EmergenciaApellido}`.toLowerCase();
      const dni = r.Personal ? (r.Personal.DNI || "").toLowerCase() : (r.EmergenciaDNI || "").toLowerCase();
      return name.includes(term) || dni.includes(term);
    });
    let html = `<html><head><title>Reporte de Comidas</title><style>
      body { font-family: sans-serif; padding: 20px; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background-color: #f2f2f2; -webkit-print-color-adjust: exact; }
    </style></head><body>
      <h2>Reporte de Comidas (${repDesde.split('-').reverse().join('/')} al ${repHasta.split('-').reverse().join('/')})</h2>
      <table><thead><tr><th>Fecha</th><th>Tipo</th><th>Personal / Paciente</th><th>DNI</th><th>Dieta</th><th>Estado</th></tr></thead><tbody>`;
    filtered.forEach(r => {
      const fecha = r.FechaPedido.split('T')[0].split('-').reverse().join('/');
      const name = r.Personal ? `${r.Personal.Nombre} ${r.Personal.Apellido}` : `${r.EmergenciaNombre} ${r.EmergenciaApellido}`;
      const dni = r.Personal ? r.Personal.DNI : r.EmergenciaDNI;
      html += `<tr><td>${fecha}</td><td>${r.TipoComida}</td><td>${name}</td><td>${dni}</td><td>${r.TipoDieta}</td><td>${r.Estado}</td></tr>`;
    });
    html += `</tbody></table></body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  };

  const tabs = [
    { id: "Planilla", label: "Planilla", icon: <Users className="w-4 h-4 mr-2" /> },
    { id: "Emergencias", label: "Emergencias", icon: <AlertTriangle className="w-4 h-4 mr-2" /> },
    { id: "Plantel", label: "Configurar Plantel", icon: <Users className="w-4 h-4 mr-2" /> },
    { id: "Reportes", label: "Reportes", icon: <Search className="w-4 h-4 mr-2" /> }
  ];

  const hasUnsavedChanges = Object.keys(selections).some(idStr => {
    const id = Number(idStr);
    const current = selections[id];
    const saved = savedSelections[id] || { almuerzo: null, cena: null };
    if (planillaTab === 'almuerzo') {
      return (current.almuerzo || null) !== (saved.almuerzo || null);
    } else {
      return (current.cena || null) !== (saved.cena || null);
    }
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* TABS NAVIGATION */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-1.5 flex flex-wrap gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === tab.id 
                ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* SECCION: PLANILLA PERSONAL */}
      {activeTab === "Planilla" && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden transition-colors animate-in fade-in zoom-in-95 duration-300">
        <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
                <Users className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" /> Planilla de Personal
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Selecciona la dieta deseada para el personal activo.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs font-bold px-3 py-1.5 rounded-full border border-blue-200 dark:border-blue-800">
                Activos: {staff.length}
              </span>
              <button 
                onClick={handleGuardarPedidos} 
                disabled={(planillaTab === 'almuerzo' ? isPastAlmuerzo : isPastCena) || !hasUnsavedChanges} 
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-95 flex items-center"
              >
                <Save className="w-4 h-4 mr-2" /> Guardar {planillaTab === 'almuerzo' ? 'Almuerzo' : 'Cena'}
              </button>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => setPlanillaTab("almuerzo")}
              className={`flex-1 py-2 text-sm font-bold rounded-t-lg transition-colors ${planillaTab === 'almuerzo' ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 border-t border-l border-r border-gray-200 dark:border-gray-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border-b border-transparent'}`}
            >
              ALMUERZO {isPastAlmuerzo && <span className="text-red-500 font-normal text-[10px] sm:text-xs ml-1 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">(Fuera de Hora)</span>}
            </button>
            <button
              onClick={() => setPlanillaTab("cena")}
              className={`flex-1 py-2 text-sm font-bold rounded-t-lg transition-colors ${planillaTab === 'cena' ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 border-t border-l border-r border-gray-200 dark:border-gray-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border-b border-transparent'}`}
            >
              CENA {isPastCena && <span className="text-red-500 font-normal text-[10px] sm:text-xs ml-1 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">(Fuera de Hora)</span>}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky left-0 bg-gray-50 dark:bg-gray-800/90 z-10">Personal</th>
                {dietas.map(d => (
                  <th key={d} scope="col" className="px-4 py-4 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{d}</th>
                ))}
                <th scope="col" className="px-4 py-4 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky right-0 bg-gray-50 dark:bg-gray-800/90 z-10">Estado</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800/50">
              {staff.map((p) => {
                const pSelections = selections[p.Id] || { almuerzo: null, cena: null };
                const currentSelection = planillaTab === 'almuerzo' ? pSelections.almuerzo : pSelections.cena;
                const isDisabled = planillaTab === 'almuerzo' ? isPastAlmuerzo : isPastCena;
                return (
                  <tr key={p.Id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-900 z-10 border-r border-gray-100 dark:border-gray-800">
                      <div className="flex flex-col">
                        <div className="flex items-center">
                          <span className={`text-sm font-bold ${p.bajaProvisoriaHoy ? 'text-red-500 line-through' : 'text-gray-900 dark:text-gray-100'}`}>{p.Nombre} {p.Apellido}</span>
                          {p.bajaProvisoriaHoy && p.bajaMotivo && (
                            <span className="text-[10px] uppercase font-bold text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded ml-2 border border-red-200 dark:border-red-800">
                              {p.bajaMotivo}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">DNI: {p.DNI} • {p.Horario}</span>
                      </div>
                    </td>
                    {dietas.map(d => {
                      const isSelected = currentSelection === d;
                      const cellDisabled = isDisabled || p.bajaProvisoriaHoy;
                      const handleClick = () => {
                        if (cellDisabled) {
                          const msg = p.bajaProvisoriaHoy ? "Este agente está inhabilitado por hoy." : `El horario límite para solicitar ${planillaTab} (${planillaTab === 'almuerzo' ? limiteAlmuerzo : limiteCena}hs) ya ha pasado.`;
                          Swal.fire({
                            title: p.bajaProvisoriaHoy ? "Agente Inhabilitado" : "Horario Vencido",
                            text: msg,
                            icon: "warning",
                            toast: true,
                            position: 'top-end',
                            showConfirmButton: false,
                            timer: 3000,
                            background: theme === 'dark' ? '#1f2937' : '#fff', 
                            color: theme === 'dark' ? '#fff' : '#000'
                          });
                          return;
                        }
                        toggleSelection(p.Id, planillaTab, d);
                      };
                      return (
                        <td key={`${p.Id}-${d}`} className={`px-4 py-4 text-center ${cellDisabled ? 'cursor-not-allowed bg-gray-50 dark:bg-gray-800/40 opacity-70' : 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/70 transition-colors'}`} onClick={handleClick}>
                          <input 
                            type="radio" 
                            name={`dieta-${p.Id}`} 
                            checked={isSelected}
                            readOnly
                            disabled={cellDisabled}
                            className={`w-5 h-5 accent-blue-600 ${cellDisabled ? 'cursor-not-allowed grayscale' : 'cursor-pointer'}`}
                          />
                        </td>
                      );
                    })}
                    <td className="px-4 py-4 text-center whitespace-nowrap sticky right-0 bg-white dark:bg-gray-900 z-10 border-l border-gray-100 dark:border-gray-800">
                      {p.bajaProvisoriaHoy ? (
                        <button onClick={() => handleRevertir(p)} title="Revertir Inhabilitación" className="px-3 py-1.5 bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40 rounded-lg text-xs font-bold transition-colors">
                          ♻️ Revertir
                        </button>
                      ) : (
                        <button onClick={() => handleInhabilitar(p)} title="Inhabilitar Agente" className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 rounded-lg text-xs font-bold transition-colors">
                          🛑 Inhabilitar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* SECCION: EMERGENCIA */}
      {activeTab === "Emergencias" && (
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-orange-200 dark:border-orange-900/30 overflow-hidden animate-in fade-in zoom-in-95 duration-300 flex flex-col gap-6 p-6">
          
          <div className="border-b border-gray-200 dark:border-gray-800 pb-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2 text-orange-500" /> Solicitud de Emergencia
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Para reemplazos de personal inhabilitado o agregados extra justificados.</p>
          </div>

          <form className="flex flex-col gap-6" onSubmit={submitEmergency}>
            
            {/* ROW 1: Nombre y DNI */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre y Apellido</label>
                <input type="text" value={emgNombre} onChange={e => setEmgNombre(e.target.value)} disabled={isPastAlmuerzo && isPastCena} className="w-full rounded-lg border-gray-300 dark:border-gray-700 shadow-sm focus:border-orange-500 focus:ring-orange-500/50 sm:text-sm disabled:opacity-50 px-3 py-2.5 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="Ej. Carlos Ruiz" required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">DNI</label>
                <input type="text" value={emgDni} onChange={e => setEmgDni(e.target.value)} disabled={isPastAlmuerzo && isPastCena} className="w-full rounded-lg border-gray-300 dark:border-gray-700 shadow-sm focus:border-orange-500 focus:ring-orange-500/50 sm:text-sm disabled:opacity-50 px-3 py-2.5 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="Ej. 11223344" required />
              </div>
            </div>

            {/* ROW 2: Comida, Dieta, Duracion */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 bg-gray-50 dark:bg-gray-800/30 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Comida</label>
                <div className="flex gap-4">
                  {!isPastAlmuerzo && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="emgComida" value="Almuerzo" checked={emgComida === 'Almuerzo'} onChange={() => setEmgComida('Almuerzo')} className="accent-orange-500 w-4 h-4" /> <span className="text-sm">Almuerzo</span>
                    </label>
                  )}
                  {!isPastCena && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="emgComida" value="Cena" checked={emgComida === 'Cena'} onChange={() => setEmgComida('Cena')} className="accent-orange-500 w-4 h-4" /> <span className="text-sm">Cena</span>
                    </label>
                  )}
                  {(!isPastAlmuerzo && !isPastCena) && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="emgComida" value="Ambos" checked={emgComida === 'Ambos'} onChange={() => setEmgComida('Ambos')} className="accent-orange-500 w-4 h-4" /> <span className="text-sm">Ambos</span>
                    </label>
                  )}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  {emgComida === 'Ambos' ? 'Dieta Almuerzo' : 'Dieta'}
                </label>
                <select value={emgDieta} onChange={e => setEmgDieta(e.target.value)} disabled={isPastAlmuerzo && isPastCena} className="w-full rounded-lg border-gray-300 dark:border-gray-700 shadow-sm focus:border-orange-500 sm:text-sm px-3 py-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                  {dietas.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                
                {emgComida === 'Ambos' && (
                  <div className="mt-3">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Dieta Cena</label>
                    <select value={emgDietaCena} onChange={e => setEmgDietaCena(e.target.value)} disabled={isPastAlmuerzo && isPastCena} className="w-full rounded-lg border-gray-300 dark:border-gray-700 shadow-sm focus:border-orange-500 sm:text-sm px-3 py-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                      {dietas.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Duración</label>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="emgDuracion" value="hoy" checked={emgDuracion === 'hoy'} onChange={() => setEmgDuracion('hoy')} className="accent-orange-500 w-4 h-4" /> <span className="text-sm">Solo por hoy</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="emgDuracion" value="rango" checked={emgDuracion === 'rango'} onChange={() => setEmgDuracion('rango')} className="accent-orange-500 w-4 h-4" /> <span className="text-sm">Rango de fechas</span>
                    </label>
                  </div>
                  {emgDuracion === 'rango' && (
                    <div className="flex gap-2 mt-1">
                      <input type="date" value={emgPeriodoInicio} onChange={e => setEmgPeriodoInicio(e.target.value)} className="w-full rounded border-gray-300 dark:border-gray-700 sm:text-xs px-2 py-1 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                      <input type="date" value={emgPeriodoFin} onChange={e => setEmgPeriodoFin(e.target.value)} className="w-full rounded border-gray-300 dark:border-gray-700 sm:text-xs px-2 py-1 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ROW 3: Tipo de Emergencia */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Tipo de Solicitud</label>
                <div className="flex gap-4 mb-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="emgTipo" value="reemplazo" checked={emgTipo === 'reemplazo'} onChange={() => setEmgTipo('reemplazo')} className="accent-orange-500 w-4 h-4" /> <span className="text-sm">Reemplazo de Personal</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="emgTipo" value="extra" checked={emgTipo === 'extra'} onChange={() => setEmgTipo('extra')} className="accent-orange-500 w-4 h-4" /> <span className="text-sm">Agregado Extra</span>
                  </label>
                </div>
                
                {emgTipo === 'reemplazo' && (
                  <select value={emgReemplazaId} onChange={e => setEmgReemplazaId(e.target.value)} required={emgTipo === 'reemplazo'} className="w-full rounded-lg border-gray-300 dark:border-gray-700 shadow-sm focus:border-orange-500 sm:text-sm px-3 py-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                    <option value="">-- Seleccionar a quién reemplaza --</option>
                    {staff.filter(p => p.bajaProvisoriaHoy || p.bajaDefinitivaHoy).map(p => (
                      <option key={p.Id} value={p.Id}>{p.Nombre} {p.Apellido} (DNI: {p.DNI})</option>
                    ))}
                  </select>
                )}
                
                {emgTipo === 'extra' && (
                  <textarea value={emgJustificacion} onChange={e => setEmgJustificacion(e.target.value)} required={emgTipo === 'extra'} rows={2} className="w-full rounded-lg border-gray-300 dark:border-gray-700 shadow-sm focus:border-orange-500 sm:text-sm px-3 py-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="Escribe aquí la justificación obligatoria..."></textarea>
                )}
              </div>
            </div>

            <div className="flex justify-end mt-2 pt-4 border-t border-gray-200 dark:border-gray-800">
              <button type="submit" disabled={isPastAlmuerzo && isPastCena} className="inline-flex items-center justify-center py-2.5 px-6 border border-transparent shadow-sm text-sm font-bold rounded-lg text-white bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 transition-all transform hover:scale-[1.02] active:scale-95">
                <CheckCircle className="w-4 h-4 mr-2" /> Enviar Solicitud de Emergencia
              </button>
            </div>
          </form>
        </div>
      )}

      {/* HISTORIAL DE EMERGENCIAS */}
      {activeTab === "Emergencias" && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden mt-6 animate-in fade-in zoom-in-95 duration-300">
          <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
              <History className="w-5 h-5 mr-2 text-blue-500" /> Solicitudes Recientes (Últimos 5 Días)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                  <th className="p-4 font-semibold text-sm text-gray-600 dark:text-gray-400">Fecha</th>
                  <th className="p-4 font-semibold text-sm text-gray-600 dark:text-gray-400">Paciente/Agente</th>
                  <th className="p-4 font-semibold text-sm text-gray-600 dark:text-gray-400">Comida</th>
                  <th className="p-4 font-semibold text-sm text-gray-600 dark:text-gray-400">Tipo</th>
                  <th className="p-4 font-semibold text-sm text-gray-600 dark:text-gray-400">Estado</th>
                </tr>
              </thead>
              <tbody>
                {historialEmergencias.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500 dark:text-gray-400">No hay solicitudes recientes.</td>
                  </tr>
                ) : (
                  historialEmergencias.map((h: any) => {
                    let badgeClass = "bg-yellow-100 text-yellow-800 border-yellow-200";
                    if (h.Estado === "Aprobado") badgeClass = "bg-green-100 text-green-800 border-green-200";
                    if (h.Estado === "Rechazado") badgeClass = "bg-red-100 text-red-800 border-red-200";
                    
                    const isReemplazo = h.EmergenciaReemplazaId !== null;

                    return (
                      <tr key={h.Id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="p-4 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                          {new Date(h.FechaPedido).toLocaleDateString()}
                        </td>
                        <td className="p-4 text-sm text-gray-700 dark:text-gray-300">
                          {h.EmergenciaNombre} {h.EmergenciaApellido} <span className="text-gray-500 text-xs">({h.EmergenciaDNI})</span>
                        </td>
                        <td className="p-4 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {h.TipoComida} <span className="text-gray-400 text-xs">({h.TipoDieta})</span>
                        </td>
                        <td className="p-4 text-sm text-gray-700 dark:text-gray-300">
                          {isReemplazo ? (
                            <span className="inline-flex items-center text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-0.5 rounded-full text-xs border border-blue-200 dark:border-blue-800">
                              Reemplazo: {h.PersonalReemplazado?.Nombre} {h.PersonalReemplazado?.Apellido}
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2.5 py-0.5 rounded-full text-xs border border-purple-200 dark:border-purple-800">
                              Agregado Extra
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-sm">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeClass}`}>
                            {h.Estado}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECCION: ARCHIVO (AHORA DUAL LIST) */}
      {activeTab === "Plantel" && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
          <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
              <Users className="w-5 h-5 mr-2 text-blue-500" /> Configuración de Plantel
            </h2>
            <button 
              onClick={handleGuardarPlantel}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md hover:from-blue-700 hover:to-indigo-700 transition-all transform hover:scale-[1.02] active:scale-95 flex items-center"
            >
              <Save className="w-4 h-4 mr-2" /> Guardar Plantel
            </button>
          </div>
          
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 min-h-[500px]">
            {/* IZQUIERDA: Padrón General */}
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl flex flex-col bg-gray-50/30 dark:bg-gray-800/10">
              <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800/50">
                <h3 className="font-bold text-gray-700 dark:text-gray-300">Padrón de Agentes</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Click para agregar al plantel</p>
                <div className="mt-3 relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar por DNI o Apellido..."
                    value={padronSearchTerm}
                    onChange={e => setPadronSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                  />
                </div>
              </div>
              <div className="p-4 overflow-y-auto max-h-[500px] space-y-3">
                {Object.keys(padronByService).sort((a, b) => a.localeCompare(b)).map(sName => {
                  const isExpanded = padronSearchTerm.trim() !== "" || expandedServices[sName];
                  return (
                  <div key={sName} className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 overflow-hidden">
                    <button 
                      onClick={() => toggleService(sName)}
                      className="w-full flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <span className="font-bold text-sm text-gray-800 dark:text-gray-200">{sName}</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    {isExpanded && (
                      <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {padronByService[sName].sort((a, b) => a.NombreCompleto.localeCompare(b.NombreCompleto)).map(p => {
                          const draftEntry = plantelDraft.find(draft => draft.DNI === p.DNI);
                          const isSelected = !!draftEntry;
                          const dbAssigned = staff.find(s => s.DNI === p.DNI);
                          
                          // Global assignments from backend excluding THIS service's DB state
                          const externalHas24h = dbAssigned?.Horario.includes('24h') ? false : p.has24h;
                          const externalCount12h = p.count12h - (dbAssigned?.Horario.includes('12h') ? 1 : 0);

                          const isAssignedElsewhere = !isSelected && (externalHas24h || externalCount12h > 0);
                          const disable12h = externalHas24h || externalCount12h >= 2;
                          const disable24h = externalHas24h || externalCount12h > 0;

                          // For selected agents, disable the button of their CURRENT draft shift
                          const isDraft12h = draftEntry?.Horario?.includes('12h');
                          const isDraft24h = draftEntry?.Horario?.includes('24h');

                          // Color classes
                          let containerClass = "p-3 text-sm flex justify-between items-center transition-colors group ";
                          if (isSelected) {
                            containerClass += "bg-gray-50/80 dark:bg-gray-800/80"; // Removed grayscale so buttons retain color
                          } else if (isAssignedElsewhere) {
                            containerClass += "bg-blue-50/50 dark:bg-blue-900/10 border-l-2 border-blue-300 dark:border-blue-700";
                          } else {
                            containerClass += "hover:bg-blue-50 dark:hover:bg-blue-900/20";
                          }

                          let textClass = "font-semibold ";
                          if (isSelected) textClass += "text-gray-500 opacity-60";
                          else if (isAssignedElsewhere) textClass += "text-blue-700 dark:text-blue-300";
                          else textClass += "text-gray-900 dark:text-gray-100";

                          return (
                          <div key={p.DNI} className={containerClass}>
                            <div>
                              <p className={textClass}>{p.NombreCompleto}</p>
                              <p className={`text-xs ${isSelected ? 'text-gray-400 opacity-60' : 'text-gray-500 dark:text-gray-400'}`}>
                                DNI: {p.DNI}
                                {isAssignedElsewhere && <span className="ml-2 text-blue-500 text-[10px] uppercase font-bold tracking-wider">Otro Servicio</span>}
                              </p>
                            </div>
                            <div className="flex space-x-2">
                              <button
                                onClick={() => addAgent(p, "Guardia 12h")}
                                disabled={disable12h || isDraft12h}
                                className={`px-2 py-1 text-xs font-bold rounded shadow-sm transition-colors ${disable12h || isDraft12h ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600' : 'bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-800/60 text-blue-700 dark:text-blue-300'}`}
                                title="Asignar Guardia 12h"
                              >
                                {isDraft12h ? '✓ 12h' : '12h'}
                              </button>
                              <button
                                onClick={() => addAgent(p, "Guardia 24h")}
                                disabled={disable24h || isDraft24h}
                                className={`px-2 py-1 text-xs font-bold rounded shadow-sm transition-colors ${disable24h || isDraft24h ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600' : 'bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/40 dark:hover:bg-indigo-800/60 text-indigo-700 dark:text-indigo-300'}`}
                                title="Asignar Guardia 24h"
                              >
                                {isDraft24h ? '✓ 24h' : '24h'}
                              </button>
                            </div>
                          </div>
                        )})}
                      </div>
                    )}
                  </div>
                )})}
              </div>
            </div>

            {/* DERECHA: Plantel Seleccionado */}
            <div className="border border-indigo-200 dark:border-indigo-900/30 rounded-xl flex flex-col bg-white dark:bg-gray-900 shadow-sm">
              <div className="p-4 border-b border-indigo-200 dark:border-indigo-900/30 bg-indigo-50/50 dark:bg-indigo-900/10 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-indigo-900 dark:text-indigo-100">Agentes del Plantel</h3>
                  <p className="text-xs text-indigo-500 dark:text-indigo-400">Define el horario para cada uno</p>
                </div>
                <span className="bg-indigo-200 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200 text-xs font-bold px-3 py-1 rounded-full">
                  {plantelDraft.length}
                </span>
              </div>
              <div className="p-4 overflow-y-auto max-h-[500px] space-y-2">
                {plantelDraft.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Agrega agentes desde el padrón izquierdo</p>
                  </div>
                ) : (
                  [...plantelDraft].sort((a, b) => a.NombreCompleto.localeCompare(b.NombreCompleto)).map(p => (
                    <div key={p.DNI} className="flex flex-col sm:flex-row justify-between sm:items-center p-3 border border-indigo-100 dark:border-indigo-800 rounded-lg bg-indigo-50/30 dark:bg-indigo-900/20 gap-3 hover:border-indigo-300 transition-colors">
                      <div className="flex-1">
                        <p className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">{p.NombreCompleto}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">DNI: {p.DNI}</p>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="text-xs font-bold px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-md">
                          {p.Horario}
                        </span>
                        <button 
                          onClick={() => removeAgent(p.DNI)}
                          className="text-red-400 hover:text-red-600 dark:hover:text-red-300 p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors bg-white dark:bg-gray-800 shadow-sm"
                          title="Quitar del plantel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECCION: REPORTES */}
      {activeTab === "Reportes" && (
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
            <Search className="w-5 h-5 mr-2 text-indigo-500" /> Reportes y Consultas
          </h2>
        </div>
        <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex flex-wrap gap-4 items-end bg-white dark:bg-gray-900">
          <div className="w-full sm:w-48">
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Fecha Desde</label>
            <input type="date" value={repDesde} onChange={e => setRepDesde(e.target.value)} className="w-full text-sm border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500/50 px-3 py-2.5 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-colors" />
          </div>
          <div className="w-full sm:w-48">
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Fecha Hasta</label>
            <input type="date" value={repHasta} onChange={e => setRepHasta(e.target.value)} className="w-full text-sm border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500/50 px-3 py-2.5 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-colors" />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button onClick={generarReporte} className="flex-1 sm:flex-none flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg shadow-sm font-bold transition-colors">
              <Search className="w-4 h-4 mr-2" /> Buscar
            </button>
            <button onClick={exportExcel} disabled={reportes.length === 0} className={`flex-1 sm:flex-none flex items-center justify-center px-4 py-2.5 rounded-lg shadow-sm font-bold transition-colors ${reportes.length === 0 ? 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`} title="Exportar a Excel (CSV)">
              EXCEL
            </button>
            <button onClick={exportPDF} disabled={reportes.length === 0} className={`flex-1 sm:flex-none flex items-center justify-center px-4 py-2.5 rounded-lg shadow-sm font-bold transition-colors ${reportes.length === 0 ? 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white'}`} title="Exportar a PDF">
              PDF
            </button>
          </div>
          <div className="w-full lg:flex-1">
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Filtro rápido (DNI o Nombre)</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input type="text" value={repFiltroEmpleado} onChange={e => setRepFiltroEmpleado(e.target.value)} placeholder="Ej. Juan Perez..." className="block w-full pl-9 pr-3 py-2.5 text-sm border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500/50 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-colors" />
            </div>
          </div>
        </div>
        <div className="p-0 overflow-x-auto">
          {reportes.length === 0 ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-12 flex flex-col items-center">
              <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
              Vista previa del reporte (Selecciona fechas y presiona Buscar)
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th onClick={() => handleSort('fecha')} className="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Fecha {sortConfig.key==='fecha' && (sortConfig.direction==='asc'?'↑':'↓')}</th>
                  <th onClick={() => handleSort('tipo')} className="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Tipo {sortConfig.key==='tipo' && (sortConfig.direction==='asc'?'↑':'↓')}</th>
                  <th onClick={() => handleSort('nombre')} className="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Personal / Paciente {sortConfig.key==='nombre' && (sortConfig.direction==='asc'?'↑':'↓')}</th>
                  <th onClick={() => handleSort('dni')} className="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">DNI {sortConfig.key==='dni' && (sortConfig.direction==='asc'?'↑':'↓')}</th>
                  <th onClick={() => handleSort('estado')} className="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Estado {sortConfig.key==='estado' && (sortConfig.direction==='asc'?'↑':'↓')}</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                {sortedReportes.filter(r => {
                  if (!repFiltroEmpleado) return true;
                  const term = repFiltroEmpleado.toLowerCase();
                  const name = r.Personal ? `${r.Personal.Nombre} ${r.Personal.Apellido}`.toLowerCase() : `${r.EmergenciaNombre} ${r.EmergenciaApellido}`.toLowerCase();
                  const dni = r.Personal ? (r.Personal.DNI || "").toLowerCase() : (r.EmergenciaDNI || "").toLowerCase();
                  return name.includes(term) || dni.includes(term);
                }).map((r) => (
                  <tr key={r.Id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">{r.FechaPedido.split('T')[0].split('-').reverse().join('/')}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${r.TipoComida.toLowerCase() === 'almuerzo' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300'}`}>
                        {r.TipoComida}
                      </span>
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{r.TipoDieta}</span>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900 dark:text-gray-100">{r.Personal ? `${r.Personal.Nombre} ${r.Personal.Apellido}` : `${r.EmergenciaNombre} ${r.EmergenciaApellido}`}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{r.Personal ? r.Personal.DNI : r.EmergenciaDNI}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${r.Estado === 'Aprobado' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : r.Estado === 'Rechazado' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'}`}>
                        {r.Estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

function GerentePanel({ token }: { token: string }) {
  const [emergencias, setEmergencias] = useState<any[]>([]);
  const [resolucionTxt, setResolucionTxt] = useState<{ [id: number]: string }>({});
  const [activeTab, setActiveTab] = useState("Bandeja");
  
  // ABM Servicios
  const [servicios, setServicios] = useState<any[]>([]);
  const [nuevoServicio, setNuevoServicio] = useState("");

  // ABM Jefe Servicio
  const [jefeUsername, setJefeUsername] = useState("");
  const [jefePassword, setJefePassword] = useState("");
  const [jefeServicioId, setJefeServicioId] = useState("");

  // Reportes & Config
  const [repDesde, setRepDesde] = useState("");
  const [repHasta, setRepHasta] = useState("");
  const [repFiltroEmpleado, setRepFiltroEmpleado] = useState("");
  const [reportes, setReportes] = useState<any[]>([]);
  const [configAlmuerzo, setConfigAlmuerzo] = useState("09:00");
  const [configCena, setConfigCena] = useState("17:00");
  const { theme } = useTheme();

  const fetchEmergencias = async () => {
    try {
      const res = await fetch("http://localhost:3001/api/emergencies/pending", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEmergencias(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchServicios = async () => {
    try {
      const res = await fetch("http://localhost:3001/api/services", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setServicios(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchEmergencias();
    fetchServicios();
    fetch("http://localhost:3001/api/hospital/config", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d && d.LimiteAlmuerzo) setConfigAlmuerzo(d.LimiteAlmuerzo);
        if (d && d.LimiteCena) setConfigCena(d.LimiteCena);
      })
      .catch(console.error);
  }, [token]);

  const resolveEmergency = async (id: number, estado: string) => {
    const justificacion = resolucionTxt[id];
    if (!justificacion) {
      Swal.fire({ title: "Atención", text: "La justificación es obligatoria", icon: "warning", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }

    try {
      const res = await fetch(`http://localhost:3001/api/emergencies/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estado, justificacionResolucion: justificacion })
      });
      if (res.ok) {
        Swal.fire({ title: "Éxito", text: `Emergencia ${estado}`, icon: "success", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        fetchEmergencias();
      } else {
        const data = await res.json();
        Swal.fire({ title: "Error", text: data.error, icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    } catch (e) {
      Swal.fire({ title: "Error", text: "Error al resolver emergencia", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    }
  };

  const crearServicio = async () => {
    if (!nuevoServicio) return;
    try {
      const res = await fetch("http://localhost:3001/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nombre: nuevoServicio })
      });
      if (res.ok) {
        Swal.fire({ title: "Éxito", text: "Servicio creado", icon: "success", timer: 1500, background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        setNuevoServicio("");
        fetchServicios();
      }
    } catch (e) {
      Swal.fire({ title: "Error", text: "Error al crear servicio", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    }
  };

  const asignarJefe = async () => {
    try {
      const res = await fetch("http://localhost:3001/api/users/jefe-servicio", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: jefeUsername, password: jefePassword, servicioId: Number(jefeServicioId) })
      });
      if (res.ok) {
        Swal.fire({ title: "Éxito", text: "Jefe asignado exitosamente", icon: "success", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        setJefeUsername(""); setJefePassword(""); setJefeServicioId("");
      } else {
        const data = await res.json();
        Swal.fire({ title: "Error", text: data.error, icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    } catch (e) {
      Swal.fire({ title: "Error", text: "Error al asignar jefe", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    }
  };

  const generarReporte = async () => {
    try {
      const res = await fetch(`http://localhost:3001/api/reports?fechaInicio=${repDesde}&fechaFin=${repHasta}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReportes(data);
      }
    } catch (e) {
      Swal.fire({ title: "Error", text: "Error al generar reporte", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    }
  };

  const guardarConfiguracion = async () => {
    try {
      const res = await fetch("http://localhost:3001/api/hospital/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ limiteAlmuerzo: configAlmuerzo, limiteCena: configCena })
      });
      if (res.ok) {
        Swal.fire({ title: "Guardado", text: "Configuración guardada", icon: "success", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    } catch {
      Swal.fire({ title: "Error", text: "No se pudo guardar la configuración.", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    }
  };

  const handleImprimirVouchers = () => {
    if (reportes.length === 0) {
      Swal.fire({ title: "Aviso", text: "No hay reportes generados para imprimir.", icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }
    
    const filtered = reportes.filter(r => {
      if (!repFiltroEmpleado) return true;
      const term = repFiltroEmpleado.toLowerCase();
      const name = r.Personal ? `${r.Personal.Nombre} ${r.Personal.Apellido}`.toLowerCase() : `${r.EmergenciaNombre} ${r.EmergenciaApellido}`.toLowerCase();
      const dni = r.Personal ? (r.Personal.DNI || "").toLowerCase() : (r.EmergenciaDNI || "").toLowerCase();
      return name.includes(term) || dni.includes(term);
    });

    if (filtered.length === 0) {
      Swal.fire({ title: "Aviso", text: "No hay reportes que coincidan con el filtro.", icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Permita las ventanas emergentes para imprimir.");
      return;
    }

    let vouchersHTML = '';
    filtered.forEach(r => {
      const name = r.Personal ? `${r.Personal.Apellido} ${r.Personal.Nombre}` : `${r.EmergenciaApellido} ${r.EmergenciaNombre}`;
      const dni = r.Personal ? r.Personal.DNI : r.EmergenciaDNI;
      const date = r.FechaPedido.split('T')[0].split('-').reverse().join('/');
      const qrData = encodeURIComponent(`${name}-${dni}-${r.TipoComida}-${r.TipoDieta}-${date}`);
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${qrData}`;

      vouchersHTML += `
        <div class="voucher">
          <div class="header">VALE DE COMIDA</div>
          <div class="content">
            <p><strong>Personal:</strong> ${name}</p>
            <p><strong>DNI:</strong> ${dni}</p>
            <p><strong>Fecha:</strong> ${date}</p>
            <p><strong>Comida:</strong> ${r.TipoComida} (${r.TipoDieta})</p>
          </div>
          <img src="${qrUrl}" class="qr" alt="QR Code" />
          <div class="footer">Sistema SisAC - ${new Date().toLocaleString()}</div>
        </div>
      `;
    });

    const html = `
      <html>
        <head>
          <title>Imprimir Vouchers</title>
          <style>
            body { font-family: sans-serif; margin: 0; padding: 0; background: #fff; }
            .voucher { 
              border: 2px dashed #000; width: 300px; padding: 15px; margin: 15px; 
              float: left; page-break-inside: avoid; position: relative; height: 160px;
            }
            .header { text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 8px; border-bottom: 1px solid #000; padding-bottom: 5px; }
            .content p { margin: 4px 0; font-size: 13px; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .qr { position: absolute; right: 15px; bottom: 30px; width: 70px; height: 70px; }
            .footer { text-align: center; font-size: 10px; position: absolute; bottom: 5px; width: calc(100% - 30px); color: #555; border-top: 1px solid #eee; padding-top: 5px; }
            @media print { @page { margin: 1cm; } body { -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body onload="setTimeout(() => { window.print(); window.close(); }, 800)">
          ${vouchersHTML}
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const exportExcel = () => {
    if (reportes.length === 0) return;
    
    const dataToExport = reportes.map(r => ({
      Fecha: r.FechaPedido.split('T')[0],
      DNI: r.Personal ? r.Personal.DNI : r.EmergenciaDNI,
      Nombre: r.Personal ? `${r.Personal.Apellido} ${r.Personal.Nombre}` : `${r.EmergenciaApellido} ${r.EmergenciaNombre}`,
      Servicio: r.Servicio ? r.Servicio.Nombre : "Emergencia",
      Comida: r.TipoComida,
      Dieta: r.TipoDieta,
      Estado: r.Estado
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reportes");
    XLSX.writeFile(workbook, `Reportes_SisAC_${repDesde}_${repHasta}.xlsx`);
  };

  const exportPDF = () => {
    if (reportes.length === 0) return;
    
    const doc = new jsPDF();
    doc.text(`Reportes de Comida SisAC (${repDesde} a ${repHasta})`, 14, 15);
    
    const tableData = reportes.map(r => [
      r.FechaPedido.split('T')[0].split('-').reverse().join('/'),
      r.Personal ? r.Personal.DNI : (r.EmergenciaDNI || ""),
      r.Personal ? `${r.Personal.Apellido} ${r.Personal.Nombre}` : `${r.EmergenciaApellido} ${r.EmergenciaNombre}`,
      r.Servicio ? r.Servicio.Nombre : "Emergencia",
      r.TipoComida,
      r.TipoDieta,
      r.Estado
    ]);

    (doc as any).autoTable({
      head: [['Fecha', 'DNI', 'Nombre', 'Servicio', 'Comida', 'Dieta', 'Estado']],
      body: tableData,
      startY: 20,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`Reportes_SisAC_${repDesde}_${repHasta}.pdf`);
  };

  const tabs = [
    { id: "Bandeja", label: "Emergencias", icon: <AlertTriangle className="w-4 h-4 mr-2" /> },
    { id: "Hospital", label: "Efectores", icon: <Building className="w-4 h-4 mr-2" /> },
    { id: "Reportes", label: "Reportes", icon: <FileText className="w-4 h-4 mr-2" /> },
    { id: "Configuracion", label: "Configuración", icon: <Settings className="w-4 h-4 mr-2" /> }
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* TABS NAVIGATION */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-1.5 flex flex-wrap gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === tab.id 
                ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.id === "Bandeja" && emergencias.length > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{emergencias.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* BANDEJA CONTENT */}
      {activeTab === "Bandeja" && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
          <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/30">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2 text-orange-500" /> Solicitudes Pendientes
              </h2>
            </div>
          </div>
          
          {emergencias.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center">
              <CheckCircle className="w-16 h-16 text-green-400 dark:text-green-500/50 mb-4" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Todo al día</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">No hay solicitudes de emergencia pendientes de revisión.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {emergencias.map(e => (
                <div key={e.Id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-6">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400 text-xs font-bold px-2.5 py-1 rounded-md">
                          URGENTE
                        </span>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{e.EmergenciaNombre} {e.EmergenciaApellido}</h3>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1"><span className="font-semibold text-gray-900 dark:text-gray-200">DNI:</span> {e.EmergenciaDNI} • <span className="font-semibold text-gray-900 dark:text-gray-200">Solicita:</span> {e.TipoComida} ({e.TipoDieta})</p>
                      <div className="mt-3 bg-gray-50 dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 text-sm italic text-gray-700 dark:text-gray-300 relative">
                        <div className="absolute top-0 left-0 w-1 h-full bg-orange-400 rounded-l-xl"></div>
                        "{e.JustificacionSolicitud}"
                      </div>
                    </div>
                    
                    <div className="flex flex-col space-y-3 w-full md:w-80">
                      <textarea 
                        className="w-full text-sm border-gray-300 dark:border-gray-700 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-3 border transition-shadow" 
                        placeholder="Motivo de la resolución (Obligatorio)..." 
                        rows={2}
                        value={resolucionTxt[e.Id] || ""}
                        onChange={(evt) => setResolucionTxt({...resolucionTxt, [e.Id]: evt.target.value})}
                      ></textarea>
                      <div className="flex space-x-3">
                        <button onClick={() => resolveEmergency(e.Id, "Rechazado")} className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800 border border-red-300 dark:border-red-700/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 py-2.5 px-4 rounded-xl text-sm font-bold transition-all transform hover:scale-[1.02] active:scale-95 shadow-sm">
                          <X className="w-4 h-4 mr-1.5" /> Rechazar
                        </button>
                        <button onClick={() => resolveEmergency(e.Id, "Aprobado")} className="flex-1 flex items-center justify-center bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white border border-transparent py-2.5 px-4 rounded-xl text-sm font-bold transition-all transform hover:scale-[1.02] active:scale-95 shadow-md">
                          <Check className="w-4 h-4 mr-1.5" /> Aprobar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* HOSPITAL CONTENT */}
      {activeTab === "Hospital" && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
          <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
              <Building className="w-5 h-5 mr-2 text-indigo-500" /> Gestión de Servicios
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Configura las áreas del efector y sus encargados.</p>
          </div>
          <div className="p-8 flex flex-col space-y-8">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">1. Servicios Activos</h3>
              {servicios.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">No hay servicios creados aún.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {servicios.map(s => (
                    <span key={s.Id} className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-xs font-bold px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-800/50 flex items-center shadow-sm">
                      {s.Nombre} <span className="ml-2 opacity-50 font-normal border-l border-indigo-200 dark:border-indigo-700 pl-2">ID: {s.Id}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-gray-50/50 dark:bg-gray-800/30 p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-wider">Nuevo Servicio</h3>
                <div className="flex flex-col space-y-3">
                  <input type="text" value={nuevoServicio} onChange={e => setNuevoServicio(e.target.value)} placeholder="Ej. Terapia Intensiva" className="w-full rounded-xl border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500/50 sm:text-sm px-4 py-3 border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-shadow" />
                  <button onClick={crearServicio} className="w-full bg-indigo-600 dark:bg-indigo-500 text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 dark:hover:bg-indigo-600 shadow-md transition-all transform hover:scale-[1.02] active:scale-95">
                    Crear Servicio
                  </button>
                </div>
              </div>

              <div className="bg-gray-50/50 dark:bg-gray-800/30 p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-wider">Asignar Jefe de Servicio</h3>
                <div className="flex flex-col space-y-3">
                  <input type="text" value={jefeUsername} onChange={e => setJefeUsername(e.target.value)} placeholder="Usuario (Ej. jmendez)" className="w-full rounded-xl border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500/50 sm:text-sm px-4 py-3 border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-shadow" />
                  <input type="password" value={jefePassword} onChange={e => setJefePassword(e.target.value)} placeholder="Contraseña Temporal" className="w-full rounded-xl border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500/50 sm:text-sm px-4 py-3 border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-shadow" />
                  <div className="relative">
                    <select value={jefeServicioId} onChange={e => setJefeServicioId(e.target.value)} className="w-full rounded-xl border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500/50 sm:text-sm px-4 py-3 border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-shadow appearance-none">
                      <option value="" disabled>Seleccione Área...</option>
                      {servicios.map(s => <option key={s.Id} value={s.Id}>{s.Nombre}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <button onClick={asignarJefe} className="w-full bg-blue-600 dark:bg-blue-500 text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-blue-700 dark:hover:bg-blue-600 shadow-md transition-all transform hover:scale-[1.02] active:scale-95">
                    Crear Cuenta de Jefe
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REPORTES CONTENT */}
      {activeTab === "Reportes" && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
          <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
              <FileText className="w-5 h-5 mr-2 text-indigo-500" /> Reportes Globales
            </h2>
            <button 
              onClick={handleImprimirVouchers} 
              className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-800 dark:hover:bg-white shadow-md transition-all flex items-center transform hover:scale-[1.02] active:scale-95"
            >
              <Printer className="w-4 h-4 mr-2" /> Imprimir Vouchers
            </button>
          </div>
          <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex flex-wrap gap-4 items-end bg-white dark:bg-gray-900">
            <div className="w-full sm:w-48">
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Fecha Desde</label>
              <input type="date" value={repDesde} onChange={e => setRepDesde(e.target.value)} className="w-full text-sm border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500/50 px-3 py-2.5 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-colors" />
            </div>
            <div className="w-full sm:w-48">
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Fecha Hasta</label>
              <input type="date" value={repHasta} onChange={e => setRepHasta(e.target.value)} className="w-full text-sm border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500/50 px-3 py-2.5 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-colors" />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button onClick={generarReporte} className="flex-1 sm:flex-none flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg shadow-sm font-bold transition-colors">
                <Search className="w-4 h-4 mr-2" /> Buscar
              </button>
              <button onClick={exportExcel} disabled={reportes.length === 0} className={`flex-1 sm:flex-none flex items-center justify-center px-4 py-2.5 rounded-lg shadow-sm font-bold transition-colors ${reportes.length === 0 ? 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`} title="Exportar a Excel (CSV)">
                EXCEL
              </button>
              <button onClick={exportPDF} disabled={reportes.length === 0} className={`flex-1 sm:flex-none flex items-center justify-center px-4 py-2.5 rounded-lg shadow-sm font-bold transition-colors ${reportes.length === 0 ? 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white'}`} title="Exportar a PDF">
                PDF
              </button>
            </div>
            <div className="w-full lg:flex-1">
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Filtro Rápido (DNI/Nombre)</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input type="text" value={repFiltroEmpleado} onChange={e => setRepFiltroEmpleado(e.target.value)} placeholder="Ej. Juan Perez..." className="block w-full pl-9 pr-3 py-2.5 text-sm border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500/50 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-colors" />
              </div>
            </div>
          </div>
          <div className="p-0 overflow-x-auto">
            {reportes.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-16 flex flex-col items-center">
                <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-full mb-4">
                  <FileText className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="font-medium text-lg text-gray-900 dark:text-gray-100">Sin resultados</p>
                <p className="text-sm mt-1">Selecciona fechas y presiona Buscar para ver los pedidos.</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Servicio</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tipo/Dieta</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Personal / Paciente</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">DNI</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                  {reportes.filter(r => {
                    if (!repFiltroEmpleado) return true;
                    const term = repFiltroEmpleado.toLowerCase();
                    const name = r.Personal ? `${r.Personal.Nombre} ${r.Personal.Apellido}`.toLowerCase() : `${r.EmergenciaNombre} ${r.EmergenciaApellido}`.toLowerCase();
                    const dni = r.Personal ? (r.Personal.DNI || "").toLowerCase() : (r.EmergenciaDNI || "").toLowerCase();
                    return name.includes(term) || dni.includes(term);
                  }).map((r) => (
                    <tr key={r.Id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">{r.FechaPedido.split('T')[0].split('-').reverse().join('/')}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{r.Servicio?.Nombre || "-"}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${r.TipoComida.toLowerCase() === 'almuerzo' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300'}`}>
                          {r.TipoComida}
                        </span>
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{r.TipoDieta}</span>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900 dark:text-gray-100">{r.Personal ? `${r.Personal.Nombre} ${r.Personal.Apellido}` : `${r.EmergenciaNombre} ${r.EmergenciaApellido}`}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{r.Personal ? r.Personal.DNI : r.EmergenciaDNI}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${r.Estado === 'Aprobado' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : r.Estado === 'Rechazado' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'}`}>
                          {r.Estado}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* CONFIGURACION CONTENT */}
      {activeTab === "Configuracion" && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
          <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
              <Settings className="w-5 h-5 mr-2 text-gray-500" /> Configuración Global
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Modifica las reglas de negocio del sistema para tu efector.</p>
          </div>
          <div className="p-8">
            <div className="max-w-2xl bg-gray-50/50 dark:bg-gray-800/30 p-8 rounded-2xl border border-gray-100 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center">
                <AlertTriangle className="w-4 h-4 mr-2 text-yellow-500" /> Horarios Límite de Pedidos
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Corte para Almuerzo</label>
                  <input type="time" value={configAlmuerzo} onChange={e => setConfigAlmuerzo(e.target.value)} className="w-full text-lg font-mono rounded-xl border-gray-300 dark:border-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500/50 px-4 py-3 border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Corte para Cena</label>
                  <input type="time" value={configCena} onChange={e => setConfigCena(e.target.value)} className="w-full text-lg font-mono rounded-xl border-gray-300 dark:border-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500/50 px-4 py-3 border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors" />
                </div>
              </div>
              <div className="mt-8 flex justify-end">
                <button onClick={guardarConfiguracion} className="bg-blue-600 dark:bg-blue-500 text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-blue-700 dark:hover:bg-blue-600 shadow-md transition-all transform hover:scale-[1.02] active:scale-95 flex items-center">
                  <Save className="w-4 h-4 mr-2" /> Guardar Cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RRHHPanel({ token }: { token: string }) {
  const [activeTab, setActiveTab] = useState("Hospitales");
  const [hospitales, setHospitales] = useState<any[]>([]);
  const [nuevoHospital, setNuevoHospital] = useState("");
  const [gerenteUser, setGerenteUser] = useState("");
  const [gerentePass, setGerentePass] = useState("");
  const [gerenteHospitalId, setGerenteHospitalId] = useState("");
  const { theme } = useTheme();

  const [gerentes, setGerentes] = useState<any[]>([]);

  const fetchHospitales = async () => {
    try {
      const res = await fetch("http://localhost:3001/api/hospitals", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setHospitales(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchGerentes = async () => {
    try {
      const res = await fetch("http://localhost:3001/api/users/gerentes", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setGerentes(await res.json());
    } catch (e) {
      console.error(e);
    }
  };
  useEffect(() => {
    fetchHospitales();
    fetchGerentes();
  }, []);

  const crearHospital = async () => {
    if (!nuevoHospital) return;
    try {
      const res = await fetch("http://localhost:3001/api/hospitals", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nombre: nuevoHospital })
      });
      if (res.ok) {
        Swal.fire({ title: "Éxito", text: "Efector creado exitosamente", icon: "success", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        setNuevoHospital("");
        fetchHospitales();
      } else {
        const data = await res.json();
        Swal.fire({ title: "Error", text: data.error, icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    } catch (e) {
      Swal.fire({ title: "Error", text: "Error al crear efector", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    }
  };

  const crearGerente = async () => {
    if (!gerenteUser || !gerentePass || !gerenteHospitalId) return;
    try {
      const res = await fetch("http://localhost:3001/api/users/gerente", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: gerenteUser, password: gerentePass, hospitalId: gerenteHospitalId })
      });
      if (res.ok) {
        Swal.fire({ title: "Éxito", text: "Gerente creado exitosamente", icon: "success", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        setGerenteUser(""); setGerentePass(""); setGerenteHospitalId("");
      } else {
        const data = await res.json();
        Swal.fire({ title: "Error", text: data.error, icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    } catch (e) {
      Swal.fire({ title: "Error", text: "Error al crear gerente", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    }
  };

  const resetGerente = async (id: number) => {
    try {
      const res = await fetch(`http://localhost:3001/api/users/${id}/reset-password`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        Swal.fire({ title: "Éxito", text: "Contraseña reseteada a '1234'", icon: "success", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    } catch (e) {
      Swal.fire({ title: "Error", text: "No se pudo resetear la contraseña", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    }
  };

  const toggleGerente = async (id: number) => {
    try {
      const res = await fetch(`http://localhost:3001/api/users/${id}/disable`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchGerentes();
        Swal.fire({ title: "Éxito", text: "Estado actualizado", icon: "success", timer: 1500, background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    } catch (e) {
      Swal.fire({ title: "Error", text: "No se pudo actualizar", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    }
  };

  const deleteGerente = async (id: number) => {
    Swal.fire({
      title: '¿Eliminar usuario?',
      text: "¿Seguro que deseas eliminar este usuario? Esta acción no se puede deshacer.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      background: theme === 'dark' ? '#1f2937' : '#ffffff',
      color: theme === 'dark' ? '#ffffff' : '#000000',
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await fetch(`http://localhost:3001/api/users/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            fetchGerentes();
            Swal.fire({ title: "Éxito", text: "Usuario eliminado", icon: "success", timer: 1500, background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
          }
        } catch (e) {
          Swal.fire({ title: "Error", text: "No se pudo eliminar", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        }
      }
    });
  };

  const tabs = [
    { id: "Hospitales", label: "Efectores", icon: <Building className="w-4 h-4 mr-2" /> },
    { id: "Administracion", label: "Administración Global", icon: <Settings className="w-4 h-4 mr-2" /> }
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* TABS NAVIGATION */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-1.5 flex flex-wrap gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === tab.id 
                ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "Hospitales" && (
      <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in zoom-in-95 duration-300">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex items-center gap-5">
          <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
            <Building className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-4xl font-extrabold text-gray-900 dark:text-white">{hospitales.length}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider mt-2">Efectores en Red</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
          <Building className="w-5 h-5 mr-2 text-indigo-500" /> Red de Efectores Activos
        </h2>
        <div className="p-6">
          {hospitales.length === 0 ? (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-8 text-center border border-gray-100 dark:border-gray-800">
              <Building className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No hay efectores registrados en el sistema.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {hospitales.map(h => (
                <div key={h.Id} className="border border-gray-200 dark:border-gray-700 rounded-2xl p-6 bg-white dark:bg-gray-800/50 hover:shadow-md transition-shadow">
                  <h3 className="font-extrabold text-gray-900 dark:text-white text-xl flex items-center justify-between mb-4 pb-4 border-b border-gray-100 dark:border-gray-700">
                    <span className="flex items-center">
                      <div className="bg-indigo-100 dark:bg-indigo-900/50 p-2 rounded-lg mr-3">
                        <Building className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      {h.Nombre}
                    </span>
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">ID: {h.Id}</span>
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center">
                        <User className="w-3.5 h-3.5 mr-1.5" /> Gerentes
                      </h4>
                      {h.Usuarios && h.Usuarios.length > 0 ? (
                        <ul className="space-y-2">
                          {h.Usuarios.map((u: any) => (
                            <li key={u.Id} className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center bg-gray-50 dark:bg-gray-800 p-2 rounded-lg">
                              <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center mr-2 text-xs font-bold text-gray-600 dark:text-gray-300">
                                {u.NombreUsuario.charAt(0).toUpperCase()}
                              </div>
                              {u.NombreUsuario}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-red-500 dark:text-red-400 font-medium italic bg-red-50 dark:bg-red-900/10 p-2 rounded-lg">Falta asignar gerente</p>
                      )}
                    </div>
                    
                    <div>
                      <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center">
                        <Utensils className="w-3.5 h-3.5 mr-1.5" /> Áreas / Servicios
                      </h4>
                      {h.Servicios && h.Servicios.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {h.Servicios.map((s: any) => (
                            <span key={s.Id} className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                              {s.Nombre}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-500 italic p-2">Sin áreas creadas</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </>
      )}

      {activeTab === "Administracion" && (
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
            <Settings className="w-5 h-5 mr-2 text-gray-500" /> Panel de Administración Global
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Alta de nuevas sedes y credenciales gerenciales.</p>
        </div>
        <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          <div className="bg-gray-50 dark:bg-gray-800/30 p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center uppercase tracking-wider">
              <Building className="w-4 h-4 mr-2 text-indigo-500" />
              Alta de Sede (Efector)
            </h3>
            <div className="flex flex-col space-y-3">
              <input type="text" value={nuevoHospital} onChange={e => setNuevoHospital(e.target.value)} placeholder="Nombre oficial del Efector" className="w-full rounded-xl border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500/50 sm:text-sm px-4 py-3 border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-shadow" />
              <button onClick={crearHospital} className="w-full bg-indigo-600 dark:bg-indigo-500 text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 dark:hover:bg-indigo-600 shadow-md transition-all transform hover:scale-[1.02] active:scale-95">
                Registrar Efector
              </button>
            </div>
          </div>

          <div className="bg-gray-50/50 dark:bg-gray-800/30 p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-wider flex items-center">
              <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 w-6 h-6 flex items-center justify-center rounded-full mr-2">2</span>
              Asignar Cuenta Gerencial
            </h3>
            <div className="flex flex-col space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={gerenteUser} onChange={e => setGerenteUser(e.target.value)} placeholder="Usuario" className="w-full rounded-xl border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500/50 sm:text-sm px-4 py-3 border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-shadow" />
                <input type="password" value={gerentePass} onChange={e => setGerentePass(e.target.value)} placeholder="Contraseña" className="w-full rounded-xl border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500/50 sm:text-sm px-4 py-3 border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-shadow" />
              </div>
              <div className="relative">
                <select value={gerenteHospitalId} onChange={e => setGerenteHospitalId(e.target.value)} className="w-full rounded-xl border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500/50 sm:text-sm px-4 py-3 border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-shadow appearance-none">
                  <option value="" disabled>Seleccione Sede para el Gerente...</option>
                  {hospitales.map(h => <option key={h.Id} value={h.Id}>{h.Nombre}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
              <button onClick={crearGerente} className="w-full bg-blue-600 dark:bg-blue-500 text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-blue-700 dark:hover:bg-blue-600 shadow-md transition-all transform hover:scale-[1.02] active:scale-95">
                Generar Credenciales
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 mt-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
              <Users className="w-5 h-5 mr-2 text-blue-500" />
              Directorio de Gerentes
            </h3>
            
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-300">
                  <tr>
                    <th className="px-6 py-4 font-bold">Usuario</th>
                    <th className="px-6 py-4 font-bold">Efector</th>
                    <th className="px-6 py-4 font-bold text-center">Estado</th>
                    <th className="px-6 py-4 font-bold text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {gerentes.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500 font-medium">
                        No hay gerentes registrados
                      </td>
                    </tr>
                  ) : (
                    gerentes.map((g) => (
                      <tr key={g.Id} className={`bg-white dark:bg-gray-800 ${!g.Activo ? 'opacity-60' : ''}`}>
                        <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                          {g.NombreUsuario}
                        </td>
                        <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                          {g.Hospital ? g.Hospital.Nombre : '-'}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${g.Activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {g.Activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-center space-x-2">
                            <button onClick={() => resetGerente(g.Id)} className="p-1.5 bg-blue-100 text-blue-600 hover:bg-blue-200 rounded-lg" title="Resetear a 1234">
                              <Lock className="w-4 h-4" />
                            </button>
                            <button onClick={() => toggleGerente(g.Id)} className={`p-1.5 rounded-lg ${g.Activo ? 'bg-orange-100 text-orange-600 hover:bg-orange-200' : 'bg-green-100 text-green-600 hover:bg-green-200'}`} title={g.Activo ? 'Inhabilitar' : 'Habilitar'}>
                              {g.Activo ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                            </button>
                            <button onClick={() => deleteGerente(g.Id)} className="p-1.5 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg" title="Eliminar">
                              <AlertTriangle className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
      )}
    </div>
  );
}
