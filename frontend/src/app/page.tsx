"use client";

const API_URL = "";

import { useState, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import Swal from 'sweetalert2';
import { 
  LogOut, Sun, Moon, AlertTriangle, FileText, Settings, 
  User, Printer, Check, X, Building, Download, Users, Lock, ChevronDown, ChevronUp, CheckCircle, Search, Save, Utensils, History, Upload, Plus, UserPlus, Trash2, Shield, RefreshCw
} from "lucide-react";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type Role = "Jefe" | "Gerente" | "RRHH" | "Admin";

const DIETAS_DISPONIBLES = ["Normal", "Gastrica", "Diabetica", "Hepatico", "Vegetariano", "Celiaca"];

const getRacionLabel = (horario: string) => {
  if (!horario) return "Almuerzo o Cena";
  const h = horario.toLowerCase();
  if (h.includes("24") || h.includes("y cena") || h === "almuerzo y cena") {
    return "Almuerzo y Cena";
  }
  return "Almuerzo o Cena";
};

const getTodayStr = () => {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().split('T')[0];
};

export default function Home() {
  const [role, setRole] = useState<Role | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [hospitalName, setHospitalName] = useState<string | null>(null);
  const [servicioName, setServicioName] = useState<string | null>(null);
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
  const [limiteAuthAlmuerzo, setLimiteAuthAlmuerzo] = useState("11:00");
  const [limiteAuthCena, setLimiteAuthCena] = useState("18:00");
  const [dietasHabilitadas, setDietasHabilitadas] = useState<string[]>(DIETAS_DISPONIBLES);

  useEffect(() => {
    if (token) {
      fetch(`${API_URL}/api/hospital/config`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d && d.LimiteAlmuerzo) setLimiteAlmuerzo(d.LimiteAlmuerzo);
        if (d && d.LimiteCena) setLimiteCena(d.LimiteCena);
        if (d && d.LimiteAutorizacionAlmuerzo) setLimiteAuthAlmuerzo(d.LimiteAutorizacionAlmuerzo);
        if (d && d.LimiteAutorizacionCena) setLimiteAuthCena(d.LimiteAutorizacionCena);
        if (d && d.DietasHabilitadas) {
          const arr = d.DietasHabilitadas.split(',').map((x: string) => x.trim()).filter(Boolean);
          if (arr.length > 0) setDietasHabilitadas(arr);
        }
      }).catch(console.error);
    }
  }, [token]);

  const currentTotalMins = currentTime ? (currentTime.getHours() * 60 + currentTime.getMinutes()) : 0;
  const [lAh, lAm] = limiteAlmuerzo.split(':').map(Number);
  const isPastAlmuerzo = currentTotalMins >= (lAh * 60 + lAm);
  const [lCh, lCm] = limiteCena.split(':').map(Number);
  const isPastCena = currentTotalMins >= (lCh * 60 + lCm);

  const [lAuthAh, lAuthAm] = limiteAuthAlmuerzo.split(':').map(Number);
  const isPastAuthAlmuerzo = currentTotalMins >= (lAuthAh * 60 + lAuthAm);
  const [lAuthCh, lAuthCm] = limiteAuthCena.split(':').map(Number);
  const isPastAuthCena = currentTotalMins >= (lAuthCh * 60 + lAuthCm);

  const handleLogin = (jwtToken: string, userRole: number, id: number, hospName: string | null, servName: string | null, userLoginName: string) => {
    setToken(jwtToken);
    setUserId(id);
    setHospitalName(hospName);
    setServicioName(servName);
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
        setServicioName(null);
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
              SisAR - Sistema de Administración de Raciones
            </h1>
          </div>
          
          <div className="flex items-center space-x-4">
            {role !== "RRHH" && role !== "Admin" && (
              <div className={`hidden md:flex flex-col text-xs border-l-4 ${isPastAlmuerzo && isPastCena ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' : 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'} px-3 py-1.5 rounded-r-lg`}>
                <div className="font-bold mb-0.5">Límites Pedido</div>
                <div>Alm: {limiteAlmuerzo} {isPastAlmuerzo && <span className="font-bold text-red-600 dark:text-red-400">(!)</span>}</div>
                <div>Cen: {limiteCena} {isPastCena && <span className="font-bold text-red-600 dark:text-red-400">(!)</span>}</div>
              </div>
            )}

            <div className="flex items-center space-x-3 bg-gray-100 dark:bg-gray-800 px-4 py-2 rounded-2xl border border-gray-200 dark:border-gray-700">
              <Building className="w-4 h-4 text-indigo-500 hidden md:block flex-shrink-0" />
              <div className="hidden md:flex flex-col border-r border-gray-300 dark:border-gray-600 pr-3 mr-1 text-left justify-center">
                <span className="text-xs font-bold text-gray-800 dark:text-gray-200 leading-tight" title="Efector">
                  {hospitalName || "Todos"}
                </span>
                {role === "Jefe" && servicioName && (
                  <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 leading-tight mt-0.5" title="Servicio">
                    {servicioName}
                  </span>
                )}
              </div>
              <User className="w-4 h-4 text-gray-500 dark:text-gray-400 ml-2" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {username ? `${username} (${role === "RRHH" ? "Admin" : role})` : (role === "RRHH" ? "Admin" : role)}
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

        {role === "Jefe" && <JefePanel isPastAlmuerzo={isPastAlmuerzo} isPastCena={isPastCena} isPastAuthAlmuerzo={isPastAuthAlmuerzo} isPastAuthCena={isPastAuthCena} limiteAlmuerzo={limiteAlmuerzo} limiteCena={limiteCena} limiteAuthAlmuerzo={limiteAuthAlmuerzo} limiteAuthCena={limiteAuthCena} token={token} userId={userId} servicioName={servicioName} dietasProp={dietasHabilitadas} />}
        {role === "Gerente" && (
          <GerentePanel 
            token={token} 
            hospitalName={hospitalName}
            username={username}
            dietasHabilitadasProp={dietasHabilitadas}
            onConfigUpdated={(alm, cen, dietasArr) => {
              setLimiteAlmuerzo(alm);
              setLimiteCena(cen);
              if (dietasArr) setDietasHabilitadas(dietasArr);
            }} 
          />
        )}
        {role === "RRHH" && <RRHHPanel token={token} />}
      </main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (token: string, roleId: number, id: number, hospitalName: string | null, servicioName: string | null, username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState(1); // 1: Credentials, 2: 2FA, 3: Change Password
  const [tempToken, setTempToken] = useState("");
  const [totp, setTotp] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { theme } = useTheme();

  const usernameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 1) {
      const timer = setTimeout(() => {
        usernameInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error de credenciales");
      
      if (data.requirePasswordChange) {
        setTempToken(data.tempToken);
        setStep(3);
      } else if (data.require2FA) {
        setTempToken(data.tempToken);
        if (data.setup && data.qrCode) {
          setQrCodeUrl(data.qrCode);
        }
        setStep(2);
      } else if (data.token) {
        onLogin(data.token, data.user.roleId, data.user.id, data.user.hospitalName || null, data.user.servicioName || null, data.user.username);
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
      const res = await fetch(`${API_URL}/api/auth/2fa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken, token: totp })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Código inválido");
      
      onLogin(data.token, data.user.roleId, data.user.id, data.user.hospitalName || null, data.user.servicioName || null, data.user.username);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const doChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/auth/change-password`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${tempToken}`
        },
        body: JSON.stringify({ newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al actualizar contraseña");

      onLogin(data.token, data.user.roleId, data.user.id, data.user.hospitalName || null, data.user.servicioName || null, data.user.username);
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
          <h2 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">SisAR</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Sistema de Administración de Raciones</p>
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
                  ref={usernameInputRef}
                  autoFocus
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
        ) : step === 2 ? (
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
        ) : (
          <form onSubmit={doChangePassword} className="space-y-5">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 rounded-xl text-xs text-amber-800 dark:text-amber-300 mb-2">
              <strong>Cambio de Contraseña Obligatorio:</strong> Es tu primer inicio de sesión. Por razones de seguridad, debes actualizar tu contraseña por defecto (123456) antes de continuar.
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nueva Contraseña</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input 
                  type="password" 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-shadow" 
                  placeholder="••••••••"
                  required 
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Confirmar Nueva Contraseña</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input 
                  type="password" 
                  value={confirmPassword} 
                  onChange={e => setConfirmPassword(e.target.value)} 
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-shadow" 
                  placeholder="••••••••"
                  required 
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Debe contener al menos 8 caracteres, 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial.
            </p>
            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-md text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all transform hover:scale-[1.02] active:scale-95"
            >
              {isLoading ? 'Actualizando...' : 'Cambiar Contraseña e Ingresar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function AgentSearchableSelect({
  options,
  selectedId,
  onSelect,
  placeholder = "Buscar agente por nombre o DNI",
  label,
  accentColor = "orange",
  required = false
}: {
  options: any[];
  selectedId: string;
  onSelect: (id: string) => void;
  placeholder?: string;
  label?: string;
  accentColor?: "orange" | "purple" | "blue";
  required?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedAgent = options.find(o => String(o.Id) === String(selectedId));

  const filteredOptions = options.filter(o => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const nombre = (o.NombreCompleto || `${o.Nombre || ''} ${o.Apellido || ''}`).toLowerCase();
    const dni = (o.DNI || "").toLowerCase();
    return nombre.includes(term) || dni.includes(term);
  });

  const isPurple = accentColor === "purple";
  const borderFocus = isPurple ? "focus:border-purple-500 focus:ring-purple-500/50" : "focus:border-orange-500 focus:ring-orange-500/50";
  const bgSelected = isPurple ? "bg-purple-50 dark:bg-purple-900/30 text-purple-900 dark:text-purple-100" : "bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100";

  return (
    <div className="relative" ref={containerRef}>
      {label && <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{label}</label>}

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-gray-400" />
        </div>

        <input
          type="text"
          value={isOpen ? search : (selectedAgent ? `${selectedAgent.NombreCompleto || `${selectedAgent.Nombre || ''} ${selectedAgent.Apellido || ''}`} (DNI: ${selectedAgent.DNI})` : search)}
          onFocus={() => {
            setIsOpen(true);
            setSearch("");
          }}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          placeholder={placeholder}
          className={`block w-full pl-9 pr-8 py-2.5 border rounded-xl shadow-sm text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 border-gray-300 dark:border-gray-700 ${borderFocus} transition-all`}
        />

        {selectedId ? (
          <button
            type="button"
            onClick={() => {
              onSelect("");
              setSearch("");
              setIsOpen(true);
            }}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            title="Limpiar selección"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
            <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        )}
      </div>

      {required && (
        <input
          type="text"
          value={selectedId}
          readOnly
          required
          className="opacity-0 absolute inset-0 pointer-events-none h-0 w-0"
        />
      )}

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 animate-in fade-in duration-150">
          {filteredOptions.length === 0 ? (
            <div className="p-3 text-xs text-center text-gray-500 dark:text-gray-400">
              No se encontraron agentes coincidentes
            </div>
          ) : (
            filteredOptions.map((item) => {
              const isSelected = String(item.Id) === String(selectedId);
              const nombre = item.NombreCompleto || `${item.Nombre || ''} ${item.Apellido || ''}`.trim();
              return (
                <div
                  key={item.Id}
                  onClick={() => {
                    onSelect(String(item.Id));
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={`p-3 text-left cursor-pointer transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/40 ${isSelected ? bgSelected : ''}`}
                >
                  <div className="font-bold text-sm text-gray-900 dark:text-gray-100">
                    {nombre}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    DNI: <span className="font-semibold text-gray-700 dark:text-gray-300">{item.DNI}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function JefePanel({ 
  isPastAlmuerzo, 
  isPastCena, 
  isPastAuthAlmuerzo = false,
  isPastAuthCena = false,
  limiteAlmuerzo, 
  limiteCena, 
  limiteAuthAlmuerzo,
  limiteAuthCena,
  token, 
  userId, 
  servicioName, 
  dietasProp 
}: { 
  isPastAlmuerzo: boolean, 
  isPastCena: boolean, 
  isPastAuthAlmuerzo?: boolean,
  isPastAuthCena?: boolean,
  limiteAlmuerzo: string, 
  limiteCena: string, 
  limiteAuthAlmuerzo?: string,
  limiteAuthCena?: string,
  token: string, 
  userId: number | null, 
  servicioName?: string | null, 
  dietasProp?: string[] 
}) {
  const [activeTab, setActiveTab] = useState("Planilla");
  const [planillaTab, setPlanillaTab] = useState<"almuerzo" | "cena">("almuerzo");
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Padron & Plantel Builder
  const [padron, setPadron] = useState<any[]>([]);
  const [plantelDraft, setPlantelDraft] = useState<any[]>([]);
  const [expandedServices, setExpandedServices] = useState<{ [key: string]: boolean }>({});
  const [padronSearchTerm, setPadronSearchTerm] = useState("");

  const dietas = (dietasProp && dietasProp.length > 0) ? dietasProp : DIETAS_DISPONIBLES;

  // Emergency form state
  const [emgNombre, setEmgNombre] = useState("");
  const [emgDni, setEmgDni] = useState("");
  const [emgComida, setEmgComida] = useState(isPastAuthAlmuerzo ? "Cena" : "Almuerzo");
  const [emgDieta, setEmgDieta] = useState(dietas[0] || "Normal");
  const [emgDietaCena, setEmgDietaCena] = useState(dietas[0] || "Normal");

  useEffect(() => {
    if (dietas.length > 0) {
      if (!dietas.includes(emgDieta)) setEmgDieta(dietas[0]);
      if (!dietas.includes(emgDietaCena)) setEmgDietaCena(dietas[0]);
    }
  }, [dietasProp]);

  const [emgDuracion, setEmgDuracion] = useState("hoy");
  const [emgPeriodoInicio, setEmgPeriodoInicio] = useState("");
  const [emgPeriodoFin, setEmgPeriodoFin] = useState("");
  const [emgTipo, setEmgTipo] = useState((isPastAuthAlmuerzo && isPastAuthCena) ? "reemplazo_excepcional" : "reemplazo");

  useEffect(() => {
    if (isPastAuthAlmuerzo && isPastAuthCena) {
      if (emgTipo !== 'reemplazo_excepcional') {
        setEmgTipo('reemplazo_excepcional');
        setEmgJustificacion("Reemplazo excepcional de última hora");
      }
    } else if (isPastAuthAlmuerzo && (emgComida === 'Almuerzo' || emgComida === 'Ambos')) {
      setEmgComida('Cena');
    }
  }, [isPastAuthAlmuerzo, isPastAuthCena]);
  const [emgReemplazaId, setEmgReemplazaId] = useState("");
  const [emgSearchTerm, setEmgSearchTerm] = useState("");
  const [emgJustificacion, setEmgJustificacion] = useState("por reemplazo de personal");
  // Reportes
  const [repDesde, setRepDesde] = useState(getTodayStr());
  const [repHasta, setRepHasta] = useState(getTodayStr());
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
      valA = a.Personal ? `${a.Personal.NombreCompleto}` : `${a.EmergenciaNombreCompleto}`;
      valB = b.Personal ? `${b.Personal.NombreCompleto}` : `${b.EmergenciaNombreCompleto}`;
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

  // dietas dinámicas utilizadas desde dietasProp / DIETAS_DISPONIBLES

  const fetchStaff = async () => {
    try {
      const res = await fetch(`${API_URL}/api/staff/active`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const activeData = data.filter((p: any) => !p.bajaDefinitivaHoy);
        setStaff(activeData);
        // Pre-fill right side list with current active staff
        setPlantelDraft(activeData.map((p: any) => ({
          DNI: p.DNI,
          NombreCompleto: p.NombreCompleto,
          Horario: getRacionLabel(p.Horario)
        })));
      }
    } catch (e) {
      console.error("Error fetching staff:", e);
    }
  };

  const fetchHistorialEmergencias = async () => {
    try {
      const res = await fetch(`${API_URL}/api/emergencies/history`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setHistorialEmergencias(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const deleteEmergency = async (id: number) => {
    Swal.fire({
      title: '¿Eliminar solicitud?',
      text: 'Esta solicitud de emergencia pendiente será eliminada.',
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
          const res = await fetch(`${API_URL}/api/emergencies/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            Swal.fire({ title: "Eliminada", text: "Solicitud de emergencia eliminada con éxito.", icon: "success", timer: 1500, background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
            fetchHistorialEmergencias();
          } else {
            const data = await res.json();
            Swal.fire({ title: "Error", text: data.error || "No se pudo eliminar la solicitud", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
          }
        } catch (e) {
          Swal.fire({ title: "Error", text: "Error de conexión al eliminar la solicitud.", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        }
      }
    });
  };

  const fetchPadron = async () => {
    try {
      const res = await fetch(`${API_URL}/api/staff/padron`, { headers: { Authorization: `Bearer ${token}` } });
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
    const getDraftHorario = (dbHorario: string) => getRacionLabel(dbHorario);

    const agentsToAdd = plantelDraft.filter(p => !staff.some(s => s.DNI === p.DNI && getDraftHorario(s.Horario) === p.Horario));
    const agentsToRemove = staff.filter(s => !plantelDraft.some(p => p.DNI === s.DNI && p.Horario === getDraftHorario(s.Horario)));

    if (agentsToAdd.length === 0 && agentsToRemove.length === 0) {
      Swal.fire({ title: "Sin cambios", text: "No hay modificaciones en el plantel", icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }

    try {
      // 1. Process Removals / Updates (Bajas)
      for (const s of agentsToRemove) {
        const bajaRes = await fetch(`${API_URL}/api/staff/${s.Id}/baja`, {
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
        const res = await fetch(`${API_URL}/api/staff/plantel`, {
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
    fetch(`${API_URL}/api/reports?fechaInicio=${today}&fechaFin=${today}`, {
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

    const p = staff.find(s => s.Id === personalId);
    const is1Racion = p ? (getRacionLabel(p.Horario) === "Almuerzo o Cena") : false;

    const current = selections[personalId] || { almuerzo: null, cena: null };
    const isSame = current[tipoComida] === tipoDieta;
    const isSelecting = !isSame;

    if (is1Racion && isSelecting) {
      const otherMeal = tipoComida === "almuerzo" ? "cena" : "almuerzo";
      const otherDeadline = otherMeal === "almuerzo" ? isPastAlmuerzo : isPastCena;
      const otherValue = current[otherMeal];

      if (otherValue) {
        if (otherDeadline) {
          Swal.fire({
            title: "Almuerzo o Cena (1 ración)",
            text: `El agente (Almuerzo o Cena) ya posee ${otherMeal === "almuerzo" ? "Almuerzo" : "Cena"} registrado cuyo horario de pedido ya cerró. Solo se permite 1 ración por día.`,
            icon: "warning",
            timer: 5000,
            timerProgressBar: true,
            confirmButtonColor: '#3b82f6',
            background: theme === 'dark' ? '#1f2937' : '#fff',
            color: theme === 'dark' ? '#fff' : '#000'
          });
          return;
        } else {
          Swal.fire({
            title: "Guardia 12h",
            text: `Agente con Guardia 12h: se reemplazó la selección de ${otherMeal === "almuerzo" ? "Almuerzo" : "Cena"} por ${tipoComida === "almuerzo" ? "Almuerzo" : "Cena"}.`,
            icon: "info",
            timer: 5000,
            timerProgressBar: true,
            confirmButtonColor: '#3b82f6',
            background: theme === 'dark' ? '#1f2937' : '#fff',
            color: theme === 'dark' ? '#fff' : '#000'
          });
        }
      }
    }

    setSelections(prev => {
      const cur = prev[personalId] || { almuerzo: null, cena: null };
      const same = cur[tipoComida] === tipoDieta;

      return {
        ...prev,
        [personalId]: {
          almuerzo: tipoComida === "almuerzo" 
            ? (same ? null : tipoDieta) 
            : (is1Racion && !same ? null : cur.almuerzo),
          cena: tipoComida === "cena" 
            ? (same ? null : tipoDieta) 
            : (is1Racion && !same ? null : cur.cena)
        }
      };
    });

    if (isSelecting) {
      const currentIndex = staff.findIndex(s => s.Id === personalId);
      if (currentIndex !== -1) {
        let nextAgent = null;
        for (let i = currentIndex + 1; i < staff.length; i++) {
          if (!staff[i].bajaProvisoriaHoy) {
            nextAgent = staff[i];
            break;
          }
        }
        if (nextAgent) {
          setTimeout(() => {
            const el = document.getElementById(`fila-agente-${nextAgent!.Id}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }, 100);
        }
      }
    }
  };

  const handleGuardarPedidos = async () => {
    const agentesSinDieta = staff.filter(p => {
      if (p.bajaProvisoriaHoy) return false;
      
      const tieneAlmuerzo = !!selections[p.Id]?.almuerzo;
      const tieneCena = !!selections[p.Id]?.cena;
      const tieneSeleccionActual = !!selections[p.Id]?.[planillaTab];
      
      if (tieneSeleccionActual) return false;

      const isGuardia24h = Boolean(p.EsGuardia24h);
      if (!isGuardia24h) {
        const tieneSeleccionEnOtraComida = planillaTab === 'almuerzo' ? tieneCena : tieneAlmuerzo;
        if (tieneSeleccionEnOtraComida) return false;
      }

      return true;
    });

    if (agentesSinDieta.length > 0) {
      const nombres = agentesSinDieta.map(p => p.NombreCompleto || `${p.Nombre || ''} ${p.Apellido || ''}`).join(", ");
      const confirm = await Swal.fire({
        title: "¿Guardar con agentes sin dieta?",
        text: `Hay ${agentesSinDieta.length} agente(s) activo(s) sin dieta asignada para ${planillaTab === 'almuerzo' ? 'el almuerzo' : 'la cena'}: ${nombres.substring(0, 150)}${nombres.length > 150 ? '...' : ''}. ¿Deseas guardar de todas formas?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: '#3b82f6',
        cancelButtonColor: '#ef4444',
        confirmButtonText: 'Sí, guardar de todas formas',
        cancelButtonText: 'Cancelar y revisar',
        background: theme === 'dark' ? '#1f2937' : '#fff',
        color: theme === 'dark' ? '#fff' : '#000'
      });
      if (!confirm.isConfirmed) {
        return;
      }
    }

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
      const res = await fetch(`${API_URL}/api/orders/bulk`, {
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
    if (!/^\d{7,8}$/.test(emgDni.trim())) {
      Swal.fire({ 
        title: "DNI Inválido", 
        text: "El DNI debe ser únicamente numérico y contener 7 u 8 dígitos.", 
        icon: "warning", 
        background: theme === 'dark' ? '#1f2937' : '#fff', 
        color: theme === 'dark' ? '#fff' : '#000' 
      });
      return;
    }
    try {
      const isHoy = emgTipo === "reemplazo_excepcional" || emgDuracion === "hoy";
      const start = isHoy ? new Date().toISOString() : emgPeriodoInicio;
      const end = isHoy ? new Date().toISOString() : emgPeriodoFin;

      const res = await fetch(`${API_URL}/api/emergencies`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          nombreCompleto: emgNombre,
          nombre: emgNombre,
          apellido: "", 
          dni: emgDni,
          periodoInicio: start,
          periodoFin: end,
          tipoComida: emgComida,
          tipoDieta: emgDieta,
          tipoDietaCena: emgComida === 'Ambos' ? emgDietaCena : undefined,
          justificacion: emgTipo === "reemplazo" ? "por reemplazo de personal" : (emgTipo === "reemplazo_excepcional" ? (emgJustificacion || "Reemplazo excepcional de última hora") : emgJustificacion),
          reemplazaId: (emgTipo === "reemplazo" || emgTipo === "reemplazo_excepcional") ? emgReemplazaId : undefined,
          tipoSolicitud: emgTipo,
          esExcepcional: emgTipo === "reemplazo_excepcional",
          solicitadoPorUsuarioId: userId
        })
      });
      if (res.ok) {
        Swal.fire({ 
          title: "Éxito", 
          text: emgTipo === "reemplazo_excepcional" ? "Reemplazo excepcional registrado con éxito" : "Solicitud de emergencia creada", 
          icon: "success", 
          background: theme === 'dark' ? '#1f2937' : '#fff', 
          color: theme === 'dark' ? '#fff' : '#000' 
        });
        setEmgNombre(""); setEmgDni(""); setEmgReemplazaId("");
        setEmgJustificacion(emgTipo === "reemplazo" ? "por reemplazo de personal" : "");
        fetchHistorialEmergencias();
      } else {
        const data = await res.json();
        Swal.fire({ title: "Error", text: data.error, icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    } catch (e) {
      Swal.fire({ title: "Error", text: "Error de red", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
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
        const res = await fetch(`${API_URL}/api/staff/${p.Id}/baja`, {
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
        const res = await fetch(`${API_URL}/api/staff/${p.Id}/revertir-baja`, {
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
      const res = await fetch(`${API_URL}/api/reports?fechaInicio=${repDesde}&fechaFin=${repHasta}`, {
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
    
    const filtered = sortedReportes.filter(r => {
      if (!repFiltroEmpleado) return true;
      const term = repFiltroEmpleado.toLowerCase();
      const name = r.Personal ? `${r.Personal.NombreCompleto}`.toLowerCase() : `${r.EmergenciaNombreCompleto}`.toLowerCase();
      const dni = r.Personal ? (r.Personal.DNI || "").toLowerCase() : (r.EmergenciaDNI || "").toLowerCase();
      return name.includes(term) || dni.includes(term);
    });

    const exportData = filtered.map(r => ({
      'Fecha': r.FechaPedido.split('T')[0].split('-').reverse().join('/'),
      'Tipo': r.TipoComida,
      'Personal / Paciente': r.Personal ? r.Personal.NombreCompleto : r.EmergenciaNombreCompleto,
      'DNI': r.Personal ? r.Personal.DNI : r.EmergenciaDNI,
      'Dieta': r.TipoDieta,
      'Estado': r.Estado
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte de Comidas");

    XLSX.writeFile(workbook, `Reporte_SisAR_${repDesde}_al_${repHasta}.xlsx`);
  };

  const exportPDF = () => {
    if (reportes.length === 0) return Swal.fire({ title: "Aviso", text: "No hay reportes para exportar.", icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    
    const filtered = sortedReportes.filter(r => {
      if (!repFiltroEmpleado) return true;
      const term = repFiltroEmpleado.toLowerCase();
      const name = r.Personal ? `${r.Personal.NombreCompleto}`.toLowerCase() : `${r.EmergenciaNombreCompleto}`.toLowerCase();
      const dni = r.Personal ? (r.Personal.DNI || "").toLowerCase() : (r.EmergenciaDNI || "").toLowerCase();
      return name.includes(term) || dni.includes(term);
    });

    if (filtered.length === 0) return Swal.fire({ title: "Aviso", text: "No hay reportes para exportar con el filtro actual.", icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });

    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Reporte de Comidas SisAR (${repDesde.split('-').reverse().join('/')} al ${repHasta.split('-').reverse().join('/')})`, 14, 15);
    
    const tableData = filtered.map(r => [
      r.FechaPedido.split('T')[0].split('-').reverse().join('/'),
      r.TipoComida,
      r.Personal ? r.Personal.NombreCompleto : r.EmergenciaNombreCompleto,
      r.Personal ? r.Personal.DNI : (r.EmergenciaDNI || "-"),
      r.TipoDieta,
      r.Estado
    ]);

    autoTable(doc, {
      head: [['Fecha', 'Tipo', 'Personal / Paciente', 'DNI', 'Dieta', 'Estado']],
      body: tableData,
      startY: 22,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] }
    });

    doc.save(`Reporte_SisAR_${repDesde}_al_${repHasta}.pdf`);
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
        <div className="overflow-auto max-h-[calc(100vh-280px)] min-h-[320px] border border-gray-200 dark:border-gray-800 rounded-xl relative">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-20">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky top-0 left-0 bg-gray-50 dark:bg-gray-800 z-30 border-b border-r border-gray-200 dark:border-gray-800">Personal</th>
                {dietas.map(d => (
                  <th key={d} scope="col" className="px-4 py-4 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky top-0 bg-gray-50 dark:bg-gray-800 z-20 border-b border-gray-200 dark:border-gray-800">{d}</th>
                ))}
                <th scope="col" className="px-4 py-4 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky top-0 right-0 bg-gray-50 dark:bg-gray-800 z-30 border-b border-l border-gray-200 dark:border-gray-800">Estado</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800/50">
              {staff.map((p) => {
                const pSelections = selections[p.Id] || { almuerzo: null, cena: null };
                const currentSelection = planillaTab === 'almuerzo' ? pSelections.almuerzo : pSelections.cena;
                const isDisabled = planillaTab === 'almuerzo' ? isPastAlmuerzo : isPastCena;
                return (
                  <tr key={p.Id} id={`fila-agente-${p.Id}`} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors scroll-mt-12">
                    <td className="px-6 py-4 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-900 z-10 border-r border-gray-100 dark:border-gray-800">
                      <div className="flex flex-col">
                        <div className="flex items-center">
                          <span className={`text-sm font-bold ${p.bajaProvisoriaHoy ? 'text-red-500 line-through' : 'text-gray-900 dark:text-gray-100'}`}>{p.NombreCompleto || `${p.Nombre || ''} ${p.Apellido || ''}`}</span>
                          {p.bajaProvisoriaHoy && p.bajaMotivo && (
                            <span className="text-[10px] uppercase font-bold text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded ml-2 border border-red-200 dark:border-red-800">
                              {p.bajaMotivo}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">DNI: {p.DNI} • {getRacionLabel(p.Horario)}</span>
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

          {isPastAuthAlmuerzo && isPastAuthCena && (
            <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 p-4 rounded-xl flex items-center space-x-3 text-purple-900 dark:text-purple-300">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 text-purple-600 dark:text-purple-400" />
              <div className="text-xs sm:text-sm">
                <strong>Horarios de autorización de emergencias expirados:</strong> Las solicitudes de emergencia normal de hoy han cerrado. Únicamente puede registrar <strong>⚡ Reemplazos Excepcionales de Última Hora</strong>.
              </div>
            </div>
          )}

          <form className="flex flex-col gap-6" onSubmit={submitEmergency}>
            
            {/* ROW 1: Tipo de Solicitud */}
            <div className="bg-gray-50 dark:bg-gray-800/40 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">Tipo de Solicitud</label>
              <div className="flex flex-wrap gap-5">
                <label className={`flex items-center gap-2 ${isPastAuthAlmuerzo && isPastAuthCena ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input 
                    type="radio" 
                    name="emgTipo" 
                    value="reemplazo" 
                    disabled={isPastAuthAlmuerzo && isPastAuthCena}
                    checked={emgTipo === 'reemplazo'} 
                    onChange={() => {
                      setEmgTipo('reemplazo');
                      setEmgJustificacion("por reemplazo de personal");
                    }} 
                    className="accent-orange-500 w-4 h-4" 
                  /> 
                  <span className="text-sm font-semibold">Reemplazo de Personal</span>
                </label>

                <label className={`flex items-center gap-2 ${isPastAuthAlmuerzo && isPastAuthCena ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input 
                    type="radio" 
                    name="emgTipo" 
                    value="extra" 
                    disabled={isPastAuthAlmuerzo && isPastAuthCena}
                    checked={emgTipo === 'extra'} 
                    onChange={() => {
                      setEmgTipo('extra');
                      setEmgJustificacion("");
                    }} 
                    className="accent-orange-500 w-4 h-4" 
                  /> 
                  <span className="text-sm font-semibold">Agregado Extra</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="emgTipo" 
                    value="reemplazo_excepcional" 
                    checked={emgTipo === 'reemplazo_excepcional'} 
                    onChange={() => {
                      setEmgTipo('reemplazo_excepcional');
                      setEmgJustificacion("Reemplazo excepcional de última hora");
                    }} 
                    className="accent-purple-600 w-4 h-4" 
                  /> 
                  <span className="text-sm font-bold text-purple-700 dark:text-purple-400">⚡ Reemplazo Excepcional (Última Hora)</span>
                </label>
              </div>

              {/* Selector "A quién reemplaza" para Reemplazo Normal */}
              {emgTipo === 'reemplazo' && (() => {
                const idsYaReemplazados = new Set(
                  historialEmergencias
                    .filter(h => h.EmergenciaReemplazaId !== null && h.Estado !== 'Rechazado')
                    .map(h => h.EmergenciaReemplazaId)
                );
                const disponibles = staff.filter(p => (p.bajaProvisoriaHoy || p.bajaDefinitivaHoy) && !idsYaReemplazados.has(p.Id));

                return (
                  <div className="mt-3">
                    <AgentSearchableSelect
                      options={disponibles}
                      selectedId={emgReemplazaId}
                      onSelect={setEmgReemplazaId}
                      label="Seleccionar a quién reemplaza (Agente de licencia/baja):"
                      placeholder="Buscar por nombre o DNI..."
                      accentColor="orange"
                      required
                    />
                    {disponibles.length === 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 font-semibold">
                        * Todos los agentes de licencia/baja ya poseen un reemplazo registrado.
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Selector "A quién reemplaza" para Reemplazo Excepcional */}
              {emgTipo === 'reemplazo_excepcional' && (() => {
                const agentesConViandaHoy = staff.filter(p => !p.bajaProvisoriaHoy);

                return (
                  <div className="mt-3">
                    <AgentSearchableSelect
                      options={agentesConViandaHoy}
                      selectedId={emgReemplazaId}
                      onSelect={setEmgReemplazaId}
                      label="Selecciona a quién reemplaza a última hora (Agente activo en planilla hoy):"
                      placeholder="Buscar por nombre o DNI..."
                      accentColor="purple"
                      required
                    />
                  </div>
                );
              })()}

              {/* Justificación para Agregado Extra */}
              {emgTipo === 'extra' && (
                <div className="mt-3">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Justificación Obligatoria</label>
                  <textarea value={emgJustificacion} onChange={e => setEmgJustificacion(e.target.value)} required={emgTipo === 'extra'} rows={2} className="w-full rounded-lg border-gray-300 dark:border-gray-700 shadow-sm focus:border-orange-500 sm:text-sm px-3 py-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="Escribe aquí la justificación obligatoria..."></textarea>
                </div>
              )}
            </div>

            {/* ROW 2: Nombre y DNI del Reemplazante */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  {emgTipo === 'reemplazo_excepcional' ? 'Nombre y Apellido de la persona que retira' : 'Nombre y Apellido'}
                </label>
                <input type="text" value={emgNombre} onChange={e => setEmgNombre(e.target.value)} disabled={emgTipo !== 'reemplazo_excepcional' && isPastAlmuerzo && isPastCena} className="w-full rounded-lg border-gray-300 dark:border-gray-700 shadow-sm focus:border-orange-500 focus:ring-orange-500/50 sm:text-sm disabled:opacity-50 px-3 py-2.5 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="Ej. Carlos Ruiz" required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  {emgTipo === 'reemplazo_excepcional' ? 'DNI de la persona que retira' : 'DNI'}
                </label>
                <input 
                  type="text" 
                  value={emgDni} 
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                    setEmgDni(val);
                  }} 
                  maxLength={8}
                  pattern="\d{7,8}"
                  title="El DNI debe contener 7 u 8 dígitos numéricos"
                  disabled={emgTipo !== 'reemplazo_excepcional' && isPastAlmuerzo && isPastCena} 
                  className="w-full rounded-lg border-gray-300 dark:border-gray-700 shadow-sm focus:border-orange-500 focus:ring-orange-500/50 sm:text-sm disabled:opacity-50 px-3 py-2.5 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" 
                  placeholder="Ej. 11223344 (8 dígitos)" 
                  required 
                />
              </div>
            </div>

            {/* ROW 3: Comida, Dieta, Duracion (Oculto en reemplazo_excepcional) */}
            {emgTipo !== 'reemplazo_excepcional' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 bg-gray-50 dark:bg-gray-800/30 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Comida</label>
                  <div className="flex gap-4">
                    {!isPastAuthAlmuerzo && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="emgComida" value="Almuerzo" checked={emgComida === 'Almuerzo'} onChange={() => setEmgComida('Almuerzo')} className="accent-orange-500 w-4 h-4" /> <span className="text-sm">Almuerzo</span>
                      </label>
                    )}
                    {!isPastAuthCena && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="emgComida" value="Cena" checked={emgComida === 'Cena'} onChange={() => setEmgComida('Cena')} className="accent-orange-500 w-4 h-4" /> <span className="text-sm">Cena</span>
                      </label>
                    )}
                    {(!isPastAuthAlmuerzo && !isPastAuthCena) && (
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
            )}

            <div className="flex justify-end mt-2 pt-4 border-t border-gray-200 dark:border-gray-800">
              <button 
                type="submit" 
                disabled={emgTipo !== 'reemplazo_excepcional' && isPastAlmuerzo && isPastCena} 
                className={`inline-flex items-center justify-center py-2.5 px-6 border border-transparent shadow-sm text-sm font-bold rounded-lg text-white transition-all transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 ${emgTipo === 'reemplazo_excepcional' ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700' : 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600'}`}
              >
                <CheckCircle className="w-4 h-4 mr-2" /> 
                {emgTipo === 'reemplazo_excepcional' ? '⚡ Registrar Reemplazo Excepcional' : 'Enviar Solicitud de Emergencia'}
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
                  <th className="p-4 font-semibold text-sm text-gray-600 dark:text-gray-400">Fecha/Hora Pedido</th>
                  <th className="p-4 font-semibold text-sm text-gray-600 dark:text-gray-400">Rango Solicitado</th>
                  <th className="p-4 font-semibold text-sm text-gray-600 dark:text-gray-400">Agente</th>
                  <th className="p-4 font-semibold text-sm text-gray-600 dark:text-gray-400">Comida</th>
                  <th className="p-4 font-semibold text-sm text-gray-600 dark:text-gray-400">Tipo</th>
                  <th className="p-4 font-semibold text-sm text-gray-600 dark:text-gray-400">Estado</th>
                </tr>
              </thead>
              <tbody>
                {historialEmergencias.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500 dark:text-gray-400">No hay solicitudes recientes.</td>
                  </tr>
                ) : (
                  historialEmergencias.map((h: any) => {
                    let badgeClass = "bg-yellow-100 text-yellow-800 border-yellow-200";
                    if (h.Estado === "Aprobado") badgeClass = "bg-green-100 text-green-800 border-green-200";
                    if (h.Estado === "Rechazado") badgeClass = "bg-red-100 text-red-800 border-red-200";
                    
                    const isReemplazo = h.EmergenciaReemplazaId !== null;

                    const fechaObj = h.FechaCreacion ? new Date(h.FechaCreacion) : new Date(h.FechaPedido);
                    const hora24 = fechaObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(/\s?[a-zA-Z\.]+/g, '').trim();
                    const fechaHoraStr = `${fechaObj.toLocaleDateString('es-AR')} ${hora24}`;

                    let rangoStr = new Date(h.FechaPedido).toLocaleDateString('es-AR');
                    if (h.EmergenciaPeriodoInicio && h.EmergenciaPeriodoFin) {
                      const pInicioStr = new Date(h.EmergenciaPeriodoInicio).toLocaleDateString('es-AR');
                      const pFinStr = new Date(h.EmergenciaPeriodoFin).toLocaleDateString('es-AR');
                      rangoStr = pInicioStr === pFinStr ? pInicioStr : `${pInicioStr} al ${pFinStr}`;
                    }

                    const nombreAgente = h.EmergenciaNombreCompleto || `${h.EmergenciaNombre || ''} ${h.EmergenciaApellido || ''}`.trim() || (h.Personal ? h.Personal.NombreCompleto : 'Agente');
                    const dniAgente = h.EmergenciaDNI || (h.Personal ? h.Personal.DNI : '-');

                    const reemplazadoNombre = h.PersonalReemplazado 
                      ? (h.PersonalReemplazado.NombreCompleto || `${h.PersonalReemplazado.Nombre || ''} ${h.PersonalReemplazado.Apellido || ''}`.trim())
                      : '';

                    return (
                      <tr key={h.Id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="p-4 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                          {fechaHoraStr}
                        </td>
                        <td className="p-4 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {rangoStr}
                        </td>
                        <td className="p-4 text-sm text-gray-700 dark:text-gray-300">
                          <div className="flex flex-col">
                            <span className="font-bold text-gray-900 dark:text-gray-100">{nombreAgente}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">DNI: {dniAgente}</span>
                          </div>
                        </td>
                        <td className="p-4 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {h.TipoComida} <span className="text-gray-400 text-xs">({h.TipoDieta})</span>
                        </td>
                        <td className="p-4 text-sm text-gray-700 dark:text-gray-300">
                          {h.EsExcepcional ? (
                            <span className="inline-flex items-center text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/40 px-2.5 py-0.5 rounded-full text-xs font-bold border border-purple-300 dark:border-purple-700">
                              ⚡ Reemplazo Excepcional ({reemplazadoNombre || 'Agente'})
                            </span>
                          ) : isReemplazo ? (
                            <span className="inline-flex items-center text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-0.5 rounded-full text-xs border border-blue-200 dark:border-blue-800">
                              Reemplazo a: {reemplazadoNombre || 'Agente'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 px-2.5 py-0.5 rounded-full text-xs border border-orange-200 dark:border-orange-800">
                              Agregado Extra
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-sm">
                          <div className="flex items-center space-x-2">
                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeClass}`}>
                              {h.Estado}
                            </span>
                            {h.Estado === 'Pendiente' && (
                              <button
                                type="button"
                                onClick={() => deleteEmergency(h.Id)}
                                className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                title="Eliminar / Cancelar Solicitud de Emergencia"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
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
                        {padronByService[sName].sort((a: any, b: any) => a.NombreCompleto.localeCompare(b.NombreCompleto)).map((p: any) => {
                          const draftEntry = plantelDraft.find(draft => draft.DNI === p.DNI);
                          const isSelected = !!draftEntry;
                          const dbAssigned = staff.find(s => s.DNI === p.DNI);
                          
                          const getRacionesCount = (h: string) => (h && (h.toLowerCase().includes("24") || h.toLowerCase().includes("y cena"))) ? 2 : 1;

                          const dbAssignedRaciones = dbAssigned ? getRacionesCount(dbAssigned.Horario) : 0;
                          const totalExternalRaciones = (p.has24h ? 2 : (p.count12h || 0)) - dbAssignedRaciones;

                          const isAssignedElsewhere = !isSelected && totalExternalRaciones > 0;
                          const isGuardia24h = Boolean(p.EsGuardia24h);
                          const maxAllowedRaciones = isGuardia24h ? 2 : 1;

                          const disable12h = totalExternalRaciones >= maxAllowedRaciones;
                          const disable24h = !isGuardia24h || totalExternalRaciones >= 1;

                          // For selected agents, disable the button of their CURRENT draft shift
                          const isDraft12h = draftEntry?.Horario === "Almuerzo o Cena";
                          const isDraft24h = draftEntry?.Horario === "Almuerzo y Cena";

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
                                {isAssignedElsewhere && <span className="ml-2 text-blue-500 text-[10px] uppercase font-bold tracking-wider">Otro Servicio ({totalExternalRaciones} {totalExternalRaciones === 1 ? 'Ración' : 'Raciones'})</span>}
                              </p>
                            </div>
                            <div className="flex space-x-2">
                              <button
                                onClick={() => addAgent(p, "Almuerzo o Cena")}
                                disabled={disable12h || isDraft12h}
                                className={`px-2 py-1 text-xs font-bold rounded shadow-sm transition-colors ${disable12h || isDraft12h ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600' : 'bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-800/60 text-blue-700 dark:text-blue-300'}`}
                                title="Asignar Almuerzo o Cena (1 ración)"
                              >
                                {isDraft12h ? '✓ Alm. o Cena' : 'Alm. o Cena'}
                              </button>
                              <button
                                onClick={() => addAgent(p, "Almuerzo y Cena")}
                                disabled={disable24h || isDraft24h}
                                className={`px-2 py-1 text-xs font-bold rounded shadow-sm transition-colors ${disable24h || isDraft24h ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600' : 'bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/40 dark:hover:bg-indigo-800/60 text-indigo-700 dark:text-indigo-300'}`}
                                title="Asignar Almuerzo y Cena (2 raciones)"
                              >
                                {isDraft24h ? '✓ Alm. y Cena' : 'Alm. y Cena'}
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
                  <p className="text-xs text-indigo-500 dark:text-indigo-400">Define las raciones permitidas para cada uno</p>
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
                          {getRacionLabel(p.Horario)}
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
                  const name = r.Personal ? `${r.Personal.NombreCompleto}`.toLowerCase() : `${r.EmergenciaNombreCompleto}`.toLowerCase();
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
                    <td className="px-6 py-4 text-sm font-bold text-gray-900 dark:text-gray-100">{r.Personal ? `${r.Personal.NombreCompleto}` : `${r.EmergenciaNombreCompleto}`}</td>
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

function GerentePanel({ token, hospitalName, username, dietasHabilitadasProp, onConfigUpdated }: { token: string, hospitalName?: string | null, username?: string | null, dietasHabilitadasProp?: string[], onConfigUpdated?: (almuerzo: string, cena: string, dietas?: string[]) => void }) {
  const [emergencias, setEmergencias] = useState<any[]>([]);
  const [resolucionTxt, setResolucionTxt] = useState<{ [id: number]: string }>({});
  const [activeTab, setActiveTab] = useState("Bandeja");
  
  // ABM Servicios
  const [servicios, setServicios] = useState<any[]>([]);
  const [serviciosPage, setServiciosPage] = useState(1);
  const [buscarServicio, setBuscarServicio] = useState("");
  const serviciosFiltrados = servicios.filter(s => s.Nombre.toLowerCase().includes(buscarServicio.toLowerCase()));

  // Reportes & Config
  const [repDesde, setRepDesde] = useState(getTodayStr());
  const [repHasta, setRepHasta] = useState(getTodayStr());
  const [repFiltroEmpleado, setRepFiltroEmpleado] = useState("");
  const [reportes, setReportes] = useState<any[]>([]);
  const [configAlmuerzo, setConfigAlmuerzo] = useState("09:00");
  const [configCena, setConfigCena] = useState("17:00");
  const [configAuthAlmuerzo, setConfigAuthAlmuerzo] = useState("11:00");
  const [configAuthCena, setConfigAuthCena] = useState("18:00");
  const [dietasConfig, setDietasConfig] = useState<string[]>(dietasHabilitadasProp || DIETAS_DISPONIBLES);
  const { theme } = useTheme();

  const toggleDietaConfig = (dietaNombre: string) => {
    if (dietasConfig.includes(dietaNombre)) {
      if (dietasConfig.length === 1) {
        Swal.fire({ title: "Atención", text: "Debe haber al menos un menú habilitado", icon: "warning", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        return;
      }
      setDietasConfig(dietasConfig.filter(d => d !== dietaNombre));
    } else {
      setDietasConfig([...dietasConfig, dietaNombre]);
    }
  };

  const fetchEmergencias = async () => {
    try {
      const res = await fetch(`${API_URL}/api/emergencies/pending`, {
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
      const res = await fetch(`${API_URL}/api/services`, {
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
    fetch(`${API_URL}/api/hospital/config`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d && d.LimiteAlmuerzo) setConfigAlmuerzo(d.LimiteAlmuerzo);
        if (d && d.LimiteCena) setConfigCena(d.LimiteCena);
        if (d && d.LimiteAutorizacionAlmuerzo) setConfigAuthAlmuerzo(d.LimiteAutorizacionAlmuerzo);
        if (d && d.LimiteAutorizacionCena) setConfigAuthCena(d.LimiteAutorizacionCena);
        if (d && d.DietasHabilitadas) {
          const arr = d.DietasHabilitadas.split(',').map((x: string) => x.trim()).filter(Boolean);
          if (arr.length > 0) setDietasConfig(arr);
        }
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
      const res = await fetch(`${API_URL}/api/emergencies/${id}/resolve`, {
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
    const { value: nombreServicio } = await Swal.fire({
      title: 'Nuevo Servicio',
      input: 'text',
      inputLabel: 'Nombre del Servicio',
      inputPlaceholder: 'Ej. Terapia Intensiva',
      showCancelButton: true,
      confirmButtonText: 'Crear',
      cancelButtonText: 'Cancelar',
      background: theme === 'dark' ? '#1f2937' : '#fff',
      color: theme === 'dark' ? '#fff' : '#000',
      inputValidator: (value) => {
        if (!value) return 'Debes escribir un nombre para el servicio';
      }
    });

    if (nombreServicio) {
      try {
        const res = await fetch(`${API_URL}/api/services`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ nombre: nombreServicio })
        });
        if (res.ok) {
          Swal.fire({ title: "Éxito", text: "Servicio creado", icon: "success", timer: 1500, background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
          fetchServicios();
        } else {
          const data = await res.json();
          Swal.fire({ title: "Error", text: data.error || "Error al crear", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        }
      } catch (e) {
        Swal.fire({ title: "Error", text: "Error de conexión", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    }
  };

  const toggleVoucherIndividual = async (servicioId: number, nombre: string) => {
    try {
      const res = await fetch(`${API_URL}/api/services/${servicioId}/toggle-voucher`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        Swal.fire({ 
          title: "Éxito", 
          text: `Configuración del servicio ${nombre} actualizada`, 
          icon: "success", 
          timer: 1500,
          background: theme === 'dark' ? '#1f2937' : '#fff',
          color: theme === 'dark' ? '#fff' : '#000'
        });
        fetchServicios();
        if (reportes.length > 0) {
          generarReporte();
        }
      } else {
        const data = await res.json();
        Swal.fire({ title: "Error", text: data.error || "No se pudo actualizar", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    } catch (e) {
      Swal.fire({ title: "Error", text: "Error de conexión", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    }
  };

  const asignarJefeModal = async (servicioId: number, servicioNombre: string) => {
    const { value: formValues } = await Swal.fire({
      title: `Asignar Jefe a ${servicioNombre}`,
      html:
        '<p style="font-size:13px; color:#6b7280; margin-bottom:12px;">Se creará la cuenta con la contraseña por defecto <strong>123456</strong>. El usuario deberá cambiarla obligatoriamente en su primer ingreso.</p>' +
        '<input id="swal-input-nombre" class="swal2-input" placeholder="Apellido/s, Nombres (Ej. Méndez, Juan)">' +
        '<input id="swal-input-user" class="swal2-input" placeholder="Nombre de usuario (Ej. jmendez)">',
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Crear Cuenta',
      cancelButtonText: 'Cancelar',
      background: theme === 'dark' ? '#1f2937' : '#fff',
      color: theme === 'dark' ? '#fff' : '#000',
      preConfirm: () => {
        const nombreCompleto = (document.getElementById('swal-input-nombre') as HTMLInputElement).value;
        const username = (document.getElementById('swal-input-user') as HTMLInputElement).value;
        if (!nombreCompleto || !username) {
          Swal.showValidationMessage('El Apellido/s, Nombres y el Nombre de Usuario son obligatorios');
          return false;
        }
        return { nombreCompleto, username };
      }
    });

    if (formValues) {
      try {
        const res = await fetch(`${API_URL}/api/users/jefe-servicio`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ username: formValues.username, nombreCompleto: formValues.nombreCompleto, servicioId })
        });
        if (res.ok) {
          Swal.fire({ title: "Éxito", text: "Jefe asignado exitosamente (Contraseña: 123456)", icon: "success", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
          fetchServicios();
        } else {
          const data = await res.json();
          Swal.fire({ title: "Error", text: data.error, icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        }
      } catch (e) {
        Swal.fire({ title: "Error", text: "Error de red", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    }
  };

  const resetJefePassword = async (id: number, username: string) => {
    Swal.fire({
      title: '¿Resetear contraseña?',
      text: `Se cambiará la contraseña de "${username}" a 123456 y se le exigirá cambiarla en su próximo ingreso.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, resetear',
      cancelButtonText: 'Cancelar',
      background: theme === 'dark' ? '#1f2937' : '#ffffff',
      color: theme === 'dark' ? '#ffffff' : '#000000',
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await fetch(`${API_URL}/api/users/${id}/reset-password`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            Swal.fire({ title: "Éxito", text: `Contraseña de ${username} reseteada a '123456'`, icon: "success", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
            fetchServicios();
          } else {
            const data = await res.json();
            Swal.fire({ title: "Error", text: data.error || "No se pudo resetear", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
          }
        } catch (e) {
          Swal.fire({ title: "Error", text: "Error de red", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        }
      }
    });
  };

  const toggleJefeStatus = async (id: number, username: string, currentActive: boolean) => {
    const accion = currentActive ? "Inhabilitar" : "Habilitar";
    Swal.fire({
      title: `¿${accion} usuario?`,
      text: `¿Deseas ${accion.toLowerCase()} la cuenta de "${username}"?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: `Sí, ${accion.toLowerCase()}`,
      cancelButtonText: 'Cancelar',
      background: theme === 'dark' ? '#1f2937' : '#ffffff',
      color: theme === 'dark' ? '#ffffff' : '#000000',
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await fetch(`${API_URL}/api/users/${id}/disable`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            Swal.fire({ title: "Éxito", text: `Usuario ${username} ${currentActive ? 'inhabilitado' : 'habilitado'}`, icon: "success", timer: 1500, background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
            fetchServicios();
          } else {
            const data = await res.json();
            Swal.fire({ title: "Error", text: data.error || "No se pudo actualizar el estado", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
          }
        } catch (e) {
          Swal.fire({ title: "Error", text: "Error de red", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        }
      }
    });
  };

  const deleteJefe = async (id: number, username: string) => {
    Swal.fire({
      title: '¿Eliminar usuario?',
      text: `¿Seguro que deseas eliminar la cuenta de "${username}"? Esta acción no se puede deshacer.`,
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
          const res = await fetch(`${API_URL}/api/users/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            Swal.fire({ title: "Éxito", text: `Usuario ${username} eliminado`, icon: "success", timer: 1500, background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
            fetchServicios();
          } else {
            const data = await res.json();
            Swal.fire({ title: "Error", text: data.error || "No se pudo eliminar", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
          }
        } catch (e) {
          Swal.fire({ title: "Error", text: "Error de red", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        }
      }
    });
  };

  const getServicioNombre = (r: any) => {
    if (r.Servicio?.Nombre) return r.Servicio.Nombre;
    if (r.Personal?.Servicio?.Nombre) return r.Personal.Servicio.Nombre;
    if (r.PersonalReemplazado?.Servicio?.Nombre) return r.PersonalReemplazado.Servicio.Nombre;
    if (r.SolicitadoPor?.Servicio?.Nombre) return r.SolicitadoPor.Servicio.Nombre;
    return "Sin Servicio";
  };

  const esServicioIndividual = (r: any) => {
    const sId = r.ServicioId || r.Personal?.ServicioId || r.PersonalReemplazado?.ServicioId || r.SolicitadoPor?.ServicioId;
    if (sId) {
      const servActual = servicios.find(s => s.Id === sId);
      if (servActual) return servActual.VoucherIndividual;
    }
    if (r.Servicio && typeof r.Servicio.VoucherIndividual === 'boolean') return r.Servicio.VoucherIndividual;
    if (r.Personal?.Servicio && typeof r.Personal.Servicio.VoucherIndividual === 'boolean') return r.Personal.Servicio.VoucherIndividual;
    if (r.PersonalReemplazado?.Servicio && typeof r.PersonalReemplazado.Servicio.VoucherIndividual === 'boolean') return r.PersonalReemplazado.Servicio.VoucherIndividual;
    if (r.SolicitadoPor?.Servicio && typeof r.SolicitadoPor.Servicio.VoucherIndividual === 'boolean') return r.SolicitadoPor.Servicio.VoucherIndividual;
    return false;
  };

  const generarReporte = async () => {
    try {
      const res = await fetch(`${API_URL}/api/reports?fechaInicio=${repDesde}&fechaFin=${repHasta}`, {
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
    const toMins = (hStr: string) => {
      if (!hStr) return 0;
      const [h, m] = hStr.split(':').map(Number);
      return h * 60 + m;
    };

    if (toMins(configAuthAlmuerzo) <= toMins(configAlmuerzo)) {
      Swal.fire({
        title: "Horario Inválido",
        text: `La hora tope para autorizar emergencias de Almuerzo (${configAuthAlmuerzo}) debe ser estrictamente posterior a la hora de cierre de pedidos (${configAlmuerzo}).`,
        icon: "warning",
        background: theme === 'dark' ? '#1f2937' : '#fff',
        color: theme === 'dark' ? '#fff' : '#000'
      });
      return;
    }

    if (toMins(configAuthCena) <= toMins(configCena)) {
      Swal.fire({
        title: "Horario Inválido",
        text: `La hora tope para autorizar emergencias de Cena (${configAuthCena}) debe ser estrictamente posterior a la hora de cierre de pedidos (${configCena}).`,
        icon: "warning",
        background: theme === 'dark' ? '#1f2937' : '#fff',
        color: theme === 'dark' ? '#fff' : '#000'
      });
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/hospital/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          limiteAlmuerzo: configAlmuerzo,
          limiteCena: configCena,
          limiteAutorizacionAlmuerzo: configAuthAlmuerzo,
          limiteAutorizacionCena: configAuthCena,
          dietasHabilitadas: dietasConfig.join(",")
        })
      });
      if (res.ok) {
        Swal.fire({ title: "Guardado", text: "Configuración de horarios y menús guardada con éxito", icon: "success", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        if (onConfigUpdated) {
          onConfigUpdated(configAlmuerzo, configCena, dietasConfig);
        }
      } else {
        const data = await res.json();
        Swal.fire({ title: "Error", text: data.error || "Error al guardar la configuración.", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    } catch {
      Swal.fire({ title: "Error", text: "No se pudo guardar la configuración.", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    }
  };

  const handleImprimirCocina = () => {
    if (reportes.length === 0) {
      Swal.fire({ title: "Aviso", text: "No hay reportes generados para imprimir.", icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }

    const filtered = reportes.filter(r => {
      if (!repFiltroEmpleado) return true;
      const term = repFiltroEmpleado.toLowerCase();
      const name = r.Personal ? `${r.Personal.NombreCompleto}`.toLowerCase() : `${r.EmergenciaNombreCompleto}`.toLowerCase();
      const dni = r.Personal ? (r.Personal.DNI || "").toLowerCase() : (r.EmergenciaDNI || "").toLowerCase();
      return name.includes(term) || dni.includes(term);
    });

    if (filtered.length === 0) {
      Swal.fire({ title: "Aviso", text: "No hay datos para imprimir según el filtro actual.", icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }

    const resAlmuerzo: Record<string, number> = {};
    const resCena: Record<string, number> = {};
    let totalAlmuerzo = 0;
    let totalCena = 0;

    filtered.forEach(r => {
      const comida = (r.TipoComida || '').toLowerCase();
      const dieta = r.TipoDieta || 'Normal';
      if (comida === 'almuerzo') {
        resAlmuerzo[dieta] = (resAlmuerzo[dieta] || 0) + 1;
        totalAlmuerzo++;
      } else if (comida === 'cena') {
        resCena[dieta] = (resCena[dieta] || 0) + 1;
        totalCena++;
      } else {
        resAlmuerzo[dieta] = (resAlmuerzo[dieta] || 0) + 1;
        totalAlmuerzo++;
      }
    });

    const now = new Date();
    const fechaImpresion = now.toLocaleDateString('es-AR');
    const horaImpresion = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(/\s?[a-zA-Z\.]+/g, '').trim();
    const usuarioImpresion = username || 'Usuario';
    const efNombre = hospitalName || 'Efector';
    const fDesdeStr = repDesde.split('-').reverse().join('/');
    const fHastaStr = repHasta.split('-').reverse().join('/');

    const renderTablaDietas = (counts: Record<string, number>, total: number) => {
      if (total === 0) return '<p style="color:#666; font-style:italic; margin-bottom: 20px;">Sin pedidos registrados para este turno.</p>';
      let rows = '';
      Object.entries(counts).sort((a,b) => b[1] - a[1]).forEach(([dieta, cant]) => {
        rows += `
          <tr>
            <td style="padding: 8px 12px; border: 1px solid #ccc; font-weight: bold; font-size: 14px;">${dieta}</td>
            <td style="padding: 8px 12px; border: 1px solid #ccc; text-align: center; font-size: 16px; font-weight: bold; color: #1e40af;">${cant}</td>
          </tr>
        `;
      });
      return `
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="padding: 8px 12px; border: 1px solid #ccc; text-align: left; font-size: 13px; color: #374151;">Tipo de Dieta</th>
              <th style="padding: 8px 12px; border: 1px solid #ccc; text-align: center; font-size: 13px; color: #374151; width: 180px;">Cantidad a Cocinar</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr style="background-color: #e5e7eb; font-weight: bold;">
              <td style="padding: 8px 12px; border: 1px solid #ccc; text-align: right; font-size: 14px;">SUBTOTAL RACIONES:</td>
              <td style="padding: 8px 12px; border: 1px solid #ccc; text-align: center; font-size: 16px; color: #000;">${total}</td>
            </tr>
          </tbody>
        </table>
      `;
    };

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Permita las ventanas emergentes para imprimir.");
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Reporte de Producción - Cocina</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 25px; color: #111; }
            .header { border-bottom: 3px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
            .title { font-size: 22px; font-weight: bold; color: #1e3a8a; letter-spacing: 0.5px; }
            .subtitle { font-size: 14px; color: #374151; margin-top: 5px; }
            .meta { text-align: right; font-size: 12px; color: #4b5563; }
            .section-title { font-size: 16px; font-weight: bold; color: #1f2937; margin-top: 20px; border-left: 4px solid #2563eb; padding-left: 10px; }
            .footer { margin-top: 35px; border-top: 1px dashed #9ca3af; padding-top: 8px; font-size: 10px; color: #6b7280; text-align: right; }
            @media print {
              @page { size: A4 portrait; margin: 1.5cm; }
              body { margin: 0; }
            }
          </style>
        </head>
        <body onload="setTimeout(() => { window.print(); window.close(); }, 600)">
          <div class="header">
            <div>
              <div class="title">REPORTE DE PRODUCCIÓN - COCINA</div>
              <div class="subtitle">Efector: <strong>${efNombre}</strong></div>
            </div>
            <div class="meta">
              <div>Período: <strong>${fDesdeStr} ${fDesdeStr !== fHastaStr ? 'al ' + fHastaStr : ''}</strong></div>
              <div>Fecha de Emisión: ${fechaImpresion}</div>
            </div>
          </div>

          <div class="section-title">☀️ ALMUERZO</div>
          ${renderTablaDietas(resAlmuerzo, totalAlmuerzo)}

          <div class="section-title">🌙 CENA</div>
          ${renderTablaDietas(resCena, totalCena)}

          <div style="margin-top: 25px; padding: 14px; background: #eff6ff; border: 1px solid #93c5fd; border-radius: 8px; font-size: 16px; font-weight: bold; text-align: right; color: #1e3a8a;">
            GRAN TOTAL RACIONES A COCINAR: <span style="color: #1d4ed8; font-size: 20px; margin-left: 8px;">${totalAlmuerzo + totalCena}</span>
          </div>

          <div class="footer">
            Impreso el ${fechaImpresion} a las ${horaImpresion} | Usuario: ${usuarioImpresion}
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleImprimirEntrega = () => {
    if (reportes.length === 0) {
      Swal.fire({ title: "Aviso", text: "No hay reportes generados para imprimir.", icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }

    const filtered = reportes.filter(r => {
      if (!repFiltroEmpleado) return true;
      const term = repFiltroEmpleado.toLowerCase();
      const name = r.Personal ? `${r.Personal.NombreCompleto}`.toLowerCase() : `${r.EmergenciaNombreCompleto}`.toLowerCase();
      const dni = r.Personal ? (r.Personal.DNI || "").toLowerCase() : (r.EmergenciaDNI || "").toLowerCase();
      return name.includes(term) || dni.includes(term);
    });

    if (filtered.length === 0) {
      Swal.fire({ title: "Aviso", text: "No hay datos para imprimir según el filtro actual.", icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }

    const now = new Date();
    const fechaImpresion = now.toLocaleDateString('es-AR');
    const horaImpresion = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(/\s?[a-zA-Z\.]+/g, '').trim();
    const usuarioImpresion = username || 'Usuario';
    const efNombre = hospitalName || 'Efector';
    const fDesdeStr = repDesde.split('-').reverse().join('/');
    const fHastaStr = repHasta.split('-').reverse().join('/');


    const individuales = filtered.filter(r => esServicioIndividual(r));
    const consolidados = filtered.filter(r => !esServicioIndividual(r));

    interface FilaEntrega {
      fechaOriginal: string;
      fechaOrder: string;
      servicioName: string;
      agenteDetalle: string;
      comidaDietaDetalle: string;
      cantidadRaciones: number;
    }

    const filasParaImprimir: FilaEntrega[] = [];

    // Agregar las individuales
    individuales.forEach(p => {
      const fechaOrder = p.FechaPedido.split('T')[0].split('-').reverse().join('/');
      const nombreAgente = p.Personal ? `${p.Personal.NombreCompleto}` : `${p.EmergenciaNombreCompleto}`;
      const dniAgente = p.Personal ? (p.Personal.DNI || "-") : (p.EmergenciaDNI || "-");

      filasParaImprimir.push({
        fechaOriginal: p.FechaPedido,
        fechaOrder: fechaOrder,
        servicioName: getServicioNombre(p),
        agenteDetalle: `<strong>${nombreAgente}</strong><br/><span style="color: #555; font-size: 10px;">DNI: ${dniAgente}</span>`,
        comidaDietaDetalle: `<strong>${p.TipoComida}</strong> (${p.TipoDieta})`,
        cantidadRaciones: 1
      });
    });

    // Agrupar y agregar las consolidadas
    const gruposConsolidados: Record<string, {
      FechaPedido: string;
      ServicioNombre: string;
      TipoComida: string;
      TipoDieta: string;
      Cantidad: number;
    }> = {};

    consolidados.forEach(r => {
      const fecha = r.FechaPedido.split('T')[0];
      const servicioName = getServicioNombre(r);
      const key = `${fecha}_${servicioName}_${r.TipoComida}_${r.TipoDieta}`;
      if (!gruposConsolidados[key]) {
        gruposConsolidados[key] = {
          FechaPedido: r.FechaPedido,
          ServicioNombre: servicioName,
          TipoComida: r.TipoComida,
          TipoDieta: r.TipoDieta,
          Cantidad: 0
        };
      }
      gruposConsolidados[key].Cantidad += 1;
    });

    Object.values(gruposConsolidados).forEach(g => {
      const fechaOrder = g.FechaPedido.split('T')[0].split('-').reverse().join('/');
      filasParaImprimir.push({
        fechaOriginal: g.FechaPedido,
        fechaOrder: fechaOrder,
        servicioName: g.ServicioNombre,
        agenteDetalle: `<strong>CONSOLIDADO</strong><br/><span style="color: #2563eb; font-size: 10px; font-weight: bold;">CANTIDAD: ${g.Cantidad} RACION(ES)</span>`,
        comidaDietaDetalle: `<strong>${g.TipoComida}</strong> (${g.TipoDieta})`,
        cantidadRaciones: g.Cantidad
      });
    });

    // Ordenar por fecha y luego por nombre del servicio
    filasParaImprimir.sort((a, b) => {
      const cmpFecha = a.fechaOriginal.localeCompare(b.fechaOriginal);
      if (cmpFecha !== 0) return cmpFecha;
      return a.servicioName.localeCompare(b.servicioName);
    });

    let rowsHTML = '';
    filasParaImprimir.forEach((f, idx) => {
      rowsHTML += `
        <tr>
          <td style="padding: 8px 6px; border: 1px solid #999; text-align: center; font-size: 11px;">${idx + 1}</td>
          <td style="padding: 8px 6px; border: 1px solid #999; font-size: 11px; white-space: nowrap;">${f.fechaOrder}</td>
          <td style="padding: 8px 6px; border: 1px solid #999; font-size: 11px;">${f.servicioName}</td>
          <td style="padding: 8px 6px; border: 1px solid #999; font-size: 11px;">
            ${f.agenteDetalle}
          </td>
          <td style="padding: 8px 6px; border: 1px solid #999; font-size: 11px;">
            ${f.comidaDietaDetalle}
          </td>
          <td style="padding: 8px 6px; border: 1px solid #999; width: 190px; text-align: center; vertical-align: bottom;">
            <div style="border-bottom: 1px solid #444; height: 35px; width: 90%; margin: 0 auto 3px auto;"></div>
            <span style="font-size: 8px; color: #666; text-transform: uppercase; font-weight: bold;">Firma / Conformidad</span>
          </td>
        </tr>
      `;
    });

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Permita las ventanas emergentes para imprimir.");
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Planilla de Entrega y Conformidad</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; color: #111; }
            .header { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-end; }
            .title { font-size: 20px; font-weight: bold; color: #111; }
            .subtitle { font-size: 13px; color: #374151; margin-top: 4px; }
            .meta { text-align: right; font-size: 11px; color: #4b5563; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background-color: #f3f4f6; padding: 8px 6px; border: 1px solid #666; font-size: 11px; text-align: left; text-transform: uppercase; color: #374151; }
            .summary { margin-top: 18px; font-size: 13px; font-weight: bold; text-align: right; border-top: 2px solid #111; padding-top: 8px; }
            .footer { margin-top: 25px; border-top: 1px dashed #aaa; padding-top: 6px; font-size: 9px; color: #6b7280; text-align: right; }
            @media print {
              @page { size: A4 portrait; margin: 1cm; }
              body { margin: 0; }
            }
          </style>
        </head>
        <body onload="setTimeout(() => { window.print(); window.close(); }, 600)">
          <div class="header">
            <div>
              <div class="title">PLANILLA DE ENTREGA Y CONFORMIDAD DE RACIONES</div>
              <div class="subtitle">Efector: <strong>${efNombre}</strong></div>
            </div>
            <div class="meta">
              <div>Período: <strong>${fDesdeStr} ${fDesdeStr !== fHastaStr ? 'al ' + fHastaStr : ''}</strong></div>
              <div>Fecha de Emisión: ${fechaImpresion}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="text-align: center; width: 30px;">#</th>
                <th style="width: 80px;">Fecha</th>
                <th>Servicio / Destino</th>
                <th>Agente / Paciente</th>
                <th style="width: 140px;">Comida / Dieta</th>
                <th style="text-align: center; width: 190px;">Firma de Conformidad</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHTML}
            </tbody>
          </table>

          <div class="summary">
            TOTAL RACIONES A ENTREGAR: ${filtered.length}
          </div>

          <div class="footer">
            Impreso el ${fechaImpresion} a las ${horaImpresion} | Usuario: ${usuarioImpresion}
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleImprimirVouchers = (tipo: 'Almuerzo' | 'Cena') => {
    if (reportes.length === 0) {
      Swal.fire({ title: "Aviso", text: "No hay reportes generados para imprimir.", icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }
    
    const filtered = reportes.filter(r => {
      if (r.Estado !== "Aprobado") return false;
      if (r.TipoComida !== tipo) return false;
      if (!repFiltroEmpleado) return true;
      const term = repFiltroEmpleado.toLowerCase();
      const name = r.Personal ? `${r.Personal.NombreCompleto}`.toLowerCase() : `${r.EmergenciaNombreCompleto}`.toLowerCase();
      const dni = r.Personal ? (r.Personal.DNI || "").toLowerCase() : (r.EmergenciaDNI || "").toLowerCase();
      return name.includes(term) || dni.includes(term);
    });

    if (filtered.length === 0) {
      Swal.fire({ title: "Aviso", text: `No hay reportes de ${tipo} que coincidan con el filtro.`, icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }


    // Agrupar los reportes filtrados por servicio
    const porServicio: Record<string, any[]> = {};
    filtered.forEach(r => {
      const servicioName = getServicioNombre(r);
      if (!porServicio[servicioName]) porServicio[servicioName] = [];
      porServicio[servicioName].push(r);
    });

    const serviciosKeys = Object.keys(porServicio).sort((a, b) => a.localeCompare(b));

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Permita las ventanas emergentes para imprimir.");
      return;
    }

    const now = new Date();
    const fechaImpresion = now.toLocaleDateString('es-AR');
    const horaImpresion = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const usuarioImpresion = username || 'Usuario';

    let vouchersHTML = '';

    serviciosKeys.forEach((servicio, sIdx) => {
      const reportesServicio = porServicio[servicio];
      const esUltimoServicio = sIdx === serviciosKeys.length - 1;

      const individuales = reportesServicio.filter(r => esServicioIndividual(r));
      const consolidados = reportesServicio.filter(r => !esServicioIndividual(r));

      vouchersHTML += `<div class="servicio-group ${esUltimoServicio ? '' : 'page-break'}">`;

      // Vouchers consolidados para este servicio
      if (consolidados.length > 0) {
        const date = consolidados[0].FechaPedido.split('T')[0].split('-').reverse().join('/');
        const totalPlatos = consolidados.length;
        const counts: Record<string, number> = {};
        consolidados.forEach(p => { counts[p.TipoDieta] = (counts[p.TipoDieta] || 0) + 1; });
        const dietasText = Object.entries(counts).map(([dieta, cant]) => `${dieta} (${cant})`).join(' | ');
        const qrData = encodeURIComponent(`${servicio}-${tipo}-${date}-Total:${totalPlatos}`);
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${qrData}`;

        vouchersHTML += `
          <div class="voucher">
            <div class="watermark">SisAR ORIGINAL - SisAR ORIGINAL</div>
            <div class="v-header">
               <div class="v-logo">
                  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
                    <defs>
                      <linearGradient id="bg-${sIdx}" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#3b82f6" />
                        <stop offset="100%" stop-color="#4f46e5" />
                      </linearGradient>
                    </defs>
                    <rect width="64" height="64" rx="16" fill="url(#bg-${sIdx})" />
                    <g transform="translate(14, 14) scale(1.5)">
                      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M7 2v20" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </g>
                  </svg>
               </div>
               <div class="v-title">
                  <div class="v-title-main">SisAR - VOUCHER DE COMIDA</div>
                  <div class="v-title-sub">Sistema de Administracion de Raciones</div>
               </div>
            </div>
            <div class="v-body">
               <div class="v-info">
                  <div class="v-row space-between">
                     <div>TIPO: <strong>${tipo.toUpperCase()}</strong></div>
                     <div>Servicio: ${servicio}</div>
                     <div>Fecha: ${date}</div>
                  </div>
                  <div class="v-total">TOTAL PLATOS: ${totalPlatos}</div>
                  <div class="v-diets">Dietas: ${dietasText}</div>
               </div>
               <div class="v-qr"><img src="${qrUrl}" alt="QR Code" /></div>
            </div>
            <div class="v-footer">
               Impreso el ${fechaImpresion} a las ${horaImpresion} hs | Usuario: ${usuarioImpresion}
            </div>
          </div>
          <div class="cut-line"></div>
        `;
      }

      // Vouchers individuales para este servicio
      individuales.forEach((p, pIdx) => {
        const date = p.FechaPedido.split('T')[0].split('-').reverse().join('/');
        const agenteNombre = p.Personal ? p.Personal.NombreCompleto : (p.EmergenciaNombreCompleto || "Emergencia/Reemplazo");
        const agenteDNI = p.Personal ? (p.Personal.DNI || "-") : (p.EmergenciaDNI || "-");
        const dieta = p.TipoDieta;
        
        const qrData = encodeURIComponent(`${servicio}-${tipo}-${date}-Agente:${agenteNombre}-DNI:${agenteDNI}-Dieta:${dieta}`);
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${qrData}`;

        vouchersHTML += `
          <div class="voucher">
            <div class="watermark">INDIVIDUAL - SisAR ORIGINAL</div>
            <div class="v-header">
               <div class="v-logo">
                  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
                    <defs>
                      <linearGradient id="bg-ind-${sIdx}-${pIdx}" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#10b981" />
                        <stop offset="100%" stop-color="#059669" />
                      </linearGradient>
                    </defs>
                    <rect width="64" height="64" rx="16" fill="url(#bg-ind-${sIdx}-${pIdx})" />
                    <g transform="translate(14, 14) scale(1.5)">
                      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M7 2v20" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </g>
                  </svg>
               </div>
               <div class="v-title">
                  <div class="v-title-main">SisAR - VOUCHER INDIVIDUAL</div>
                  <div class="v-title-sub">Sistema de Administracion de Raciones</div>
               </div>
            </div>
            <div class="v-body">
               <div class="v-info">
                  <div class="v-row space-between">
                     <div>TIPO: <strong>${tipo.toUpperCase()}</strong></div>
                     <div>Servicio: ${servicio}</div>
                     <div>Fecha: ${date}</div>
                  </div>
                  <div class="v-total">AGENTE: ${agenteNombre}</div>
                  <div class="v-row" style="margin-bottom: 5px;">
                     <div>DNI: <strong>${agenteDNI}</strong></div>
                  </div>
                  <div class="v-diets">Dieta: <strong>${dieta}</strong></div>
               </div>
               <div class="v-qr"><img src="${qrUrl}" alt="QR Code" /></div>
            </div>
            <div class="v-footer">
               Impreso el ${fechaImpresion} a las ${horaImpresion} hs | Usuario: ${usuarioImpresion}
            </div>
          </div>
          <div class="cut-line"></div>
        `;
      });

      vouchersHTML += `</div>`;
    });

    const html = `
      <html>
        <head>
          <title>Imprimir Vouchers - ${tipo}</title>
          <style>
            body { font-family: sans-serif; margin: 0; padding: 0; background: #fff; }
            .voucher { 
              border: 1px solid #000; width: 100%; max-width: 700px;
              margin: 20px auto 0 auto; position: relative; overflow: hidden;
              background: #fff; box-sizing: border-box;
            }
            .watermark {
              position: absolute; top: 50%; left: 50%;
              transform: translate(-50%, -50%) rotate(-20deg);
              font-size: 30px; font-weight: bold; color: rgba(200, 200, 200, 0.5);
              white-space: nowrap; pointer-events: none; z-index: 1;
            }
            .v-header {
              display: flex; align-items: center; padding: 10px;
              border-bottom: 1px solid #000; position: relative; z-index: 2;
            }
            .v-logo { width: 38px; height: 38px; margin-right: 15px; }
            .v-logo svg { width: 100%; height: 100%; object-fit: contain; }
            .v-title-main { font-size: 20px; font-weight: bold; color: #004488; }
            .v-title-sub { font-size: 12px; color: #333; }
            .v-body { display: flex; padding: 10px; position: relative; z-index: 2; }
            .v-info { flex: 1; padding-right: 10px; }
            .v-row { display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 14px; }
            .v-total { font-size: 16px; font-weight: bold; margin-bottom: 15px; }
            .v-diets { font-size: 12px; }
            .v-qr { width: 80px; display: flex; align-items: flex-end; justify-content: flex-end; }
            .v-qr img { width: 80px; height: 80px; }
            .v-footer {
              border-top: 1px dashed #ccc; padding: 4px 10px; font-size: 9px;
              color: #555; text-align: right; position: relative; z-index: 2; background: #fbfbfb;
            }
            .cut-line { width: 100%; max-width: 700px; margin: 20px auto; border-top: 2px dashed #aaa; }
            @media print { 
              @page { size: A4 portrait; margin: 1cm; } 
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } 
              .page-break { page-break-after: always; break-after: page; }
            }
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
      Nombre: r.Personal ? `${r.Personal.NombreCompleto}` : `${r.EmergenciaNombreCompleto}`,
      Servicio: getServicioNombre(r),
      Comida: r.TipoComida,
      Dieta: r.TipoDieta,
      Estado: r.Estado
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reportes");
    XLSX.writeFile(workbook, `Reportes_SisAR_${repDesde}_${repHasta}.xlsx`);
  };

  const exportPDF = () => {
    if (reportes.length === 0) return Swal.fire({ title: "Aviso", text: "No hay reportes para exportar.", icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    
    const filtered = reportes.filter(r => {
      if (!repFiltroEmpleado) return true;
      const term = repFiltroEmpleado.toLowerCase();
      const name = r.Personal ? `${r.Personal.NombreCompleto}`.toLowerCase() : `${r.EmergenciaNombreCompleto}`.toLowerCase();
      const dni = r.Personal ? (r.Personal.DNI || "").toLowerCase() : (r.EmergenciaDNI || "").toLowerCase();
      return name.includes(term) || dni.includes(term);
    });

    if (filtered.length === 0) return Swal.fire({ title: "Aviso", text: "No hay reportes para exportar con el filtro actual.", icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });

    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Reportes de Raciones SisAR (${repDesde.split('-').reverse().join('/')} al ${repHasta.split('-').reverse().join('/')})`, 14, 15);
    
    const tableData = filtered.map(r => [
      r.FechaPedido.split('T')[0].split('-').reverse().join('/'),
      r.Personal ? r.Personal.DNI : (r.EmergenciaDNI || "-"),
      r.Personal ? `${r.Personal.NombreCompleto}` : `${r.EmergenciaNombreCompleto}`,
      getServicioNombre(r),
      r.TipoComida,
      r.TipoDieta,
      r.Estado
    ]);

    autoTable(doc, {
      head: [['Fecha', 'DNI', 'Nombre', 'Servicio', 'Comida', 'Dieta', 'Estado']],
      body: tableData,
      startY: 22,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`Reporte_SisAR_${repDesde}_al_${repHasta}.pdf`);
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
              {emergencias.map(e => {
                const nombreAgente = e.EmergenciaNombreCompleto || `${e.EmergenciaNombre || ''} ${e.EmergenciaApellido || ''}`.trim() || 'Agente';
                return (
                  <div key={e.Id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-6">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400 text-xs font-bold px-2.5 py-1 rounded-md">
                            URGENTE
                          </span>
                          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{nombreAgente}</h3>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                          <span className="font-semibold text-gray-900 dark:text-gray-200">Agente:</span> <span className="font-bold text-gray-900 dark:text-gray-100">{nombreAgente}</span> • <span className="font-semibold text-gray-900 dark:text-gray-200">DNI:</span> {e.EmergenciaDNI} • <span className="font-semibold text-gray-900 dark:text-gray-200">Solicita:</span> {e.TipoComida} ({e.TipoDieta})
                        </p>
                        {e.PersonalReemplazado && (
                          <p className="text-xs text-blue-600 dark:text-blue-400 mb-1 font-medium">
                            Reemplaza a: {e.PersonalReemplazado.NombreCompleto} (DNI: {e.PersonalReemplazado.DNI})
                          </p>
                        )}
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
              );
            })}
            </div>
          )}
        </div>
      )}

      {/* HOSPITAL CONTENT */}
      {activeTab === "Hospital" && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
          <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
              <Building className="w-5 h-5 mr-2 text-indigo-500" /> Gestión de Servicios{hospitalName ? ` de ${hospitalName}` : ''}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Configura las áreas del efector y sus encargados.</p>
          </div>
          <div className="p-8 flex flex-col space-y-8">
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">1. Servicios Activos</h3>
                <button onClick={crearServicio} className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800/60 px-3 py-1.5 rounded-lg transition-colors flex items-center shadow-sm">
                  <Plus className="w-4 h-4 mr-1" /> <span className="text-xs font-bold">Nuevo</span>
                </button>
              </div>
              
              <div className="mb-4 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input 
                  type="text" 
                  value={buscarServicio} 
                  onChange={e => { setBuscarServicio(e.target.value); setServiciosPage(1); }} 
                  placeholder="Buscar servicio..." 
                  className="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl leading-5 bg-white dark:bg-gray-800 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-shadow shadow-sm text-gray-900 dark:text-gray-100" 
                />
              </div>

              {serviciosFiltrados.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">No hay servicios que coincidan con la búsqueda.</p>
              ) : (
                <div className="flex flex-col space-y-3">
                  {serviciosFiltrados.slice((serviciosPage - 1) * 10, serviciosPage * 10).map(s => {
                    const jefes = s.Usuarios || [];
                    return (
                      <div key={s.Id} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center flex-wrap gap-2 mb-2">
                            <span className="font-extrabold text-gray-900 dark:text-gray-100 text-base">{s.Nombre}</span>
                            <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 text-xs px-2.5 py-0.5 rounded-full font-semibold">
                              {s._count?.Personal || 0} Agentes
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${s.VoucherIndividual ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300'}`}>
                              Voucher {s.VoucherIndividual ? 'Individual' : 'Consolidado'}
                            </span>
                          </div>

                          <div className="mt-2 space-y-1.5">
                            <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center mb-1">
                              <User className="w-3.5 h-3.5 mr-1 text-indigo-500" /> Jefes de Servicio:
                            </div>
                            {jefes.length > 0 ? (
                              <div className="flex flex-col space-y-1.5">
                                {jefes.map((u: any) => {
                                  const displayName = u.NombreCompleto || u.NombreUsuario;
                                  return (
                                    <div 
                                      key={u.Id} 
                                      className={`flex items-center justify-between bg-gray-50 dark:bg-gray-800/80 px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-700/60 ${!u.Activo ? 'opacity-60 bg-red-50/40 dark:bg-red-950/20' : ''}`}
                                    >
                                      <div className="flex items-center space-x-2">
                                        <span className={`text-sm font-semibold ${!u.Activo ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
                                          {displayName}
                                        </span>
                                        {u.NombreCompleto && (
                                          <span className="text-xs text-gray-400 dark:text-gray-500">
                                            ({u.NombreUsuario})
                                          </span>
                                        )}
                                        {!u.Activo && (
                                          <span className="text-[10px] bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded font-bold">
                                            Inhabilitado
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center space-x-1">
                                        <button
                                          onClick={() => resetJefePassword(u.Id, displayName)}
                                          className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded transition-colors"
                                          title="Resetear Contraseña a '123456'"
                                        >
                                          <Lock className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => toggleJefeStatus(u.Id, displayName, u.Activo)}
                                          className={`p-1 rounded transition-colors ${
                                            u.Activo
                                              ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                                              : 'text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40'
                                          }`}
                                          title={u.Activo ? 'Inhabilitar usuario' : 'Habilitar usuario'}
                                        >
                                          {u.Activo ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                                        </button>
                                        <button
                                          onClick={() => deleteJefe(u.Id, displayName)}
                                          className="p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 rounded transition-colors"
                                          title="Eliminar usuario"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 dark:text-gray-500 italic bg-gray-50 dark:bg-gray-800/40 px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-800">
                                Sin Jefe de Servicio asignado
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col sm:items-end gap-2 shrink-0">
                          <button 
                            onClick={() => asignarJefeModal(s.Id, s.Nombre)} 
                            className="w-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center text-xs font-bold shadow-sm"
                            title="Asignar Jefe de Servicio"
                          >
                            <UserPlus className="w-4 h-4 mr-1.5" /> Asignar Jefe
                          </button>
                          <button
                            onClick={() => toggleVoucherIndividual(s.Id, s.Nombre)}
                            className={`w-full px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center text-xs font-bold shadow-sm border ${
                              s.VoucherIndividual 
                                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/30' 
                                : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30'
                            }`}
                            title={s.VoucherIndividual ? 'Cambiar a voucher consolidado para todo el servicio' : 'Cambiar a vouchers individuales por agente'}
                          >
                            Configurar Voucher
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {serviciosFiltrados.length > 10 && (
                    <div className="flex justify-between items-center mt-4">
                      <button onClick={() => setServiciosPage(p => Math.max(1, p - 1))} disabled={serviciosPage === 1} className="text-sm px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md disabled:opacity-50 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700">Anterior</button>
                      <span className="text-sm text-gray-500 font-medium">Página {serviciosPage} de {Math.ceil(serviciosFiltrados.length / 10)}</span>
                      <button onClick={() => setServiciosPage(p => Math.min(Math.ceil(serviciosFiltrados.length / 10), p + 1))} disabled={serviciosPage === Math.ceil(serviciosFiltrados.length / 10)} className="text-sm px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md disabled:opacity-50 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700">Siguiente</button>
                    </div>
                  )}
                </div>
              )}
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
            <div className="flex space-x-2">
              <button 
                onClick={() => handleImprimirVouchers('Almuerzo')} 
                className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-600 shadow-md transition-all flex items-center transform hover:scale-[1.02] active:scale-95"
              >
                <Printer className="w-4 h-4 mr-2" /> Vouchers Alm.
              </button>
              <button 
                onClick={() => handleImprimirVouchers('Cena')} 
                className="bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-600 shadow-md transition-all flex items-center transform hover:scale-[1.02] active:scale-95"
              >
                <Printer className="w-4 h-4 mr-2" /> Vouchers Cena
              </button>
            </div>
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
            <div className="flex flex-wrap gap-2 w-full lg:w-auto">
              <button onClick={generarReporte} className="flex-1 sm:flex-none flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg shadow-sm font-bold transition-colors">
                <Search className="w-4 h-4 mr-2" /> Buscar
              </button>
              <button onClick={handleImprimirCocina} disabled={reportes.length === 0} className={`flex-1 sm:flex-none flex items-center justify-center px-4 py-2.5 rounded-lg shadow-sm font-bold transition-colors ${reportes.length === 0 ? 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-700 text-white'}`} title="Imprimir reporte de producción para Cocina (totales por dieta)">
                <Printer className="w-4 h-4 mr-1.5" /> Cocina
              </button>
              <button onClick={handleImprimirEntrega} disabled={reportes.length === 0} className={`flex-1 sm:flex-none flex items-center justify-center px-4 py-2.5 rounded-lg shadow-sm font-bold transition-colors ${reportes.length === 0 ? 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`} title="Imprimir planilla de Entrega con espacio para firmas">
                <Printer className="w-4 h-4 mr-1.5" /> Entrega
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
                    const name = r.Personal ? `${r.Personal.NombreCompleto}`.toLowerCase() : `${r.EmergenciaNombreCompleto}`.toLowerCase();
                    const dni = r.Personal ? (r.Personal.DNI || "").toLowerCase() : (r.EmergenciaDNI || "").toLowerCase();
                    return name.includes(term) || dni.includes(term);
                  }).map((r) => (
                    <tr key={r.Id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">{r.FechaPedido.split('T')[0].split('-').reverse().join('/')}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{getServicioNombre(r)}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${r.TipoComida.toLowerCase() === 'almuerzo' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300'}`}>
                          {r.TipoComida}
                        </span>
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{r.TipoDieta}</span>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900 dark:text-gray-100">{r.Personal ? `${r.Personal.NombreCompleto}` : `${r.EmergenciaNombreCompleto}`}</td>
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
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Corte Pedidos Almuerzo</label>
                  <input type="time" value={configAlmuerzo} onChange={e => setConfigAlmuerzo(e.target.value)} className="w-full text-lg font-mono rounded-xl border-gray-300 dark:border-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500/50 px-4 py-3 border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Corte Pedidos Cena</label>
                  <input type="time" value={configCena} onChange={e => setConfigCena(e.target.value)} className="w-full text-lg font-mono rounded-xl border-gray-300 dark:border-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500/50 px-4 py-3 border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors" />
                </div>
              </div>

              <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center">
                  <Shield className="w-4 h-4 mr-2 text-orange-500" /> Horarios Límite para Autorización de Emergencias
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Define la hora máxima hasta la cual el Gerente puede aprobar solicitudes de emergencia. Debe ser estrictamente posterior a la hora de cierre de pedidos.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Límite Autorización Almuerzo</label>
                    <input type="time" value={configAuthAlmuerzo} onChange={e => setConfigAuthAlmuerzo(e.target.value)} className="w-full text-lg font-mono rounded-xl border-orange-300 dark:border-orange-700 shadow-sm focus:border-orange-500 focus:ring-orange-500/50 px-4 py-3 border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Límite Autorización Cena</label>
                    <input type="time" value={configAuthCena} onChange={e => setConfigAuthCena(e.target.value)} className="w-full text-lg font-mono rounded-xl border-orange-300 dark:border-orange-700 shadow-sm focus:border-orange-500 focus:ring-orange-500/50 px-4 py-3 border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors" />
                  </div>
                </div>
              </div>
              
              <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center">
                  <Utensils className="w-4 h-4 mr-2 text-indigo-500" /> Menús Habilitados en Planilla y Emergencias
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Selecciona qué dietas estarán disponibles como columnas en la planilla de personal y en los desplegables de emergencias.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {DIETAS_DISPONIBLES.map(dieta => {
                    const isChecked = dietasConfig.includes(dieta);
                    return (
                      <label key={dieta} className={`flex items-center p-3 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${isChecked ? 'bg-indigo-50 border-indigo-300 text-indigo-900 dark:bg-indigo-900/30 dark:border-indigo-700 dark:text-indigo-200' : 'bg-white border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'}`}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleDietaConfig(dieta)}
                          className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 mr-2"
                        />
                        {dieta}
                      </label>
                    );
                  })}
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
  const [buscarHospital, setBuscarHospital] = useState("");
  const [hospitalesPage, setHospitalesPage] = useState(1);
  const [gerenteUser, setGerenteUser] = useState("");
  const [gerentePass, setGerentePass] = useState("");
  const [gerenteHospitalId, setGerenteHospitalId] = useState("");
  const { theme } = useTheme();

  const hospitalesFiltrados = hospitales.filter((h: any) =>
    h.Nombre.toLowerCase().includes(buscarHospital.toLowerCase())
  );

  const [openServicios, setOpenServicios] = useState<{ [hospitalId: number]: boolean }>({});
  const toggleServicios = (id: number) => {
    setOpenServicios(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const [gerentes, setGerentes] = useState<any[]>([]);
  const [importando, setImportando] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  const [logsAuditoria, setLogsAuditoria] = useState<any[]>([]);
  const [cargandoAuditoria, setCargandoAuditoria] = useState(false);
  const [filtroAuditoria, setFiltroAuditoria] = useState("");

  // Estados para Reporte de Costos
  const [costosDesde, setCostosDesde] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  });
  const [costosHasta, setCostosHasta] = useState(getTodayStr());
  const [costosFiltroHospital, setCostosFiltroHospital] = useState("");
  const [costosFiltroDieta, setCostosFiltroDieta] = useState("Todas");
  const [costosPedidos, setCostosPedidos] = useState<any[]>([]);
  const [cargandoCostos, setCargandoCostos] = useState(false);
  const [valoresDieta, setValoresDieta] = useState<{ [dieta: string]: number }>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sisar_valores_dieta") || localStorage.getItem("sisac_valores_dieta");
      if (saved) {
        try { return JSON.parse(saved); } catch (e) {}
      }
    }
    return {
      "Normal": 2000,
      "Gastrica": 2200,
      "Diabetica": 2200,
      "Hepatico": 2200,
      "Vegetariano": 2000,
      "Celiaca": 2500
    };
  });

  const handleCambiarCostoDieta = (dieta: string, valor: number) => {
    setValoresDieta(prev => {
      const next = { ...prev, [dieta]: valor };
      if (typeof window !== "undefined") {
        localStorage.setItem("sisar_valores_dieta", JSON.stringify(next));
      }
      return next;
    });
  };

  const fetchCostosPedidos = async () => {
    setCargandoCostos(true);
    try {
      const res = await fetch(`${API_URL}/api/reports?fechaInicio=${costosDesde}&fechaFin=${costosHasta}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setCostosPedidos(await res.json());
      }
    } catch (e) {
      console.error("Error al obtener reporte de costos:", e);
    } finally {
      setCargandoCostos(false);
    }
  };

  useEffect(() => {
    if (activeTab === "ReporteCostos") {
      fetchCostosPedidos();
    }
  }, [costosDesde, costosHasta, activeTab]);

  const fetchHospitales = async () => {
    try {
      const res = await fetch(`${API_URL}/api/hospitals`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setHospitales(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchGerentes = async () => {
    try {
      const res = await fetch(`${API_URL}/api/users/gerentes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setGerentes(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAuditoria = async () => {
    setCargandoAuditoria(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/auditoria`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setLogsAuditoria(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setCargandoAuditoria(false);
    }
  };

  useEffect(() => {
    fetchHospitales();
    fetchGerentes();
    fetchAuditoria();
  }, []);

  const filteredAuditoria = logsAuditoria.filter((l: any) => {
    if (!filtroAuditoria) return true;
    const search = filtroAuditoria.toLowerCase();
    const accion = (l.Accion || "").toLowerCase();
    const usuario = (l.Usuario?.NombreUsuario || "").toLowerCase();
    const detalles = (l.Detalles || "").toLowerCase();
    const ip = (l.IpAddress || "").toLowerCase();
    return accion.includes(search) || usuario.includes(search) || detalles.includes(search) || ip.includes(search);
  });

  const formatIp = (ip?: string) => {
    if (!ip) return '-';
    if (ip === '::1' || ip === '::ffff:127.0.0.1') return '127.0.0.1';
    return ip;
  };

  const exportAuditoriaExcel = () => {
    if (filteredAuditoria.length === 0) return;
    const excelData = filteredAuditoria.map((l: any) => ({
      ID: l.Id,
      "Fecha y Hora": new Date(l.Fecha).toLocaleString('es-AR'),
      Acción: l.Accion,
      Usuario: l.Usuario ? l.Usuario.NombreUsuario : 'Sistema / Anon',
      Rol: l.Usuario?.Rol?.Nombre || '-',
      Detalles: l.Detalles || '',
      IP: formatIp(l.IpAddress)
    }));
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Auditoría");
    XLSX.writeFile(workbook, `Reporte_Auditoria_${getTodayStr()}.xlsx`);
  };

  const exportAuditoriaPDF = () => {
    if (filteredAuditoria.length === 0) return;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text("Reporte de Auditoría de Sistema", 14, 15);
    doc.setFontSize(9);
    doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, 14, 22);

    const tableRows = filteredAuditoria.map((l: any) => [
      new Date(l.Fecha).toLocaleString('es-AR'),
      l.Accion,
      l.Usuario ? `${l.Usuario.NombreUsuario} (${l.Usuario?.Rol?.Nombre || ''})` : 'Sistema',
      l.Detalles || '-',
      formatIp(l.IpAddress)
    ]);

    (doc as any).autoTable({
      head: [['Fecha / Hora', 'Acción', 'Usuario', 'Detalles', 'IP']],
      body: tableRows,
      startY: 26,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] }
    });

    doc.save(`Auditoria_${getTodayStr()}.pdf`);
  };

  // Cálculos para el reporte de costos
  const pedidosAprobadosFiltrados = costosPedidos.filter((p: any) => {
    if (p.Estado !== "Aprobado") return false;
    if (costosFiltroDieta !== "Todas" && p.TipoDieta !== costosFiltroDieta) return false;
    const pIdHospital = p.Personal?.HospitalId || p.SolicitadoPor?.HospitalId;
    if (costosFiltroHospital && pIdHospital !== Number(costosFiltroHospital)) return false;
    return true;
  });

  const resumenPorDieta = Object.keys(valoresDieta).map(dieta => {
    const cantidad = pedidosAprobadosFiltrados.filter((p: any) => p.TipoDieta === dieta).length;
    const costoUnitario = valoresDieta[dieta] || 0;
    const total = cantidad * costoUnitario;
    return {
      dieta,
      cantidad,
      costoUnitario,
      total
    };
  });

  const totalCantidadViandas = resumenPorDieta.reduce((sum, item) => sum + item.cantidad, 0);
  const totalCostoGeneral = resumenPorDieta.reduce((sum, item) => sum + item.total, 0);

  const desgloseEfectores = pedidosAprobadosFiltrados.reduce((acc: any, p: any) => {
    const hospNombre = p.Personal?.Hospital?.Nombre || p.SolicitadoPor?.Hospital?.Nombre || "Sin Sede / Hospital";
    const servNombre = p.Servicio?.Nombre || "Sin Servicio";
    const dieta = p.TipoDieta;
    const costo = valoresDieta[dieta] || 0;
    
    if (!acc[hospNombre]) {
      acc[hospNombre] = {
        nombre: hospNombre,
        servicios: {},
        totalViandas: 0,
        totalCosto: 0
      };
    }
    
    if (!acc[hospNombre].servicios[servNombre]) {
      acc[hospNombre].servicios[servNombre] = {
        nombre: servNombre,
        viandas: 0,
        costo: 0,
        dietas: {}
      };
    }
    
    acc[hospNombre].totalViandas += 1;
    acc[hospNombre].totalCosto += costo;
    
    acc[hospNombre].servicios[servNombre].viandas += 1;
    acc[hospNombre].servicios[servNombre].costo += costo;
    acc[hospNombre].servicios[servNombre].dietas[dieta] = (acc[hospNombre].servicios[servNombre].dietas[dieta] || 0) + 1;
    
    return acc;
  }, {});

  const exportarCostosExcel = () => {
    if (pedidosAprobadosFiltrados.length === 0) return;
    const dataResumen = resumenPorDieta.map(item => ({
      "Tipo de Dieta": item.dieta,
      "Cantidad de Viandas": item.cantidad,
      "Costo Unitario ($)": item.costoUnitario,
      "Costo Subtotal ($)": item.total
    }));
    dataResumen.push({
      "Tipo de Dieta": "TOTAL GENERAL",
      "Cantidad de Viandas": totalCantidadViandas,
      "Costo Unitario ($)": "",
      "Costo Subtotal ($)": totalCostoGeneral
    } as any);

    const dataDesglose: any[] = [];
    Object.values(desgloseEfectores).forEach((h: any) => {
      Object.values(h.servicios).forEach((s: any) => {
        dataDesglose.push({
          "Efector / Hospital": h.nombre,
          "Servicio": s.nombre,
          "Cantidad de Viandas": s.viandas,
          "Costo Estimado ($)": s.costo
        });
      });
      dataDesglose.push({
        "Efector / Hospital": `SUBTOTAL ${h.nombre.toUpperCase()}`,
        "Servicio": "",
        "Cantidad de Viandas": h.totalViandas,
        "Costo Estimado ($)": h.totalCosto
      });
    });
    
    const worksheetResumen = XLSX.utils.json_to_sheet(dataResumen);
    const worksheetDesglose = XLSX.utils.json_to_sheet(dataDesglose);
    const workbook = XLSX.utils.book_new();
    
    XLSX.utils.book_append_sheet(workbook, worksheetResumen, "Resumen General");
    XLSX.utils.book_append_sheet(workbook, worksheetDesglose, "Detalle por Sectores");
    XLSX.writeFile(workbook, `Reporte_Costos_Raciones_${costosDesde}_a_${costosHasta}.xlsx`);
  };

  const exportarCostosPDF = () => {
    if (pedidosAprobadosFiltrados.length === 0) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Reporte de Costos de Viandas - SisAR", 14, 15);
    doc.setFontSize(10);
    doc.text(`Período: ${costosDesde.split('-').reverse().join('/')} al ${costosHasta.split('-').reverse().join('/')}`, 14, 22);
    doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, 14, 28);
    
    doc.setFontSize(12);
    doc.text("Resumen General por Dieta", 14, 38);
    
    const rowsResumen = resumenPorDieta.map(item => [
      item.dieta,
      item.cantidad.toString(),
      `$${item.costoUnitario}`,
      `$${item.total}`
    ]);
    rowsResumen.push([
      "TOTAL GENERAL",
      totalCantidadViandas.toString(),
      "",
      `$${totalCostoGeneral}`
    ]);
    
    (doc as any).autoTable({
      head: [['Tipo de Dieta', 'Cantidad de Viandas', 'Costo Unitario', 'Subtotal']],
      body: rowsResumen,
      startY: 42,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] }
    });
    
    const currentY = (doc as any).lastAutoTable.finalY + 12;
    doc.text("Desglose de Costos por Hospital y Servicio", 14, currentY);
    
    const rowsDesglose: any[] = [];
    Object.values(desgloseEfectores).forEach((h: any) => {
      Object.values(h.servicios).forEach((s: any) => {
        rowsDesglose.push([
          h.nombre,
          s.nombre,
          s.viandas.toString(),
          `$${s.costo}`
        ]);
      });
      rowsDesglose.push([
        `SUBTOTAL ${h.nombre}`,
        "",
        h.totalViandas.toString(),
        `$${h.totalCosto}`
      ]);
    });
    
    (doc as any).autoTable({
      head: [['Efector / Sede', 'Servicio', 'Cantidad de Viandas', 'Costo Estimado']],
      body: rowsDesglose,
      startY: currentY + 4,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [79, 70, 229] },
      didParseCell: function(data: any) {
        if (data.row.raw[0].startsWith('SUBTOTAL')) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [243, 244, 246];
        }
      }
    });
    
    doc.save(`Reporte_Costos_Viandas_${costosDesde}_a_${costosHasta}.pdf`);
  };

  const crearHospital = async () => {
    if (!nuevoHospital) return;
    try {
      const res = await fetch(`${API_URL}/api/hospitals`, {
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

  const crearEfectorModal = async () => {
    const { value: nombreEfector } = await Swal.fire({
      title: 'Nuevo Efector (Sede/Hospital)',
      input: 'text',
      inputLabel: 'Nombre del Efector',
      inputPlaceholder: 'Ej. Hospital Padilla',
      showCancelButton: true,
      confirmButtonText: 'Crear',
      cancelButtonText: 'Cancelar',
      background: theme === 'dark' ? '#1f2937' : '#fff',
      color: theme === 'dark' ? '#fff' : '#000',
      inputValidator: (value) => {
        if (!value) return 'Debes escribir un nombre para el efector';
      }
    });

    if (nombreEfector) {
      try {
        const res = await fetch(`${API_URL}/api/hospitals`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ nombre: nombreEfector })
        });
        if (res.ok) {
          Swal.fire({ title: "Éxito", text: "Efector creado", icon: "success", timer: 1500, background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
          fetchHospitales();
        } else {
          const data = await res.json();
          Swal.fire({ title: "Error", text: data.error || "Error al crear", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        }
      } catch (e) {
        Swal.fire({ title: "Error", text: "Error de conexión", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    }
  };

  const asignarGerenteModal = async (hospitalId: number, hospitalNombre: string) => {
    const { value: formValues } = await Swal.fire({
      title: `Asignar Gerente a ${hospitalNombre}`,
      html:
        '<p style="font-size:13px; color:#6b7280; margin-bottom:12px;">Se creará la cuenta con la contraseña por defecto <strong>123456</strong>. El usuario deberá cambiarla obligatoriamente en su primer ingreso.</p>' +
        '<input id="swal-input-nombre" class="swal2-input" placeholder="Apellido/s, Nombres (Ej. Gómez, Ana)">' +
        '<input id="swal-input-user" class="swal2-input" placeholder="Nombre de usuario (Ej. agomez)">',
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Crear Cuenta',
      cancelButtonText: 'Cancelar',
      background: theme === 'dark' ? '#1f2937' : '#fff',
      color: theme === 'dark' ? '#fff' : '#000',
      preConfirm: () => {
        const nombreCompleto = (document.getElementById('swal-input-nombre') as HTMLInputElement).value;
        const username = (document.getElementById('swal-input-user') as HTMLInputElement).value;
        if (!nombreCompleto || !username) {
          Swal.showValidationMessage('El Apellido/s, Nombres y el Nombre de Usuario son obligatorios');
          return false;
        }
        return { nombreCompleto, username };
      }
    });

    if (formValues) {
      try {
        const res = await fetch(`${API_URL}/api/users/gerente`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ 
            username: formValues.username, 
            nombreCompleto: formValues.nombreCompleto, 
            hospitalId 
          })
        });
        if (res.ok) {
          Swal.fire({ title: "Éxito", text: "Gerente asignado exitosamente", icon: "success", timer: 1500, background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
          fetchHospitales();
          fetchGerentes();
        } else {
          const data = await res.json();
          Swal.fire({ title: "Error", text: data.error || "Error al asignar gerente", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        }
      } catch (e) {
        Swal.fire({ title: "Error", text: "Error de conexión", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    }
  };

  const crearGerente = async () => {
    if (!gerenteUser || !gerentePass || !gerenteHospitalId) return;
    try {
      const res = await fetch(`${API_URL}/api/users/gerente`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: gerenteUser, password: gerentePass, hospitalId: gerenteHospitalId, nombreCompleto: gerenteUser })
      });
      if (res.ok) {
        Swal.fire({ title: "Éxito", text: "Gerente creado exitosamente", icon: "success", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        setGerenteUser(""); setGerentePass(""); setGerenteHospitalId("");
        fetchHospitales();
        fetchGerentes();
      } else {
        const data = await res.json();
        Swal.fire({ title: "Error", text: data.error, icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    } catch (e) {
      Swal.fire({ title: "Error", text: "Error al crear gerente", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    }
  };

  const resetGerente = async (id: number, displayName?: string) => {
    try {
      const res = await fetch(`${API_URL}/api/users/${id}/reset-password`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        Swal.fire({ title: "Éxito", text: `Contraseña de ${displayName || 'Gerente'} reseteada a '123456'`, icon: "success", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        fetchHospitales();
        fetchGerentes();
      }
    } catch (e) {
      Swal.fire({ title: "Error", text: "No se pudo resetear la contraseña", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    }
  };

  const toggleGerente = async (id: number, displayName?: string, activo?: boolean) => {
    try {
      const res = await fetch(`${API_URL}/api/users/${id}/disable`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchGerentes();
        fetchHospitales();
        Swal.fire({ title: "Éxito", text: `Estado de ${displayName || 'Gerente'} actualizado`, icon: "success", timer: 1500, background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    } catch (e) {
      Swal.fire({ title: "Error", text: "No se pudo actualizar", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    }
  };

  const deleteGerente = async (id: number, displayName?: string) => {
    Swal.fire({
      title: '¿Eliminar usuario?',
      text: `¿Seguro que deseas eliminar el usuario de ${displayName || 'este gerente'}? Esta acción no se puede deshacer.`,
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
          const res = await fetch(`${API_URL}/api/users/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            fetchGerentes();
            fetchHospitales();
            Swal.fire({ title: "Éxito", text: "Usuario eliminado", icon: "success", timer: 1500, background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
          }
        } catch (e) {
          Swal.fire({ title: "Error", text: "No se pudo eliminar", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        }
      }
    });
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportando(true);
    setImportProgress(0);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const wsname = workbook.SheetNames[0];
        const ws = workbook.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) {
          Swal.fire('Error', 'El Excel está vacío', 'error');
          setImportando(false);
          return;
        }

        const CHUNK_SIZE = 500;
        let totalImported = 0;
        let hasError = false;
        
        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
          const chunk = data.slice(i, i + CHUNK_SIZE);
          const res = await fetch(`${API_URL}/api/personal/bulk`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ data: chunk })
          });
          
          if (res.ok) {
            const respData = await res.json();
            totalImported += respData.count;
            setImportProgress(Math.min(100, Math.round(((i + chunk.length) / data.length) * 100)));
          } else {
            const errData = await res.json();
            Swal.fire('Error', errData.error || 'Error al importar', 'error');
            hasError = true;
            break;
          }
        }

        if (!hasError) {
          Swal.fire('Éxito', `Se importaron/actualizaron ${totalImported} registros`, 'success');
          fetchHospitales(); // refrescar
        }
      } catch (err) {
        Swal.fire('Error', 'Error al procesar el archivo Excel', 'error');
      } finally {
        setImportando(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const tabs = [
    { id: "Hospitales", label: "Efectores", icon: <Building className="w-4 h-4 mr-2" /> },
    { id: "ReporteCostos", label: "Reporte de Costos", icon: <FileText className="w-4 h-4 mr-2" /> },
    { id: "Importacion", label: "Importar Personal", icon: <Upload className="w-4 h-4 mr-2" /> },
    { id: "Auditoria", label: "Auditoría", icon: <Shield className="w-4 h-4 mr-2" /> }
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 gap-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
            <Building className="w-5 h-5 mr-2 text-indigo-500" /> Red de Efectores Activos
          </h2>
          <button onClick={crearEfectorModal} className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800/60 px-3.5 py-2 rounded-xl transition-all flex items-center justify-center shadow-sm font-bold text-sm">
            <Plus className="w-4.5 h-4.5 mr-1.5" /> Nuevo Efector
          </button>
        </div>
        <div className="p-6">
          <div className="mb-6 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input 
              type="text" 
              value={buscarHospital} 
              onChange={e => { setBuscarHospital(e.target.value); setHospitalesPage(1); }} 
              placeholder="Buscar efector..." 
              className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl leading-5 bg-white dark:bg-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sm:text-sm transition-all text-gray-900 dark:text-gray-100" 
            />
          </div>

          {hospitalesFiltrados.length === 0 ? (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-8 text-center border border-gray-100 dark:border-gray-800">
              <Building className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No hay efectores registrados en el sistema o que coincidan con la búsqueda.</p>
            </div>
          ) : (
            <div className="flex flex-col space-y-6">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {hospitalesFiltrados.slice((hospitalesPage - 1) * 10, hospitalesPage * 10).map(h => (
                  <div key={h.Id} className="border border-gray-200 dark:border-gray-700 rounded-2xl p-6 bg-white dark:bg-gray-800/50 hover:shadow-md transition-shadow">
                    <h3 className="font-extrabold text-gray-900 dark:text-white text-xl flex items-center justify-between mb-4 pb-4 border-b border-gray-100 dark:border-gray-700">
                      <span className="flex items-center">
                        <div className="bg-indigo-100 dark:bg-indigo-900/50 p-2 rounded-lg mr-3">
                          <Building className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        {h.Nombre}
                      </span>
                    </h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div>
                        <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center">
                          <User className="w-3.5 h-3.5 mr-1.5 text-indigo-500" /> Gerentes:
                        </h4>
                        {h.Usuarios && h.Usuarios.length > 0 ? (
                          <div className="flex flex-col space-y-1.5">
                            {h.Usuarios.map((u: any) => {
                              const displayName = u.NombreCompleto || u.NombreUsuario;
                              return (
                                <div 
                                  key={u.Id} 
                                  className={`flex items-center justify-between bg-gray-50 dark:bg-gray-800/80 px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-700/60 ${!u.Activo ? 'opacity-60 bg-red-50/40 dark:bg-red-950/20' : ''}`}
                                >
                                  <div className="flex items-center space-x-2">
                                    <span className={`text-sm font-semibold ${!u.Activo ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
                                      {displayName}
                                    </span>
                                    {u.NombreCompleto && (
                                      <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                                        ({u.NombreUsuario})
                                      </span>
                                    )}
                                    {!u.Activo && (
                                      <span className="text-[10px] bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded font-bold">
                                        Inhabilitado
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center space-x-1">
                                    <button
                                      onClick={() => resetGerente(u.Id, displayName)}
                                      className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded transition-colors"
                                      title="Resetear Contraseña a '123456'"
                                    >
                                      <Lock className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => toggleGerente(u.Id, displayName, u.Activo)}
                                      className={`p-1 rounded transition-colors ${
                                        u.Activo
                                          ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                                          : 'text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40'
                                      }`}
                                      title={u.Activo ? 'Inhabilitar usuario' : 'Habilitar usuario'}
                                    >
                                      {u.Activo ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                                    </button>
                                    <button
                                      onClick={() => deleteGerente(u.Id, displayName)}
                                      className="p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 rounded transition-colors"
                                      title="Eliminar usuario"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 dark:text-gray-500 italic bg-gray-50 dark:bg-gray-800/40 px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-800">
                            Sin Gerente asignado
                          </p>
                        )}
                      </div>
                      
                      <div className="flex flex-col gap-3">
                        <button 
                          type="button"
                          onClick={() => asignarGerenteModal(h.Id, h.Nombre)} 
                          className="w-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-3.5 py-2.5 rounded-xl transition-all flex items-center justify-center text-xs font-bold shadow-sm"
                          title="Asignar Gerente al Efector"
                        >
                          <UserPlus className="w-4 h-4 mr-1.5" /> Asignar Gerente
                        </button>

                        <button 
                          type="button"
                          onClick={() => toggleServicios(h.Id)}
                          className="w-full flex items-center justify-between text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700/60 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 transition-colors"
                        >
                          <span className="flex items-center">
                            <Utensils className="w-3.5 h-3.5 mr-1.5 text-indigo-500" />
                            Servicios ({h.Servicios?.length || 0})
                          </span>
                          {openServicios[h.Id] ? (
                            <ChevronUp className="w-4 h-4 text-gray-500" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                          )}
                        </button>

                        {openServicios[h.Id] && (
                          <div className="p-3 bg-gray-50/50 dark:bg-gray-800/30 rounded-xl border border-gray-100 dark:border-gray-800 flex flex-wrap gap-2 max-h-40 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200">
                            {h.Servicios && h.Servicios.length > 0 ? (
                              h.Servicios.map((s: any) => (
                                <span key={s.Id} className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                                  {s.Nombre}
                                </span>
                              ))
                            ) : (
                              <p className="text-sm text-gray-500 dark:text-gray-500 italic p-1">Sin servicios creados</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {hospitalesFiltrados.length > 10 && (
                <div className="flex justify-between items-center mt-6">
                  <button onClick={() => setHospitalesPage(p => Math.max(1, p - 1))} disabled={hospitalesPage === 1} className="text-sm px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md disabled:opacity-50 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700">Anterior</button>
                  <span className="text-sm text-gray-500 font-medium">Página {hospitalesPage} de {Math.ceil(hospitalesFiltrados.length / 10)}</span>
                  <button onClick={() => setHospitalesPage(p => Math.min(Math.ceil(hospitalesFiltrados.length / 10), p + 1))} disabled={hospitalesPage === Math.ceil(hospitalesFiltrados.length / 10)} className="text-sm px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md disabled:opacity-50 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700">Siguiente</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </>
      )}
      {/* SECCION: REPORTE DE COSTOS */}
      {activeTab === "ReporteCostos" && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden transition-colors animate-in fade-in zoom-in-95 duration-300">
          <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
                <FileText className="w-5 h-5 mr-2 text-indigo-500" /> Reporte Financiero de Comidas
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Cálculo estimado de costos de viandas para la toma de decisiones directivas.</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={exportarCostosExcel} 
                disabled={pedidosAprobadosFiltrados.length === 0} 
                className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-md transition-all transform hover:scale-[1.02] active:scale-95 flex items-center disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Download className="w-4 h-4 mr-2" /> Excel
              </button>
              <button 
                onClick={exportarCostosPDF} 
                disabled={pedidosAprobadosFiltrados.length === 0} 
                className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-md transition-all transform hover:scale-[1.02] active:scale-95 flex items-center disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Download className="w-4 h-4 mr-2" /> PDF
              </button>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* FILTROS Y TARIFAS */}
              <div className="space-y-6">
                {/* FILTROS */}
                <div className="bg-gray-50/50 dark:bg-gray-800/30 p-5 rounded-2xl border border-gray-150 dark:border-gray-800 space-y-4">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider flex items-center">
                    <Search className="w-4 h-4 mr-2 text-indigo-500" /> Filtros del Reporte
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Fecha Desde</label>
                      <input 
                        type="date" 
                        value={costosDesde} 
                        onChange={e => setCostosDesde(e.target.value)} 
                        className="w-full text-sm rounded-lg border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500/50 px-3 py-2 border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Fecha Hasta</label>
                      <input 
                        type="date" 
                        value={costosHasta} 
                        onChange={e => setCostosHasta(e.target.value)} 
                        className="w-full text-sm rounded-lg border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500/50 px-3 py-2 border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Efector / Hospital</label>
                      <select 
                        value={costosFiltroHospital} 
                        onChange={e => setCostosFiltroHospital(e.target.value)} 
                        className="w-full text-sm rounded-lg border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500/50 px-3 py-2 border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors"
                      >
                        <option value="">Todos los Efectores</option>
                        {hospitales.map(h => <option key={h.Id} value={h.Id}>{h.Nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Tipo de Dieta</label>
                      <select 
                        value={costosFiltroDieta} 
                        onChange={e => setCostosFiltroDieta(e.target.value)} 
                        className="w-full text-sm rounded-lg border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500/50 px-3 py-2 border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors"
                      >
                        <option value="Todas">Todas las dietas</option>
                        {Object.keys(valoresDieta).map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* TARIFAS CONFIGURABLES */}
                <div className="bg-gray-50/50 dark:bg-gray-800/30 p-5 rounded-2xl border border-gray-150 dark:border-gray-800 space-y-4">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider flex items-center">
                    <Settings className="w-4 h-4 mr-2 text-indigo-500" /> Tarifas de Dietas
                  </h3>
                  <div className="grid grid-cols-1 gap-2.5">
                    {Object.keys(valoresDieta).map(dieta => (
                      <div key={dieta} className="flex justify-between items-center bg-white dark:bg-gray-900 px-3 py-2 rounded-xl border border-gray-100 dark:border-gray-850 shadow-sm">
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{dieta}</span>
                        <div className="flex items-center space-x-1">
                          <span className="text-xs text-gray-400 font-bold">$</span>
                          <input 
                            type="number" 
                            value={valoresDieta[dieta]} 
                            onChange={e => handleCambiarCostoDieta(dieta, Number(e.target.value))} 
                            className="w-20 text-xs font-mono font-bold text-right rounded-lg border-gray-300 dark:border-gray-700 py-1 px-1.5 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" 
                            min="0"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* RESULTADOS */}
              <div className="lg:col-span-2 space-y-6">
                {cargandoCostos ? (
                  <div className="bg-gray-50 dark:bg-gray-800/20 rounded-2xl p-16 text-center border border-gray-100 dark:border-gray-800 flex flex-col items-center justify-center">
                    <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 font-bold">Generando reporte de costos...</p>
                  </div>
                ) : pedidosAprobadosFiltrados.length === 0 ? (
                  <div className="bg-gray-50 dark:bg-gray-800/20 rounded-2xl p-16 text-center border border-gray-100 dark:border-gray-800">
                    <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 font-bold">No hay pedidos de comidas aprobados para el período o filtros seleccionados.</p>
                  </div>
                ) : (
                  <>
                    {/* KPIS */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 dark:from-blue-500/5 dark:to-indigo-500/5 p-5 rounded-2xl border border-blue-100 dark:border-blue-900/30 flex flex-col justify-between">
                        <span className="text-[10px] uppercase font-extrabold text-blue-700 dark:text-blue-400 tracking-wider">Total Viandas</span>
                        <h3 className="text-3xl font-extrabold text-gray-900 dark:text-white mt-1">{totalCantidadViandas}</h3>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Pedidos Aprobados</p>
                      </div>
                      <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 dark:from-indigo-500/5 dark:to-purple-500/5 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 flex flex-col justify-between">
                        <span className="text-[10px] uppercase font-extrabold text-indigo-700 dark:text-indigo-400 tracking-wider">Costo Promedio</span>
                        <h3 className="text-3xl font-extrabold text-gray-900 dark:text-white mt-1">
                          ${(totalCantidadViandas > 0 ? Math.round(totalCostoGeneral / totalCantidadViandas) : 0).toLocaleString('es-AR')}
                        </h3>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Por vianda aprobada</p>
                      </div>
                      <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 dark:from-emerald-500/5 dark:to-teal-500/5 p-5 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 flex flex-col justify-between">
                        <span className="text-[10px] uppercase font-extrabold text-emerald-700 dark:text-emerald-400 tracking-wider">Monto Total a Pagar</span>
                        <h3 className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                          ${totalCostoGeneral.toLocaleString('es-AR')}
                        </h3>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Estimación acumulada</p>
                      </div>
                    </div>

                    {/* RESUMEN POR DIETA */}
                    <div className="bg-white dark:bg-gray-955 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-3.5 shadow-sm">
                      <h3 className="text-sm font-extrabold text-gray-900 dark:text-white flex items-center">
                        <FileText className="w-4.5 h-4.5 mr-2 text-indigo-500" /> Resumen Consolidado por Dieta
                      </h3>
                      <div className="overflow-x-auto border border-gray-150 dark:border-gray-800 rounded-xl">
                        <table className="min-w-full divide-y divide-gray-250 dark:divide-gray-800">
                          <thead className="bg-gray-50 dark:bg-gray-900/50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-white uppercase tracking-wider">Dieta</th>
                              <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-white uppercase tracking-wider">Viandas</th>
                              <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-white uppercase tracking-wider">Costo Unitario</th>
                              <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-white uppercase tracking-wider">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white dark:bg-gray-950 divide-y divide-gray-100 dark:divide-gray-850">
                            {resumenPorDieta.map(item => (
                              <tr key={item.dieta} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/30 transition-colors">
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-gray-100">{item.dieta}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-center font-bold text-gray-600 dark:text-gray-400">{item.cantidad}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-mono text-gray-500 dark:text-gray-400">${item.costoUnitario}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-extrabold font-mono text-gray-950 dark:text-white">${item.total.toLocaleString('es-AR')}</td>
                              </tr>
                            ))}
                            <tr className="bg-gray-50/80 dark:bg-gray-900/30 font-bold border-t border-gray-200 dark:border-gray-800">
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">TOTAL GENERAL</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900 dark:text-gray-100 font-extrabold">{totalCantidadViandas}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-right"></td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-indigo-600 dark:text-indigo-400 font-extrabold font-mono">${totalCostoGeneral.toLocaleString('es-AR')}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* DESGLOSE POR HOSPITAL Y SERVICIO */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-extrabold text-gray-900 dark:text-white flex items-center">
                        <Building className="w-4.5 h-4.5 mr-2 text-indigo-500" /> Desglose por Efector y Servicio
                      </h3>
                      <div className="space-y-4">
                        {Object.values(desgloseEfectores).map((h: any) => (
                          <div key={h.nombre} className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-955 shadow-sm transition-all">
                            <div className="bg-gray-50/80 dark:bg-gray-900/40 px-5 py-3.5 flex justify-between items-center border-b border-gray-200 dark:border-gray-800 flex-wrap gap-2">
                              <span className="font-extrabold text-sm text-gray-900 dark:text-gray-100 uppercase tracking-wide flex items-center">
                                <Building className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400 animate-pulse" /> {h.nombre}
                              </span>
                              <div className="flex items-center space-x-4 text-xs">
                                <span className="text-gray-500 dark:text-gray-400 font-semibold">Viandas: <strong className="text-gray-800 dark:text-gray-200 font-bold">{h.totalViandas}</strong></span>
                                <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">Subtotal: ${h.totalCosto.toLocaleString('es-AR')}</span>
                              </div>
                            </div>
                            <div className="p-4 bg-white dark:bg-gray-950">
                              <div className="overflow-x-auto rounded-xl border border-gray-150 dark:border-gray-800">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                                  <thead className="bg-gray-50/50 dark:bg-gray-900/20">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 dark:text-white uppercase">Servicio</th>
                                      <th className="px-4 py-2 text-center text-xs font-bold text-gray-500 dark:text-white uppercase">Cantidad Viandas</th>
                                      <th className="px-4 py-2 text-right text-xs font-bold text-gray-500 dark:text-white uppercase">Costo Estimado</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-150 dark:divide-gray-800 text-xs">
                                    {Object.values(h.servicios).map((s: any) => (
                                      <tr key={s.nombre} className="hover:bg-gray-50/20 dark:hover:bg-gray-900/10 transition-colors">
                                        <td className="px-4 py-2.5 font-bold text-gray-700 dark:text-gray-300">{s.nombre}</td>
                                        <td className="px-4 py-2.5 text-center font-bold text-gray-600 dark:text-gray-400">{s.viandas}</td>
                                        <td className="px-4 py-2.5 text-right font-bold font-mono text-gray-955 dark:text-white">${s.costo.toLocaleString('es-AR')}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "Importacion" && (
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
            <Upload className="w-5 h-5 mr-2 text-indigo-500" /> Importación Masiva
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Cargar agentes (Personal) mediante un archivo Excel (.xlsx, .csv).</p>
        </div>
        <div className="p-8">
          <div className="w-full bg-gray-50 dark:bg-gray-800/30 p-8 rounded-2xl border border-gray-100 dark:border-gray-800 border-dashed text-center">
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Selecciona o arrastra el archivo Excel</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">El archivo debe contener las siguientes columnas exactas: <br/><code className="text-xs bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded">efector, servicio, idpuesto, idagente, documento, agente, tipofuncion, tipoplanta, con_vianda, esguardia12, esguardia24</code></p>
            <div className="flex justify-center">
              <label className={`cursor-pointer bg-indigo-600 dark:bg-indigo-500 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-md transition-all transform hover:scale-[1.02] active:scale-95 ${importando ? 'opacity-50 pointer-events-none' : 'hover:bg-indigo-700 dark:hover:bg-indigo-600'}`}>
                {importando ? 'Importando...' : 'Examinar archivo'}
                <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleImportExcel} disabled={importando} />
              </label>
            </div>
            {importando && (
              <div className="mt-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex justify-between text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  <span>Progreso de importación</span>
                  <span>{importProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden shadow-inner">
                  <div 
                    className="bg-indigo-600 dark:bg-indigo-500 h-3 rounded-full transition-all duration-300 ease-out relative overflow-hidden" 
                    style={{ width: `${importProgress}%` }}
                  >
                    <div className="absolute top-0 left-0 bottom-0 right-0 bg-white/20 animate-pulse"></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* SECCION AUDITORIA */}
      {activeTab === "Auditoria" && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
          <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/50 dark:bg-gray-800/30">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
                <Shield className="w-5 h-5 mr-2 text-indigo-500" /> Registros de Auditoría
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Historial de acciones y eventos del sistema</p>
            </div>
            
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative w-full sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input 
                  type="text" 
                  value={filtroAuditoria} 
                  onChange={e => setFiltroAuditoria(e.target.value)} 
                  placeholder="Buscar acción, usuario, detalles..." 
                  className="block w-full pl-9 pr-3 py-2 text-sm border-gray-300 dark:border-gray-700 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500/50 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" 
                />
              </div>

              <button 
                onClick={fetchAuditoria} 
                className="p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl text-gray-700 dark:text-gray-300 font-bold transition-colors"
                title="Actualizar auditoría"
              >
                <RefreshCw className={`w-4 h-4 ${cargandoAuditoria ? 'animate-spin' : ''}`} />
              </button>

              <button 
                onClick={exportAuditoriaExcel} 
                disabled={filteredAuditoria.length === 0} 
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                  filteredAuditoria.length === 0 
                    ? 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed' 
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                EXCEL
              </button>

              <button 
                onClick={exportAuditoriaPDF} 
                disabled={filteredAuditoria.length === 0} 
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                  filteredAuditoria.length === 0 
                    ? 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed' 
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                PDF
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {cargandoAuditoria ? (
              <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-500" />
                <p>Cargando registros de auditoría...</p>
              </div>
            ) : filteredAuditoria.length === 0 ? (
              <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                <Shield className="w-10 h-10 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                <p className="font-bold">No se encontraron registros de auditoría.</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5 text-left">Fecha y Hora</th>
                    <th className="px-6 py-3.5 text-left">Acción</th>
                    <th className="px-6 py-3.5 text-left">Usuario</th>
                    <th className="px-6 py-3.5 text-left">Detalles</th>
                    <th className="px-6 py-3.5 text-left">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                  {filteredAuditoria.map((log: any) => (
                    <tr key={log.Id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600 dark:text-gray-300 font-medium">
                        {new Date(log.Fecha).toLocaleString('es-AR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                          log.Accion.includes('LOGIN') ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                          log.Accion.includes('BAJA') || log.Accion.includes('FALLIDO') ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' :
                          log.Accion.includes('ACTUALIZACION') || log.Accion.includes('REVERTIR') ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300' :
                          'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                        }`}>
                          {log.Accion}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900 dark:text-gray-100">
                        {log.Usuario ? `${log.Usuario.NombreUsuario}` : 'Sistema'}
                        {log.Usuario?.Rol && (
                          <span className="text-xs font-normal text-gray-500 ml-1">({log.Usuario.Rol.Nombre})</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-700 dark:text-gray-300 max-w-md truncate" title={log.Detalles || ''}>
                        {log.Detalles || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-gray-500 dark:text-gray-400">
                        {formatIp(log.IpAddress)}
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
