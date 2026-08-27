"use client";

const API_URL = "";

import { useState, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import Swal from 'sweetalert2';
import { 
  LogOut, Sun, Moon, AlertTriangle, FileText, Settings, 
  User, Printer, Check, X, Building, Download, Users, Lock, ChevronDown, ChevronUp, CheckCircle, Search, Save, Utensils, History, Upload, Plus, UserPlus, Trash2, Shield, RefreshCw, RotateCcw, PlusCircle, Zap, Eye, EyeOff, QrCode, Scan, Edit3, ArrowRightLeft
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

const formatIp = (ip?: string | null) => {
  if (!ip) return '-';
  if (ip === '::1' || ip === '127.0.0.1' || ip.includes('::ffff:127.0.0.1')) return 'Localhost';
  return ip.replace(/^::ffff:/, '');
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
    if (token && role !== "RRHH" && role !== "Admin" && hospitalName) {
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
  }, [token, role, hospitalName]);

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
            isPastAuthAlmuerzo={isPastAuthAlmuerzo}
            isPastAuthCena={isPastAuthCena}
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
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
                  type={showPassword ? "text" : "password"} 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-shadow" 
                  placeholder="••••••••"
                  required 
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors focus:outline-none cursor-pointer"
                  title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-md text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all transform hover:scale-[1.02] active:scale-95 cursor-pointer"
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
                  type={showNewPassword ? "text" : "password"} 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                  className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-shadow" 
                  placeholder="••••••••"
                  required 
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors focus:outline-none cursor-pointer"
                  title={showNewPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Confirmar Nueva Contraseña</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input 
                  type={showConfirmPassword ? "text" : "password"} 
                  value={confirmPassword} 
                  onChange={e => setConfirmPassword(e.target.value)} 
                  className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-shadow" 
                  placeholder="••••••••"
                  required 
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors focus:outline-none cursor-pointer"
                  title={showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
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
              const isLicencia = Boolean(item.bajaProvisoriaHoy || item.bajaDefinitivaHoy || item.BajaProvisoriaFecha || item.bajaMotivo || item.BajaMotivo);
              const motivoText = item.bajaMotivo || item.BajaMotivo || (item.bajaProvisoriaHoy ? "Licencia / Inhabilitado" : null);

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
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-sm text-gray-900 dark:text-gray-100">
                      {nombre}
                    </div>
                    {isLicencia && (
                      <span className="text-[10px] font-bold uppercase bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-700 shrink-0">
                        ⚠️ Licencia{motivoText ? `: ${motivoText}` : ''}
                      </span>
                    )}
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
  const [emgFecha, setEmgFecha] = useState<string>(getTodayStr());
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

  const [emgTipo, setEmgTipo] = useState((isPastAuthAlmuerzo && isPastAuthCena) ? "reemplazo_excepcional" : "reemplazo");

  useEffect(() => {
    if (emgFecha === getTodayStr()) {
      if (isPastAuthAlmuerzo && isPastAuthCena) {
        if (emgTipo !== 'reemplazo_excepcional') {
          setEmgTipo('reemplazo_excepcional');
          setEmgJustificacion("Reemplazo excepcional de última hora");
        }
      } else if (isPastAuthAlmuerzo && (emgComida === 'Almuerzo' || emgComida === 'Ambos')) {
        setEmgComida('Cena');
      }
    }
  }, [isPastAuthAlmuerzo, isPastAuthCena, emgFecha]);
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

  // Fecha de trabajo seleccionada en Planilla (Hoy o Fechas Anticipadas)
  const [fechaPlanilla, setFechaPlanilla] = useState<string>(getTodayStr());
  const [fechasAnticipadasActivas, setFechasAnticipadasActivas] = useState<any[]>([]);

  const fetchAdvanceDates = async () => {
    try {
      const res = await fetch(`${API_URL}/api/advance-dates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setFechasAnticipadasActivas(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStaff = async (targetFecha?: string) => {
    try {
      const fechaQuery = targetFecha || fechaPlanilla;
      const res = await fetch(`${API_URL}/api/staff/active?fecha=${fechaQuery}`, {
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
    fetchAdvanceDates();
    fetchHistorialEmergencias();
    fetchPadron();
    
    const today = getTodayStr();
    setRepDesde(today);
    setRepHasta(today);
  }, []);

  useEffect(() => {
    fetchStaff(fechaPlanilla);
    setSelections({});
    setSavedSelections({});
    loadOrdersForDate(fechaPlanilla);
    setEmgFecha(fechaPlanilla);
  }, [fechaPlanilla]);

  const [openGroup, setOpenGroup] = useState<"mi_servicio" | "otros">("mi_servicio");

  const miServicioNombre = servicioName || (padron.find(p => p.Servicio?.Nombre)?.Servicio?.Nombre) || "Mi Servicio";

  const filteredPadron = padron.filter(p => 
    p.NombreCompleto.toLowerCase().includes(padronSearchTerm.toLowerCase()) || 
    p.DNI.includes(padronSearchTerm)
  );

  const miServicioAgents = filteredPadron
    .filter(p => (p.Servicio?.Nombre || "").trim().toLowerCase() === miServicioNombre.trim().toLowerCase())
    .sort((a, b) => a.NombreCompleto.localeCompare(b.NombreCompleto));

  const otrosServiciosAgents = filteredPadron
    .filter(p => (p.Servicio?.Nombre || "").trim().toLowerCase() !== miServicioNombre.trim().toLowerCase())
    .sort((a, b) => a.NombreCompleto.localeCompare(b.NombreCompleto));

  const toggleGroup = (group: "mi_servicio" | "otros") => {
    setOpenGroup(prev => prev === group ? (group === "mi_servicio" ? "otros" : "mi_servicio") : group);
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
    try {
      const res = await fetch(`${API_URL}/api/staff/plantel`, {
         method: "POST",
         headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
         body: JSON.stringify({ plantel: plantelDraft })
      });
      if (!res.ok) {
         const data = await res.json();
         Swal.fire({ title: "Error", text: data.error || "No se pudo guardar el plantel", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
         fetchStaff();
         return;
      }

      Swal.fire({ title: "Éxito", text: "Plantel guardado correctamente", icon: "success", timer: 1500, background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      fetchStaff();
    } catch (e) {
      Swal.fire({ title: "Error", text: "Error de conexión al actualizar", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    }
  };



  const [selections, setSelections] = useState<{ [id: number]: { almuerzo: string | null, cena: string | null } }>({});
  const [savedSelections, setSavedSelections] = useState<{ [id: number]: { almuerzo: string | null, cena: string | null } }>({});

  const loadOrdersForDate = (targetFecha?: string) => {
    const fechaToLoad = targetFecha || fechaPlanilla;
    fetch(`${API_URL}/api/reports?fechaInicio=${fechaToLoad}&fechaFin=${fechaToLoad}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(r => {
      if (r.status === 401) {
        localStorage.clear();
        window.location.reload();
        return [];
      }
      return r.json();
    })
    .then(data => {
      if (!Array.isArray(data)) return;
      const newSelections: { [id: number]: { almuerzo: string | null, cena: string | null } } = {};
      data.forEach((r: any) => {
        const pId = r.PersonalId || (r.Personal ? r.Personal.Id : null) || (r.EmergenciaReemplazaId ? Number(r.EmergenciaReemplazaId) : null);
        const pDni = r.EmergenciaDNI || (r.Personal ? r.Personal.DNI : null);
        
        let matchedAgentId = pId;
        if (!matchedAgentId && pDni) {
          const found = staff.find((s: any) => s.DNI === pDni);
          if (found) matchedAgentId = found.Id;
        }

        if (matchedAgentId) {
          if (!newSelections[matchedAgentId]) {
            newSelections[matchedAgentId] = { almuerzo: null, cena: null };
          }
          if (r.TipoComida.toLowerCase() === 'almuerzo') {
            newSelections[matchedAgentId].almuerzo = r.TipoDieta;
          } else if (r.TipoComida.toLowerCase() === 'cena') {
            newSelections[matchedAgentId].cena = r.TipoDieta;
          }
        }
      });
      setSelections(newSelections);
      setSavedSelections(JSON.parse(JSON.stringify(newSelections)));
    })
    .catch(console.error);
  };

  useEffect(() => {
    const handleFocus = () => {
      loadOrdersForDate(fechaPlanilla);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [token, fechaPlanilla]);

  const toggleSelection = (personalId: number, tipoComida: "almuerzo" | "cena", tipoDieta: string) => {
    const isDeadline = fechaPlanilla === getTodayStr() ? (tipoComida === "almuerzo" ? isPastAlmuerzo : isPastCena) : false;
    if (isDeadline) return;

    const p = staff.find(s => s.Id === personalId);
    const is1Racion = p ? (getRacionLabel(p.Horario) === "Almuerzo o Cena") : false;

    const current = selections[personalId] || { almuerzo: null, cena: null };
    const isSame = current[tipoComida] === tipoDieta;
    const isSelecting = !isSame;

    if (is1Racion && isSelecting) {
      const otherMeal = tipoComida === "almuerzo" ? "cena" : "almuerzo";
      const otherDeadline = fechaPlanilla === getTodayStr() ? (otherMeal === "almuerzo" ? isPastAlmuerzo : isPastCena) : false;
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
          tipoComida: planillaTab === "almuerzo" ? "Almuerzo" : "Cena",
          fecha: fechaPlanilla
        })
      });
      if (res.ok) {
        Swal.fire({ title: "Guardado", text: "Todos los pedidos se guardaron exitosamente.", icon: "success", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        loadOrdersForDate(fechaPlanilla);
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
      const todayStr = getTodayStr();

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
          fecha: emgFecha || todayStr,
          periodoInicio: emgFecha || todayStr,
          periodoFin: emgFecha || todayStr,
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
            <select id="swal-motivo" class="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white p-2 rounded shadow-sm" style="background-color: ${theme === 'dark' ? '#1f2937' : '#ffffff'}; color: ${theme === 'dark' ? '#ffffff' : '#111827'};">
              <option value="Licencia" style="background-color: ${theme === 'dark' ? '#1f2937' : '#ffffff'}; color: ${theme === 'dark' ? '#ffffff' : '#111827'};">Licencia</option>
              <option value="Enfermedad" style="background-color: ${theme === 'dark' ? '#1f2937' : '#ffffff'}; color: ${theme === 'dark' ? '#ffffff' : '#111827'};">Enfermedad</option>
              <option value="Maternidad" style="background-color: ${theme === 'dark' ? '#1f2937' : '#ffffff'}; color: ${theme === 'dark' ? '#ffffff' : '#111827'};">Maternidad</option>
              <option value="Enfermedad Familiar" style="background-color: ${theme === 'dark' ? '#1f2937' : '#ffffff'}; color: ${theme === 'dark' ? '#ffffff' : '#111827'};">Enfermedad Familiar</option>
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

  const getServicioNombre = (r: any) => {
    if (r.Servicio?.Nombre) return r.Servicio.Nombre;
    if (r.Personal?.Servicio?.Nombre) return r.Personal.Servicio.Nombre;
    if (r.PersonalReemplazado?.Servicio?.Nombre) return r.PersonalReemplazado.Servicio.Nombre;
    if (r.SolicitadoPor?.Servicio?.Nombre) return r.SolicitadoPor.Servicio.Nombre;
    return servicioName || "Servicio";
  };

  const esServicioIndividual = (r: any) => {
    if (r.Servicio && typeof r.Servicio.VoucherIndividual === 'boolean') return r.Servicio.VoucherIndividual;
    if (r.Personal?.Servicio && typeof r.Personal.Servicio.VoucherIndividual === 'boolean') return r.Personal.Servicio.VoucherIndividual;
    if (r.PersonalReemplazado?.Servicio && typeof r.PersonalReemplazado.Servicio.VoucherIndividual === 'boolean') return r.PersonalReemplazado.Servicio.VoucherIndividual;
    if (r.SolicitadoPor?.Servicio && typeof r.SolicitadoPor.Servicio.VoucherIndividual === 'boolean') return r.SolicitadoPor.Servicio.VoucherIndividual;
    return false;
  };

  const handleImprimirVouchers = (tipo: 'Almuerzo' | 'Cena') => {
    const isPastAuth = tipo === 'Almuerzo' ? isPastAuthAlmuerzo : isPastAuthCena;
    if (!isPastAuth) {
      Swal.fire({
        title: "Horario de Autorización Pendiente",
        text: `Los Vouchers de ${tipo} solo pueden ser impresos por el Jefe de Servicio una vez finalizado el horario límite de autorización (${tipo === 'Almuerzo' ? (limiteAuthAlmuerzo || '11:00') : (limiteAuthCena || '18:00')} hs).`,
        icon: "warning",
        background: theme === 'dark' ? '#1f2937' : '#fff',
        color: theme === 'dark' ? '#fff' : '#000'
      });
      return;
    }

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
      Swal.fire({ title: "Aviso", text: `No hay reportes aprobados de ${tipo} que coincidan con el filtro.`, icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }

    const porServicio: Record<string, any[]> = {};
    filtered.forEach(r => {
      const sName = getServicioNombre(r);
      if (!porServicio[sName]) porServicio[sName] = [];
      porServicio[sName].push(r);
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
    const usuarioImpresion = servicioName || 'Jefe de Servicio';

    let vouchersHTML = '';

    serviciosKeys.forEach((servicio, sIdx) => {
      const reportesServicio = porServicio[servicio];
      const esUltimoServicio = sIdx === serviciosKeys.length - 1;

      const individuales = reportesServicio.filter(r => esServicioIndividual(r));
      const consolidados = reportesServicio.filter(r => !esServicioIndividual(r));

      vouchersHTML += `<div class="servicio-group ${esUltimoServicio ? '' : 'page-break'}">`;

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
               Impreso el ${fechaImpresion} a las ${horaImpresion} hs | Servicio: ${usuarioImpresion}
            </div>
          </div>
          <div class="cut-line"></div>
        `;
      }

      individuales.forEach((p, idx) => {
        const date = p.FechaPedido.split('T')[0].split('-').reverse().join('/');
        const nombreAgente = p.Personal ? `${p.Personal.NombreCompleto}` : `${p.EmergenciaNombreCompleto}`;
        const dniAgente = p.Personal ? (p.Personal.DNI || "-") : (p.EmergenciaDNI || "-");
        const qrData = encodeURIComponent(`${nombreAgente}-${dniAgente}-${servicio}-${tipo}-${p.TipoDieta}-${date}`);
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${qrData}`;

        vouchersHTML += `
          <div class="voucher">
            <div class="watermark">SisAR ORIGINAL - SisAR ORIGINAL</div>
            <div class="v-header">
               <div class="v-logo">
                  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
                    <defs>
                      <linearGradient id="bg-ind-${sIdx}-${idx}" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#3b82f6" />
                        <stop offset="100%" stop-color="#4f46e5" />
                      </linearGradient>
                    </defs>
                    <rect width="64" height="64" rx="16" fill="url(#bg-ind-${sIdx}-${idx})" />
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
                  <div class="v-row" style="margin-top: 6px; font-size: 14px;">
                     AGENTE: <strong>${nombreAgente}</strong> (DNI: ${dniAgente})
                  </div>
                  <div class="v-row" style="margin-top: 4px; font-size: 13px; color: #4f46e5;">
                     DIETA: <strong>${p.TipoDieta}</strong>
                  </div>
               </div>
               <div class="v-qr"><img src="${qrUrl}" alt="QR Code" /></div>
            </div>
            <div class="v-footer">
               Impreso el ${fechaImpresion} a las ${horaImpresion} hs | Servicio: ${usuarioImpresion}
            </div>
          </div>
          <div class="cut-line"></div>
        `;
      });

      vouchersHTML += `</div>`;
    });

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Vouchers de Comida - ${tipo}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #fff; color: #000; }
            .voucher { border: 2px stroke #000; border-style: dashed; padding: 15px; margin-bottom: 20px; border-radius: 8px; position: relative; background: #fff; overflow: hidden; page-break-inside: avoid; }
            .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 26px; font-weight: 900; color: rgba(0, 0, 0, 0.04); white-space: nowrap; pointer-events: none; text-transform: uppercase; letter-spacing: 2px; }
            .v-header { display: flex; align-items: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
            .v-logo { margin-right: 12px; }
            .v-title-main { font-size: 18px; font-weight: 800; letter-spacing: 0.5px; }
            .v-title-sub { font-size: 11px; color: #444; }
            .v-body { display: flex; justify-content: space-between; align-items: center; }
            .v-info { flex: 1; font-size: 12px; line-height: 1.5; }
            .v-row { margin-bottom: 4px; }
            .space-between { display: flex; justify-content: space-between; padding-right: 15px; }
            .v-total { font-size: 16px; font-weight: bold; margin-top: 6px; color: #1e40af; }
            .v-diets { font-size: 11px; color: #333; margin-top: 4px; }
            .v-qr img { width: 90px; height: 90px; border: 1px solid #ccc; padding: 3px; background: #fff; }
            .v-footer { margin-top: 10px; border-top: 1px solid #ddd; padding-top: 4px; font-size: 9px; color: #666; text-align: right; }
            .cut-line { border-bottom: 1px dashed #999; margin: 15px 0 25px 0; relative; }
            .page-break { page-break-after: always; }
            @media print {
              body { padding: 0; }
              .voucher { border-color: #000; }
            }
          </style>
        </head>
        <body onload="setTimeout(() => { window.print(); window.close(); }, 600)">
          ${vouchersHTML}
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
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
        <div className={`rounded-2xl shadow-sm border overflow-hidden transition-all animate-in fade-in zoom-in-95 duration-300 p-1 ${
          fechaPlanilla !== getTodayStr() 
            ? 'bg-amber-50/80 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-600 shadow-xl' 
            : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'
        }`}>
        
        {/* BANNER DESTACADO PARA FECHA FUTURA / ANTICIPADA */}
        {fechaPlanilla !== getTodayStr() && (
          <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-6 py-3.5 rounded-xl shadow-md mb-2 flex items-center justify-between animate-in fade-in duration-200">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-white/20 rounded-lg shrink-0">
                <Zap className="w-6 h-6 text-yellow-200" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm uppercase tracking-wide flex items-center gap-2">
                  ⚡ MODO CARGA ANTICIPADA HABILITADA POR GERENCIA
                </h4>
                <p className="text-xs text-amber-100 mt-0.5">
                  Estás cargando la planilla para la fecha futura <span className="font-extrabold underline">{fechaPlanilla.split('-').reverse().join('/')}</span> ({fechasAnticipadasActivas.find(f=>f.FechaHabilitadaStr===fechaPlanilla)?.Descripcion || 'Fecha Futura Autorizada'}).
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-block text-[11px] font-extrabold bg-white/20 px-3 py-1 rounded-full uppercase border border-white/30 shrink-0">
              Carga Anticipada
            </span>
          </div>
        )}

        <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 rounded-t-xl">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
                <Users className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" /> Planilla de Personal
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Selecciona la dieta deseada para el personal activo.</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {/* SELECTOR DE FECHA DE TRABAJO */}
              <div className="flex items-center space-x-1.5 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 shadow-sm">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Fecha:</label>
                <select
                  value={fechaPlanilla}
                  onChange={e => setFechaPlanilla(e.target.value)}
                  className="text-xs font-bold bg-transparent border-none focus:outline-none text-gray-900 dark:text-gray-100 cursor-pointer"
                >
                  <option value={getTodayStr()} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">📍 Hoy ({getTodayStr().split('-').reverse().join('/')})</option>
                  {fechasAnticipadasActivas.map(f => (
                    <option key={f.Id} value={f.FechaHabilitadaStr} className="bg-amber-100 dark:bg-amber-900 text-amber-900 dark:text-amber-100 font-bold">
                      ⚡ {f.Descripcion || 'Carga Anticipada'} ({f.FechaHabilitadaStr.split('-').reverse().join('/')})
                    </option>
                  ))}
                </select>
              </div>

              <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs font-bold px-3 py-1.5 rounded-full border border-blue-200 dark:border-blue-800">
                Activos: {staff.length}
              </span>
              <button 
                onClick={handleGuardarPedidos} 
                disabled={(fechaPlanilla === getTodayStr() && (planillaTab === 'almuerzo' ? isPastAlmuerzo : isPastCena)) || !hasUnsavedChanges} 
                className="bg-blue-600 hover:bg-blue-700 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-95 flex items-center cursor-pointer"
              >
                <Save className="w-4 h-4 mr-2" /> Guardar {planillaTab === 'almuerzo' ? 'Almuerzo' : 'Cena'}
              </button>
            </div>
          </div>
          
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setPlanillaTab("almuerzo")}
              className={`flex-1 py-2.5 text-sm font-extrabold rounded-t-xl transition-all flex items-center justify-center gap-2 ${
                planillaTab === 'almuerzo' 
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md border-t border-l border-r border-amber-600' 
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Sun className={`w-4 h-4 ${planillaTab === 'almuerzo' ? 'text-yellow-200' : 'text-amber-500'}`} />
              <span>ALMUERZO (☀️ DIURNO)</span>
              {fechaPlanilla === getTodayStr() && isPastAlmuerzo && (
                <span className="text-red-100 font-normal text-[10px] sm:text-xs ml-1 bg-red-600/40 px-1.5 py-0.5 rounded">(Fuera de Hora)</span>
              )}
            </button>
            <button
              onClick={() => setPlanillaTab("cena")}
              className={`flex-1 py-2.5 text-sm font-extrabold rounded-t-xl transition-all flex items-center justify-center gap-2 ${
                planillaTab === 'cena' 
                  ? 'bg-gradient-to-r from-indigo-700 to-purple-800 text-white shadow-md border-t border-l border-r border-indigo-700' 
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Moon className={`w-4 h-4 ${planillaTab === 'cena' ? 'text-indigo-200' : 'text-indigo-500'}`} />
              <span>CENA (🌙 NOCTURNO)</span>
              {fechaPlanilla === getTodayStr() && isPastCena && (
                <span className="text-red-100 font-normal text-[10px] sm:text-xs ml-1 bg-red-600/40 px-1.5 py-0.5 rounded">(Fuera de Hora)</span>
              )}
            </button>
          </div>
        </div>
        <div className="overflow-auto max-h-[calc(100vh-280px)] min-h-[320px] border border-gray-200 dark:border-gray-800 rounded-xl relative">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 border-collapse">
            <thead className={`sticky top-0 z-20 transition-colors ${
              planillaTab === 'almuerzo' 
                ? 'bg-amber-100/90 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200' 
                : 'bg-indigo-900 dark:bg-indigo-950 text-indigo-100'
            }`}>
              <tr>
                <th scope="col" className={`px-6 py-4 text-left text-xs font-bold uppercase tracking-wider sticky top-0 left-0 z-30 border-b border-r ${
                  planillaTab === 'almuerzo'
                    ? 'bg-amber-100/90 dark:bg-amber-950/80 border-amber-200 dark:border-amber-800'
                    : 'bg-indigo-900 dark:bg-indigo-950 border-indigo-800'
                }`}>Personal</th>
                {dietas.map(d => (
                  <th key={d} scope="col" className={`px-4 py-4 text-center text-xs font-bold uppercase tracking-wider sticky top-0 z-20 border-b ${
                    planillaTab === 'almuerzo'
                      ? 'border-amber-200 dark:border-amber-800'
                      : 'border-indigo-800'
                  }`}>{d}</th>
                ))}
                <th scope="col" className={`px-4 py-4 text-center text-xs font-bold uppercase tracking-wider sticky top-0 right-0 z-30 border-b border-l ${
                  planillaTab === 'almuerzo'
                    ? 'bg-amber-100/90 dark:bg-amber-950/80 border-amber-200 dark:border-amber-800'
                    : 'bg-indigo-900 dark:bg-indigo-950 border-indigo-800'
                }`}>Estado</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800/50">
              {staff.map((p) => {
                const pSelections = selections[p.Id] || { almuerzo: null, cena: null };
                const currentSelection = planillaTab === 'almuerzo' ? pSelections.almuerzo : pSelections.cena;
                const isDisabled = fechaPlanilla === getTodayStr() ? (planillaTab === 'almuerzo' ? isPastAlmuerzo : isPastCena) : false;
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
      <div className="space-y-4">
        {/* BANNER DESTACADO PARA EMERGENCIA ANTICIPADA */}
        {emgFecha !== getTodayStr() && (
          <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white px-6 py-4 rounded-2xl shadow-md flex items-center justify-between animate-in fade-in duration-300 border border-amber-300">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-white/20 rounded-xl shrink-0">
                <Zap className="w-6 h-6 text-yellow-200" />
              </div>
              <div>
                <h4 className="font-black text-sm uppercase tracking-wide flex items-center gap-2">
                  ⚡ CARGA DE EMERGENCIA ANTICIPADA HABILITADA POR GERENCIA
                </h4>
                <p className="text-xs text-amber-100 mt-0.5 font-medium">
                  Estás registrando una solicitud de emergencia para la fecha futura <span className="font-black underline">{emgFecha.split('-').reverse().join('/')}</span> ({fechasAnticipadasActivas.find(f=>f.FechaHabilitadaStr===emgFecha)?.Descripcion || 'Fecha Futura Autorizada'}).
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-block text-[11px] font-black bg-white/25 px-3.5 py-1.5 rounded-full uppercase border border-white/40 shrink-0">
              Emergencia Anticipada
            </span>
          </div>
        )}

        <div className={`rounded-2xl shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-300 flex flex-col gap-6 p-6 transition-all ${
          emgFecha !== getTodayStr() 
            ? 'bg-gradient-to-b from-amber-50/90 via-orange-50/40 to-white dark:from-amber-950/30 dark:via-orange-950/20 dark:to-gray-900 border-2 border-amber-400 dark:border-amber-700/60 shadow-lg' 
            : 'bg-white dark:bg-gray-900 border border-orange-200 dark:border-orange-900/30'
        }`}>
          
          <div className="border-b border-gray-200 dark:border-gray-800 pb-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2 text-orange-500" /> Solicitud de Emergencia
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Para reemplazos de personal inhabilitado o agregados extra justificados.</p>
          </div>

          {isPastAuthAlmuerzo && isPastAuthCena && emgFecha === getTodayStr() && (
            <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 p-4 rounded-xl flex items-center space-x-3 text-purple-900 dark:text-purple-300">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 text-purple-600 dark:text-purple-400" />
              <div className="text-xs sm:text-sm">
                <strong>Horarios de autorización de emergencias expirados:</strong> Las solicitudes de emergencia normal de hoy han cerrado. Únicamente puede registrar <strong>⚡ Reemplazos Excepcionales de Última Hora</strong>.
              </div>
            </div>
          )}

          <form className="flex flex-col gap-6" onSubmit={submitEmergency}>
            
            {/* SELECTOR DE FECHA DE EMERGENCIA (HOY O FECHA ANTICIPADA) */}
            <div className={`p-4 rounded-xl border transition-all ${
              emgFecha !== getTodayStr()
                ? 'bg-amber-100/70 dark:bg-amber-950/60 border-amber-400 dark:border-amber-700'
                : 'bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700'
            }`}>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Fecha del Pedido de Emergencia
                </label>
                {emgFecha !== getTodayStr() && (
                  <span className="text-[10px] font-black uppercase text-amber-800 dark:text-amber-300 bg-amber-200 dark:bg-amber-900 px-2 py-0.5 rounded-md">
                    ⚡ Fecha Anticipada
                  </span>
                )}
              </div>
              <select
                value={emgFecha}
                onChange={e => {
                  const newFecha = e.target.value;
                  setEmgFecha(newFecha);
                  fetchStaff(newFecha);
                }}
                className="w-full text-sm border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:border-orange-500 focus:ring-orange-500/50 px-3 py-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-bold"
              >
                <option value={getTodayStr()}>📍 Hoy ({getTodayStr().split('-').reverse().join('/')})</option>
                {fechasAnticipadasActivas.map(f => (
                  <option key={f.Id} value={f.FechaHabilitadaStr}>
                    ⚡ {f.Descripcion || 'Carga Anticipada'} ({f.FechaHabilitadaStr.split('-').reverse().join('/')})
                  </option>
                ))}
              </select>
            </div>

            {/* ROW 1: Tipo de Solicitud */}
            <div className="bg-gray-50 dark:bg-gray-800/40 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">Tipo de Solicitud</label>
              <div className="flex flex-wrap gap-5">
                <label className={`flex items-center gap-2 ${emgFecha === getTodayStr() && isPastAuthAlmuerzo && isPastAuthCena ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input 
                    type="radio" 
                    name="emgTipo" 
                    value="reemplazo" 
                    disabled={emgFecha === getTodayStr() && isPastAuthAlmuerzo && isPastAuthCena}
                    checked={emgTipo === 'reemplazo'} 
                    onChange={() => {
                      setEmgTipo('reemplazo');
                      setEmgJustificacion("por reemplazo de personal");
                    }} 
                    className="accent-orange-500 w-4 h-4" 
                  /> 
                  <span className="text-sm font-semibold">Reemplazo de Personal</span>
                </label>

                <label className={`flex items-center gap-2 ${emgFecha === getTodayStr() && isPastAuthAlmuerzo && isPastAuthCena ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input 
                    type="radio" 
                    name="emgTipo" 
                    value="extra" 
                    disabled={emgFecha === getTodayStr() && isPastAuthAlmuerzo && isPastAuthCena}
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
                const targetFecha = emgFecha || getTodayStr();
                const idsYaReemplazados = new Set(
                  historialEmergencias
                    .filter(h => {
                      if (h.EmergenciaReemplazaId === null || h.Estado === 'Rechazado') return false;
                      const hFechaStr = h.FechaPedido ? h.FechaPedido.split('T')[0] : '';
                      if (hFechaStr !== targetFecha) return false;
                      if (emgComida !== 'Ambos' && h.TipoComida !== 'Ambos' && h.TipoComida !== emgComida) return false;
                      return true;
                    })
                    .map(h => h.EmergenciaReemplazaId)
                );

                const esInhabilitado = (p: any) => Boolean(
                  p.bajaProvisoriaHoy || p.bajaDefinitivaHoy || p.esInhabilitadoParaReemplazo || p.BajaProvisoriaFecha || p.BajaMotivo || p.bajaMotivo || p.Activo === false
                );

                const disponibles = staff.filter(p => esInhabilitado(p) && !idsYaReemplazados.has(p.Id));

                return (
                  <div className="mt-3">
                    <AgentSearchableSelect
                      options={disponibles}
                      selectedId={emgReemplazaId}
                      onSelect={setEmgReemplazaId}
                      label="Seleccionar a quién reemplaza (Únicamente agentes inhabilitados / con licencia):"
                      placeholder="Buscar por nombre o DNI..."
                      accentColor="orange"
                      required
                    />
                    {disponibles.length === 0 && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 font-semibold">
                        * No hay agentes inhabilitados ni con licencia pendientes de reemplazo en este servicio para la fecha seleccionada.
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
                <input type="text" value={emgNombre} onChange={e => setEmgNombre(e.target.value)} disabled={emgFecha === getTodayStr() && emgTipo !== 'reemplazo_excepcional' && isPastAlmuerzo && isPastCena} className="w-full rounded-lg border-gray-300 dark:border-gray-700 shadow-sm focus:border-orange-500 focus:ring-orange-500/50 sm:text-sm disabled:opacity-50 px-3 py-2.5 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="Ej. Carlos Ruiz" required />
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
                  disabled={emgFecha === getTodayStr() && emgTipo !== 'reemplazo_excepcional' && isPastAlmuerzo && isPastCena} 
                  className="w-full rounded-lg border-gray-300 dark:border-gray-700 shadow-sm focus:border-orange-500 focus:ring-orange-500/50 sm:text-sm disabled:opacity-50 px-3 py-2.5 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" 
                  placeholder="Ej. 11223344 (8 dígitos)" 
                  required 
                />
              </div>
            </div>

            {/* ROW 3: Comida y Dieta */}
            {emgTipo !== 'reemplazo_excepcional' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-gray-50 dark:bg-gray-800/30 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Comida</label>
                  <div className="flex gap-4">
                    {(!isPastAuthAlmuerzo || emgFecha !== getTodayStr()) && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="emgComida" value="Almuerzo" checked={emgComida === 'Almuerzo'} onChange={() => setEmgComida('Almuerzo')} className="accent-orange-500 w-4 h-4" /> <span className="text-sm">Almuerzo</span>
                      </label>
                    )}
                    {(!isPastAuthCena || emgFecha !== getTodayStr()) && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="emgComida" value="Cena" checked={emgComida === 'Cena'} onChange={() => setEmgComida('Cena')} className="accent-orange-500 w-4 h-4" /> <span className="text-sm">Cena</span>
                      </label>
                    )}
                    {((!isPastAuthAlmuerzo && !isPastAuthCena) || emgFecha !== getTodayStr()) && (
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
                  <select value={emgDieta} onChange={e => setEmgDieta(e.target.value)} disabled={emgFecha === getTodayStr() && isPastAlmuerzo && isPastCena} className="w-full rounded-lg border-gray-300 dark:border-gray-700 shadow-sm focus:border-orange-500 sm:text-sm px-3 py-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                    {dietas.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  
                  {emgComida === 'Ambos' && (
                    <div className="mt-3">
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Dieta Cena</label>
                      <select value={emgDietaCena} onChange={e => setEmgDietaCena(e.target.value)} disabled={emgFecha === getTodayStr() && isPastAlmuerzo && isPastCena} className="w-full rounded-lg border-gray-300 dark:border-gray-700 shadow-sm focus:border-orange-500 sm:text-sm px-3 py-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                        {dietas.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end mt-2 pt-4 border-t border-gray-200 dark:border-gray-800">
              <button 
                type="submit" 
                disabled={emgFecha === getTodayStr() && emgTipo !== 'reemplazo_excepcional' && isPastAlmuerzo && isPastCena} 
                className={`inline-flex items-center justify-center py-2.5 px-6 border border-transparent shadow-sm text-sm font-bold rounded-lg text-white transition-all transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 ${emgTipo === 'reemplazo_excepcional' ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700' : 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600'}`}
              >
                <CheckCircle className="w-4 h-4 mr-2" /> 
                {emgTipo === 'reemplazo_excepcional' ? '⚡ Registrar Reemplazo Excepcional' : 'Enviar Solicitud de Emergencia'}
              </button>
            </div>
          </form>
        </div>
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

                    const nombreAgente = h.EmergenciaNombreCompleto
                      || h.Personal?.NombreCompleto
                      || `${h.EmergenciaNombre || ''} ${h.EmergenciaApellido || ''}`.trim()
                      || h.PersonalReemplazado?.NombreCompleto
                      || 'Agente';

                    const dniAgente = h.EmergenciaDNI
                      || h.Personal?.DNI
                      || h.PersonalReemplazado?.DNI
                      || '-';

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
              className="bg-blue-600 hover:bg-blue-700 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-all transform hover:scale-[1.02] active:scale-95 flex items-center cursor-pointer"
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
                    className="w-full pl-9 pr-8 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                  />
                  {padronSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setPadronSearchTerm("")}
                      className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-0.5 rounded-full"
                      title="Limpiar búsqueda"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="p-4 overflow-y-auto max-h-[500px] space-y-3">
                {(() => {
                  const renderAgentRow = (p: any, showServicioBadge = false) => {
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

                    const isDraft12h = draftEntry?.Horario === "Almuerzo o Cena";
                    const isDraft24h = draftEntry?.Horario === "Almuerzo y Cena";

                    let containerClass = "p-3 text-sm flex justify-between items-center transition-colors group ";
                    if (isSelected) {
                      containerClass += "bg-gray-50/80 dark:bg-gray-800/80";
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
                          <div className="flex items-center flex-wrap gap-1.5 text-xs mt-0.5">
                            <span className={isSelected ? 'text-gray-400 opacity-60' : 'text-gray-500 dark:text-gray-400'}>
                              DNI: {p.DNI}
                            </span>
                            {showServicioBadge && p.Servicio?.Nombre && (
                              <span className="inline-flex items-center text-[9px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/40 px-1.5 py-0 rounded border border-indigo-100 dark:border-indigo-900/50 uppercase tracking-tight">
                                {p.Servicio.Nombre}
                              </span>
                            )}
                            {isAssignedElsewhere && (
                              <span className="text-blue-600 dark:text-blue-400 text-[10px] uppercase font-bold tracking-wider">
                                ({totalExternalRaciones} {totalExternalRaciones === 1 ? 'Ración' : 'Raciones'})
                              </span>
                            )}
                          </div>
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
                    );
                  };

                  const isSearching = padronSearchTerm.trim() !== "";
                  const showMiServicio = isSearching || openGroup === "mi_servicio";
                  const showOtros = isSearching || openGroup === "otros";

                  return (
                    <>
                      {/* GRUPO 1: Servicio Actual */}
                      <div className="border border-blue-200 dark:border-blue-800/60 rounded-lg bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
                        <button 
                          onClick={() => toggleGroup("mi_servicio")}
                          className="w-full flex justify-between items-center p-3 bg-blue-50/80 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                        >
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-sm text-blue-900 dark:text-blue-200">{miServicioNombre}</span>
                            <span className="bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 text-xs font-extrabold px-2.5 py-0.5 rounded-full">
                              {miServicioAgents.length}
                            </span>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-blue-600 dark:text-blue-400 transition-transform ${showMiServicio ? 'rotate-180' : ''}`} />
                        </button>
                        {showMiServicio && (
                          <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {miServicioAgents.length === 0 ? (
                              <p className="p-4 text-xs text-gray-500 dark:text-gray-400 italic text-center">No hay agentes en este servicio</p>
                            ) : (
                              miServicioAgents.map(p => renderAgentRow(p, false))
                            )}
                          </div>
                        )}
                      </div>

                      {/* GRUPO 2: Personal de otros servicios */}
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 overflow-hidden">
                        <button 
                          onClick={() => toggleGroup("otros")}
                          className="w-full flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-sm text-gray-800 dark:text-gray-200">Personal de otros servicios</span>
                            <span className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-extrabold px-2.5 py-0.5 rounded-full">
                              {otrosServiciosAgents.length}
                            </span>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showOtros ? 'rotate-180' : ''}`} />
                        </button>
                        {showOtros && (
                          <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {otrosServiciosAgents.length === 0 ? (
                              <p className="p-4 text-xs text-gray-500 dark:text-gray-400 italic text-center">No hay agentes de otros servicios</p>
                            ) : (
                              otrosServiciosAgents.map(p => renderAgentRow(p, true))
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
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
        <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
              <Search className="w-5 h-5 mr-2 text-indigo-500" /> Reportes y Consultas
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Impresión de vouchers e historial de raciones del servicio.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => handleImprimirVouchers('Almuerzo')} 
              disabled={(repDesde === getTodayStr() && !isPastAuthAlmuerzo) || reportes.length === 0}
              className={`flex items-center px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-all cursor-pointer ${
                (repDesde === getTodayStr() && !isPastAuthAlmuerzo) || reportes.length === 0
                  ? 'bg-gray-200 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed'
                  : 'bg-orange-500 hover:bg-orange-600 text-white transform hover:scale-[1.02] active:scale-95'
              }`}
              title={repDesde === getTodayStr() && !isPastAuthAlmuerzo ? `Disponible una vez vencido el horario tope de autorización (${limiteAuthAlmuerzo || '11:00'} hs)` : 'Imprimir vouchers de Almuerzo'}
            >
              <Printer className="w-4 h-4 mr-2" /> Vouchers Alm.
            </button>
            <button 
              onClick={() => handleImprimirVouchers('Cena')} 
              disabled={(repDesde === getTodayStr() && !isPastAuthCena) || reportes.length === 0}
              className={`flex items-center px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-all cursor-pointer ${
                (repDesde === getTodayStr() && !isPastAuthCena) || reportes.length === 0
                  ? 'bg-gray-200 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white transform hover:scale-[1.02] active:scale-95'
              }`}
              title={repDesde === getTodayStr() && !isPastAuthCena ? `Disponible una vez vencido el horario tope de autorización (${limiteAuthCena || '18:00'} hs)` : 'Imprimir vouchers de Cena'}
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

interface ServiceSearchableSelectProps {
  options: any[];
  selectedId: string;
  onSelect: (id: string) => void;
  label?: string;
  placeholder?: string;
  accentColor?: string;
  required?: boolean;
}

function ServiceSearchableSelect({
  options,
  selectedId,
  onSelect,
  label = "Seleccionar Servicio:",
  placeholder = "Buscar servicio por nombre...",
  accentColor = "purple",
  required = false
}: ServiceSearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => String(o.Id) === String(selectedId));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(o =>
    (o.Nombre || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border cursor-pointer bg-white dark:bg-gray-800 transition-all ${
          isOpen
            ? `border-purple-500 ring-2 ring-purple-500/30`
            : 'border-gray-300 dark:border-gray-700 hover:border-gray-400'
        }`}
      >
        <span className={`text-sm font-semibold ${selectedOption ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}`}>
          {selectedOption ? selectedOption.Nombre : "-- Seleccionar Servicio --"}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-60 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
          <div className="p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 sticky top-0 z-10 flex items-center">
            <Search className="w-4 h-4 text-gray-400 mr-2 ml-1" />
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={placeholder}
              className="w-full text-xs bg-transparent border-none focus:outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1 divide-y divide-gray-100 dark:divide-gray-700/50">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-xs text-center text-gray-500 dark:text-gray-400">
                No se encontraron servicios que coincidan.
              </div>
            ) : (
              filteredOptions.map(s => {
                const isSelected = String(s.Id) === String(selectedId);
                return (
                  <div
                    key={s.Id}
                    onClick={() => {
                      onSelect(String(s.Id));
                      setIsOpen(false);
                      setSearchTerm("");
                    }}
                    className={`px-3.5 py-2.5 text-xs font-semibold cursor-pointer flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-bold'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700/60 text-gray-800 dark:text-gray-200'
                    }`}
                  >
                    <span>{s.Nombre}</span>
                    {isSelected && <Check className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GerentePanel({ token, hospitalName, username, isPastAuthAlmuerzo = false, isPastAuthCena = false, dietasHabilitadasProp, onConfigUpdated }: { token: string, hospitalName?: string | null, username?: string | null, isPastAuthAlmuerzo?: boolean, isPastAuthCena?: boolean, dietasHabilitadasProp?: string[], onConfigUpdated?: (almuerzo: string, cena: string, dietas?: string[]) => void }) {
  const [emergencias, setEmergencias] = useState<any[]>([]);
  const [emergenciasAprobadas, setEmergenciasAprobadas] = useState<any[]>([]);
  const [emergenciasRechazadas, setEmergenciasRechazadas] = useState<any[]>([]);
  const [emgSubTab, setEmgSubTab] = useState<"pendientes" | "aprobadas" | "rechazadas">("pendientes");
  const [resolucionTxt, setResolucionTxt] = useState<{ [id: number]: string }>({});
  const [activeTab, setActiveTab] = useState("Bandeja");

  const fetchEmergenciasAprobadas = async () => {
    try {
      const res = await fetch(`${API_URL}/api/emergencies/approved`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEmergenciasAprobadas(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchEmergenciasRechazadas = async () => {
    try {
      const res = await fetch(`${API_URL}/api/emergencies/rejected`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEmergenciasRechazadas(data);
      }
    } catch (e) {
      console.error(e);
    }
  };
  
  // ABM Servicios
  const [servicios, setServicios] = useState<any[]>([]);
  const [openAgentesServicios, setOpenAgentesServicios] = useState<{ [servicioId: number]: boolean }>({});
  const toggleAgentesServicio = (servicioId: number) => {
    setOpenAgentesServicios(prev => ({ ...prev, [servicioId]: !prev[servicioId] }));
  };
  const [serviciosPage, setServiciosPage] = useState(1);
  const [buscarServicio, setBuscarServicio] = useState("");
  const serviciosFiltrados = servicios.filter(s => s.Nombre.toLowerCase().includes(buscarServicio.toLowerCase()));

  // Reportes & Config
  const [repDesde, setRepDesde] = useState(getTodayStr());
  const [repHasta, setRepHasta] = useState(getTodayStr());
  const [repFiltroEmpleado, setRepFiltroEmpleado] = useState("");
  const [repFiltroServicio, setRepFiltroServicio] = useState("");
  const [reportes, setReportes] = useState<any[]>([]);
  const [configAlmuerzo, setConfigAlmuerzo] = useState("09:00");
  const [configCena, setConfigCena] = useState("17:00");
  const [configAuthAlmuerzo, setConfigAuthAlmuerzo] = useState("11:00");
  const [configAuthCena, setConfigAuthCena] = useState("18:00");
  const [dietasConfig, setDietasConfig] = useState<string[]>(dietasHabilitadasProp || DIETAS_DISPONIBLES);
  const { theme } = useTheme();

  // Formulario de emergencia para Gerente / Encargado de Nutricion
  const [gerEmgServicioId, setGerEmgServicioId] = useState<string>("");
  const [gerEmgFecha, setGerEmgFecha] = useState<string>(getTodayStr());
  const [gerEmgNombre, setGerEmgNombre] = useState("");
  const [gerEmgDni, setGerEmgDni] = useState("");
  const [gerEmgComida, setGerEmgComida] = useState("Almuerzo");
  const [gerEmgDieta, setGerEmgDieta] = useState(dietasHabilitadasProp?.[0] || DIETAS_DISPONIBLES[0] || "Normal");
  const [gerEmgDietaCena, setGerEmgDietaCena] = useState(dietasHabilitadasProp?.[0] || DIETAS_DISPONIBLES[0] || "Normal");
  const [gerEmgTipo, setGerEmgTipo] = useState("extra");
  const [gerEmgReemplazaId, setGerEmgReemplazaId] = useState("");
  const [gerEmgJustificacion, setGerEmgJustificacion] = useState("Carga de emergencia por Encargado de Nutrición / Gerencia");
  const [gerEmgStaffServicio, setGerEmgStaffServicio] = useState<any[]>([]);
  const [emgOrigenFiltro, setEmgOrigenFiltro] = useState<"todos" | "nutricion" | "jefes">("todos");

  // Fechas Anticipadas Habilitadas
  const [fechasAnticipadas, setFechasAnticipadas] = useState<any[]>([]);
  const [nuevaFechaAnticipada, setNuevaFechaAnticipada] = useState("");
  const [descripcionAnticipada, setDescripcionAnticipada] = useState("");

  // Estado para Módulo de Entregas (Escáner DNI / QR)
  const [scanInput, setScanInput] = useState("");
  const [scanFecha, setScanFecha] = useState(getTodayStr());
  const [scanTipoComida, setScanTipoComida] = useState<"Almuerzo" | "Cena">(new Date().getHours() < 15 ? "Almuerzo" : "Cena");
  const [scanResult, setScanResult] = useState<any | null>(null);
  const [selectedPedidoIds, setSelectedPedidoIds] = useState<number[]>([]);
  const [cargandoScan, setCargandoScan] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Resumen de entregas e Historial
  const [summaryData, setSummaryData] = useState<{
    totalApproved: number;
    totalDelivered: number;
    totalPending: number;
    percentage: number;
    deliveriesHistory: any[];
  } | null>(null);
  const [cargandoSummary, setCargandoSummary] = useState(false);
  const [filtroHistorialEntregas, setFiltroHistorialEntregas] = useState("");

  const fetchDeliverySummary = async () => {
    setCargandoSummary(true);
    try {
      const res = await fetch(`${API_URL}/api/deliveries/summary?fecha=${scanFecha}&tipoComida=${scanTipoComida}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSummaryData(data);
      }
    } catch (e) {
      console.error("Error al cargar resumen de entregas:", e);
    } finally {
      setCargandoSummary(false);
    }
  };

  useEffect(() => {
    if (activeTab === "Entregas" && token) {
      fetchDeliverySummary();
    }
  }, [activeTab, scanFecha, scanTipoComida, token]);

  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.1;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      console.error(e);
    }
  };

  const handleConfirmDelivery = async (idsToConfirm?: number[], scanDataOverride?: any) => {
    const ids = idsToConfirm || selectedPedidoIds;
    const targetScanResult = scanDataOverride !== undefined ? scanDataOverride : scanResult;

    if (!ids || ids.length === 0) {
      Swal.fire({
        title: "Atención",
        text: "Debe seleccionar al menos una ración para registrar la entrega.",
        icon: "warning",
        background: theme === 'dark' ? '#1f2937' : '#fff',
        color: theme === 'dark' ? '#fff' : '#000'
      });
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/deliveries/confirm-delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pedidoIds: ids })
      });
      const data = await res.json();
      if (res.ok) {
        let agenteNombre = '';
        if (targetScanResult && targetScanResult.pedidos) {
          const matched = targetScanResult.pedidos.find((p: any) => ids.includes(p.Id));
          if (matched) agenteNombre = matched.AgenteNombre;
        }

        Swal.fire({
          title: "¡Entrega Confirmada!",
          text: agenteNombre 
            ? `Ración entregada a ${agenteNombre} exitosamente.` 
            : (data.message || "Raciones marcadas como entregadas."),
          icon: "success",
          timer: 1800,
          showConfirmButton: false,
          background: theme === 'dark' ? '#1f2937' : '#fff',
          color: theme === 'dark' ? '#fff' : '#000'
        });
        playBeep();

        if (targetScanResult) {
          const updatedPedidos = targetScanResult.pedidos.map((p: any) => {
            if (ids.includes(p.Id)) {
              return {
                ...p,
                Entregado: true,
                FechaEntregado: new Date().toISOString(),
                EntregadoPor: username || 'Nutrición'
              };
            }
            return p;
          });
          setScanResult({ ...targetScanResult, pedidos: updatedPedidos });
          setSelectedPedidoIds(prev => prev.filter(id => !ids.includes(id)));
        }
        fetchDeliverySummary();
      } else {
        Swal.fire({
          title: "Error al Entregar",
          text: data.error || "No se pudo registrar la entrega",
          icon: "error",
          background: theme === 'dark' ? '#1f2937' : '#fff',
          color: theme === 'dark' ? '#fff' : '#000'
        });
      }
    } catch (e) {
      console.error(e);
      Swal.fire({
        title: "Error",
        text: "Error al registrar la entrega",
        icon: "error",
        background: theme === 'dark' ? '#1f2937' : '#fff',
        color: theme === 'dark' ? '#fff' : '#000'
      });
    } finally {
      setTimeout(() => {
        scanInputRef.current?.focus();
      }, 150);
    }
  };

  const handleScanCheck = async (codeOverride?: string) => {
    const code = codeOverride !== undefined ? codeOverride : scanInput;
    if (!code || !code.trim()) return;

    setCargandoScan(true);
    try {
      const res = await fetch(`${API_URL}/api/deliveries/scan-check?code=${encodeURIComponent(code.trim())}&fecha=${scanFecha}&tipoComida=${scanTipoComida}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setScanResult(data);
        const pendIds = (data.pedidos || []).filter((p: any) => !p.Entregado).map((p: any) => p.Id);
        setSelectedPedidoIds(pendIds);
        setScanInput("");

        const isConsolidado = data.mode === 'servicio' || data.servicio?.VoucherIndividual === false;
        const shouldAutoConfirm = !isConsolidado;

        if (shouldAutoConfirm) {
          if (pendIds.length > 0) {
            // SI ES VOUCHER INDIVIDUAL O ESCANEO INDIVIDUAL DE 1 AGENTE -> Entrega automática instantánea
            await handleConfirmDelivery(pendIds, data);
          } else if (data.pedidos && data.pedidos.length > 0) {
            // Ya fue entregada previamente
            const yaEntregado = data.pedidos[0];
            playBeep();
            Swal.fire({
              title: "⚠️ Ración Ya Entregada",
              text: `La ración de ${yaEntregado.AgenteNombre} (DNI: ${yaEntregado.AgenteDNI}) ya fue entregada previamente.`,
              icon: "warning",
              timer: 3000,
              showConfirmButton: true,
              background: theme === 'dark' ? '#1f2937' : '#fff',
              color: theme === 'dark' ? '#fff' : '#000'
            });
          } else {
            // No existe pedido aprobado
            playBeep();
            Swal.fire({
              title: "⚠️ Sin Ración Autorizada",
              text: `No existe pedido aprobado para el DNI ${data.dniScanned || code.trim()} en ${scanTipoComida} (${scanFecha.split('-').reverse().join('/')}).`,
              icon: "warning",
              timer: 3000,
              showConfirmButton: true,
              background: theme === 'dark' ? '#1f2937' : '#fff',
              color: theme === 'dark' ? '#fff' : '#000'
            });
          }
        } else {
          // VOUCHER CONSOLIDADO (mode === 'servicio'): Carga la lista de raciones y requiere selección / clic manual
          playBeep();
        }
      } else {
        Swal.fire({
          title: "Atención",
          text: data.error || "No se encontraron solicitudes registradas",
          icon: "warning",
          background: theme === 'dark' ? '#1f2937' : '#fff',
          color: theme === 'dark' ? '#fff' : '#000'
        });
      }
    } catch (e) {
      console.error(e);
      Swal.fire({ title: "Error", text: "Error de comunicación con el servidor", icon: "error" });
    } finally {
      setCargandoScan(false);
      setTimeout(() => {
        scanInputRef.current?.focus();
      }, 150);
    }
  };

  const fetchAdvanceDates = async () => {
    try {
      const res = await fetch(`${API_URL}/api/advance-dates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setFechasAnticipadas(await res.json());
      }
    } catch (e) {
      console.error("Error al obtener fechas anticipadas:", e);
    }
  };

  const getNextSaturdayStr = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = (6 - day + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getNextSundayStr = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = (7 - day) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const habilitarFechaAnticipada = async (fechaStr: string, descStr: string) => {
    if (!fechaStr) return;
    try {
      const res = await fetch(`${API_URL}/api/advance-dates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fecha: fechaStr, descripcion: descStr })
      });
      const data = await res.json();
      if (res.ok) {
        Swal.fire({ title: "Habilitado", text: `La fecha ${fechaStr.split('-').reverse().join('/')} fue autorizada para carga anticipada.`, icon: "success", timer: 2000, showConfirmButton: false, background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        setNuevaFechaAnticipada("");
        setDescripcionAnticipada("");
        fetchAdvanceDates();
      } else {
        Swal.fire({ title: "Atención", text: data.error || "Error al habilitar fecha", icon: "warning", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deshabilitarFechaAnticipada = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/api/advance-dates/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        Swal.fire({ title: "Deshabilitado", text: "La fecha fue removida de la carga anticipada.", icon: "success", timer: 1500, showConfirmButton: false, background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        fetchAdvanceDates();
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchAdvanceDates();
  }, [token]);

  useEffect(() => {
    if (servicios.length > 0 && !gerEmgServicioId) {
      setGerEmgServicioId(String(servicios[0].Id));
    }
  }, [servicios]);

  useEffect(() => {
    if (gerEmgServicioId) {
      fetch(`${API_URL}/api/staff/active?servicioId=${gerEmgServicioId}&fecha=${gerEmgFecha}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(r => r.ok ? r.json() : [])
      .then(data => setGerEmgStaffServicio(data))
      .catch(console.error);
    } else {
      setGerEmgStaffServicio([]);
    }
  }, [gerEmgServicioId, gerEmgFecha, token]);

  const submitGerenteEmergency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (gerEmgTipo === "extra" && (!gerEmgNombre || !gerEmgDni)) {
      Swal.fire({ title: "Atención", text: "Por favor complete el nombre y DNI del agente.", icon: "warning", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }
    if ((gerEmgTipo === "reemplazo" || gerEmgTipo === "reemplazo_excepcional") && !gerEmgReemplazaId) {
      Swal.fire({ title: "Atención", text: "Por favor seleccione el agente a reemplazar.", icon: "warning", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }
    try {
      const targetFecha = gerEmgFecha || getTodayStr();
      const justifCompleta = gerEmgJustificacion
        ? (gerEmgJustificacion.includes('[EMERGENCIA NUTRICIÓN / GERENCIA]') ? gerEmgJustificacion : `[EMERGENCIA NUTRICIÓN / GERENCIA] ${gerEmgJustificacion}`)
        : '[EMERGENCIA NUTRICIÓN / GERENCIA] Carga de emergencia por Encargado de Nutrición / Gerencia';

      const res = await fetch(`${API_URL}/api/emergencies`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          nombreCompleto: gerEmgNombre,
          nombre: gerEmgNombre,
          apellido: "", 
          dni: gerEmgDni,
          fecha: targetFecha,
          periodoInicio: targetFecha,
          periodoFin: targetFecha,
          tipoComida: gerEmgComida,
          tipoDieta: gerEmgDieta,
          tipoDietaCena: gerEmgComida === 'Ambos' ? gerEmgDietaCena : undefined,
          justificacion: justifCompleta,
          reemplazaId: (gerEmgTipo === "reemplazo" || gerEmgTipo === "reemplazo_excepcional") ? gerEmgReemplazaId : undefined,
          tipoSolicitud: gerEmgTipo,
          esExcepcional: gerEmgTipo === "reemplazo_excepcional",
          autoAprobar: true,
          esNutricionGerencia: true,
          servicioId: Number(gerEmgServicioId)
        })
      });
      if (res.ok) {
        Swal.fire({ 
          title: "Éxito (Auto-autorizada)", 
          text: "La solicitud de emergencia de Nutrición/Gerencia fue registrada y autorizada automáticamente.", 
          icon: "success", 
          background: theme === 'dark' ? '#1f2937' : '#fff', 
          color: theme === 'dark' ? '#fff' : '#000' 
        });
        setGerEmgNombre(""); setGerEmgDni(""); setGerEmgReemplazaId("");
        fetchEmergencias();
        fetchEmergenciasAprobadas();
      } else {
        const data = await res.json();
        Swal.fire({ title: "Error", text: data.error, icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    } catch (e) {
      Swal.fire({ title: "Error", text: "Error de red", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    }
  };

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

  // Auditoría para Gerente
  const [auditoriaLogs, setAuditoriaLogs] = useState<any[]>([]);
  const [filtroAuditoria, setFiltroAuditoria] = useState("");
  const [cargandoAuditoria, setCargandoAuditoria] = useState(false);

  const fetchAuditoria = async () => {
    setCargandoAuditoria(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/auditoria`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setAuditoriaLogs(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCargandoAuditoria(false);
    }
  };

  const filteredAuditoria = auditoriaLogs.filter(log => {
    const query = filtroAuditoria.toLowerCase();
    const accion = (log.Accion || "").toLowerCase();
    const detalles = (log.Detalles || "").toLowerCase();
    const usuario = (log.Usuario?.NombreUsuario || "").toLowerCase();
    const servicio = (log.Usuario?.Servicio?.Nombre || "").toLowerCase();
    return accion.includes(query) || detalles.includes(query) || usuario.includes(query) || servicio.includes(query);
  });

  const exportAuditoriaExcel = () => {
    const data = filteredAuditoria.map(a => ({
      Fecha: new Date(a.Fecha).toLocaleString('es-AR'),
      Accion: a.Accion,
      Usuario: a.Usuario ? a.Usuario.NombreUsuario : 'Sistema',
      Servicio: a.Usuario?.Servicio?.Nombre || '-',
      Detalles: a.Detalles || '',
      IP: formatIp(a.IpAddress)
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
    XLSX.writeFile(wb, `Auditoria_Jefes_Servicio_${getTodayStr()}.xlsx`);
  };

  const exportAuditoriaPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Registros de Auditoría - Jefes de Servicio (${hospitalName || 'Efector'})`, 14, 15);
    doc.setFontSize(9);
    doc.text(`Generado el: ${new Date().toLocaleString('es-AR')}`, 14, 20);

    const tableData = filteredAuditoria.map(a => [
      new Date(a.Fecha).toLocaleString('es-AR'),
      a.Accion,
      a.Usuario ? a.Usuario.NombreUsuario : 'Sistema',
      a.Usuario?.Servicio?.Nombre || '-',
      a.Detalles || '-',
      formatIp(a.IpAddress)
    ]);

    autoTable(doc, {
      head: [['Fecha', 'Acción', 'Usuario', 'Servicio', 'Detalles', 'IP']],
      body: tableData,
      startY: 25,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`Auditoria_Jefes_Servicio_${getTodayStr()}.pdf`);
  };

  useEffect(() => {
    fetchEmergencias();
    fetchEmergenciasAprobadas();
    fetchEmergenciasRechazadas();
    fetchServicios();
    fetchAuditoria();
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

  const refreshAllEmergencies = () => {
    fetchEmergencias();
    fetchEmergenciasAprobadas();
    fetchEmergenciasRechazadas();
  };

  const resolveEmergency = async (id: number, estado: string) => {
    const justificacion = resolucionTxt[id];
    if (estado === 'Rechazado' && (!justificacion || justificacion.trim() === '')) {
      Swal.fire({ title: "Atención", text: "Debes ingresar el motivo de rechazo", icon: "warning", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/emergencies/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estado, justificacionResolucion: justificacion })
      });
      if (res.ok) {
        const msg = estado === 'Pendiente' ? 'Solicitud devuelta a pendiente' : `Emergencia ${estado}`;
        Swal.fire({ title: "Éxito", text: msg, icon: "success", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        refreshAllEmergencies();
      } else {
        const data = await res.json();
        Swal.fire({ title: "Error", text: data.error, icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    } catch (e) {
      Swal.fire({ title: "Error", text: "Error al resolver emergencia", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
    }
  };

  const revertirRechazo = async (id: number, nombreAgente: string) => {
    Swal.fire({
      title: '¿Volver atrás rechazo?',
      text: `¿Deseas reactivar la solicitud de emergencia de "${nombreAgente}" para que vuelva a figurar como pendiente de revisión del día?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, volver a pendiente',
      cancelButtonText: 'Cancelar',
      background: theme === 'dark' ? '#1f2937' : '#ffffff',
      color: theme === 'dark' ? '#ffffff' : '#000000',
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await fetch(`${API_URL}/api/emergencies/${id}/resolve`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ estado: "Pendiente" })
          });
          if (res.ok) {
            Swal.fire({ title: "Éxito", text: "Solicitud reactivada. Ahora figura en Pendientes del día.", icon: "success", timer: 1500, background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
            fetchEmergencias();
            fetchEmergenciasRechazadas();
          } else {
            const data = await res.json();
            Swal.fire({ title: "Error", text: data.error || "No se pudo reactivar la solicitud", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
          }
        } catch (e) {
          Swal.fire({ title: "Error", text: "Error de red", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        }
      }
    });
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

  const renombrarServicioModal = async (servicioId: number, nombreActual: string) => {
    const { value: nuevoNombre } = await Swal.fire({
      title: 'Corregir Nombre del Servicio',
      input: 'text',
      inputValue: nombreActual,
      inputLabel: 'Nuevo nombre para el servicio',
      showCancelButton: true,
      confirmButtonText: 'Guardar Nombre',
      cancelButtonText: 'Cancelar',
      background: theme === 'dark' ? '#1f2937' : '#fff',
      color: theme === 'dark' ? '#fff' : '#000',
      inputValidator: (value) => {
        if (!value || !value.trim()) return 'Debes ingresar un nombre válido';
      }
    });

    if (nuevoNombre && nuevoNombre.trim() !== nombreActual) {
      try {
        const res = await fetch(`${API_URL}/api/services/${servicioId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ nombre: nuevoNombre.trim() })
        });
        if (res.ok) {
          Swal.fire({ title: "Éxito", text: "Nombre del servicio actualizado correctamente", icon: "success", timer: 1500, background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
          fetchServicios();
        } else {
          const data = await res.json();
          Swal.fire({ title: "Error", text: data.error || "No se pudo actualizar el nombre del servicio", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        }
      } catch (e) {
        Swal.fire({ title: "Error", text: "Error de conexión al actualizar servicio", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
    }
  };

  const cambiarServicioAgenteModal = async (agenteId: number, nombreAgente: string, servicioActualId: number) => {
    const optionsHtml = servicios.map((s: any) => 
      `<option value="${s.Id}" ${s.Id === servicioActualId ? 'selected' : ''}>${s.Nombre}</option>`
    ).join('');

    const { value: nuevoServicioId } = await Swal.fire({
      title: `Cambiar Servicio de Agente`,
      html:
        `<p style="font-size:13px; font-weight:bold; margin-bottom:10px; color:${theme === 'dark' ? '#d1d5db' : '#374151'}; font-family:sans-serif;">Agente: ${nombreAgente}</p>` +
        `<label style="display:block; text-align:left; font-size:12px; font-weight:bold; margin-bottom:4px; color:${theme === 'dark' ? '#9ca3af' : '#6b7280'};">Seleccione el servicio destino:</label>` +
        `<select id="swal-select-servicio" class="swal2-select" style="display:flex; width:100%; margin: 8px 0 16px 0; background-color:${theme === 'dark' ? '#374151' : '#fff'}; color:${theme === 'dark' ? '#fff' : '#000'}; border-color:${theme === 'dark' ? '#4b5563' : '#d1d5db'};">${optionsHtml}</select>`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Transferir Agente',
      cancelButtonText: 'Cancelar',
      background: theme === 'dark' ? '#1f2937' : '#fff',
      color: theme === 'dark' ? '#fff' : '#000',
      preConfirm: () => {
        const selectEl = document.getElementById('swal-select-servicio') as HTMLSelectElement;
        const val = selectEl ? selectEl.value : '';
        if (!val) {
          Swal.showValidationMessage('Debes seleccionar un servicio');
          return false;
        }
        return Number(val);
      }
    });

    if (nuevoServicioId && nuevoServicioId !== servicioActualId) {
      try {
        const res = await fetch(`${API_URL}/api/staff/${agenteId}/servicio`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ servicioId: nuevoServicioId })
        });
        if (res.ok) {
          Swal.fire({ title: "Éxito", text: "Agente transferido exitosamente", icon: "success", timer: 1500, background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
          fetchServicios();
        } else {
          const data = await res.json();
          Swal.fire({ title: "Error", text: data.error || "No se pudo cambiar el servicio del agente", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
        }
      } catch (e) {
        Swal.fire({ title: "Error", text: "Error de conexión al transferir agente", icon: "error", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      }
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
    if (r.JustificacionSolicitud && r.JustificacionSolicitud.includes('[SERVICIO:')) {
      const match = r.JustificacionSolicitud.match(/\[SERVICIO:(.*?)\]/);
      if (match && match[1]) return match[1];
    }
    const sId = r.servicioId || r.ServicioId;
    if (sId) {
      const sMatch = servicios.find((s: any) => s.Id === Number(sId));
      if (sMatch) return sMatch.Nombre;
    }
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

  const handleImprimirCocina = (turno: 'Almuerzo' | 'Cena') => {
    if (reportes.length === 0) {
      Swal.fire({ title: "Aviso", text: "No hay reportes generados para imprimir.", icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }

    const filtered = reportes.filter(r => {
      if (r.Estado !== 'Aprobado') return false;
      if (r.TipoComida?.toLowerCase() !== turno.toLowerCase()) return false;
      if (!repFiltroEmpleado) return true;
      const term = repFiltroEmpleado.toLowerCase();
      const name = r.Personal ? `${r.Personal.NombreCompleto}`.toLowerCase() : `${r.EmergenciaNombreCompleto}`.toLowerCase();
      const dni = r.Personal ? (r.Personal.DNI || "").toLowerCase() : (r.EmergenciaDNI || "").toLowerCase();
      return name.includes(term) || dni.includes(term);
    });

    if (filtered.length === 0) {
      Swal.fire({ title: "Aviso", text: `No hay datos de ${turno} para imprimir según el filtro actual.`, icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }

    const resComida: Record<string, number> = {};
    let totalComida = 0;

    filtered.forEach(r => {
      const dieta = r.TipoDieta || 'Normal';
      resComida[dieta] = (resComida[dieta] || 0) + 1;
      totalComida++;
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
              <td style="padding: 8px 12px; border: 1px solid #ccc; text-align: right; font-size: 14px;">TOTAL RACIONES (${turno.toUpperCase()}):</td>
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

    const iconoTurno = turno === 'Almuerzo' ? '☀️' : '🌙';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Reporte de Producción - Cocina (${turno})</title>
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
              <div class="title">REPORTE DE PRODUCCIÓN - COCINA (${turno.toUpperCase()})</div>
              <div class="subtitle">Efector: <strong>${efNombre}</strong></div>
            </div>
            <div class="meta">
              <div>Período: <strong>${fDesdeStr} ${fDesdeStr !== fHastaStr ? 'al ' + fHastaStr : ''}</strong></div>
              <div>Fecha de Emisión: ${fechaImpresion}</div>
            </div>
          </div>

          <div class="section-title">${iconoTurno} ${turno.toUpperCase()}</div>
          ${renderTablaDietas(resComida, totalComida)}

          <div style="margin-top: 25px; padding: 14px; background: #eff6ff; border: 1px solid #93c5fd; border-radius: 8px; font-size: 16px; font-weight: bold; text-align: right; color: #1e3a8a;">
            TOTAL RACIONES ${turno.toUpperCase()} A COCINAR: <span style="color: #1d4ed8; font-size: 20px; margin-left: 8px;">${totalComida}</span>
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

  const handleImprimirEntrega = (turno: 'Almuerzo' | 'Cena') => {
    if (reportes.length === 0) {
      Swal.fire({ title: "Aviso", text: "No hay reportes generados para imprimir.", icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }

    const filtered = reportes.filter(r => {
      if (r.Estado !== 'Aprobado') return false;
      if (r.TipoComida?.toLowerCase() !== turno.toLowerCase()) return false;
      if (!repFiltroEmpleado) return true;
      const term = repFiltroEmpleado.toLowerCase();
      const name = r.Personal ? `${r.Personal.NombreCompleto}`.toLowerCase() : `${r.EmergenciaNombreCompleto}`.toLowerCase();
      const dni = r.Personal ? (r.Personal.DNI || "").toLowerCase() : (r.EmergenciaDNI || "").toLowerCase();
      return name.includes(term) || dni.includes(term);
    });

    if (filtered.length === 0) {
      Swal.fire({ title: "Aviso", text: `No hay datos de ${turno} para imprimir según el filtro actual.`, icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }

    const now = new Date();
    const fechaImpresion = now.toLocaleDateString('es-AR');
    const horaImpresion = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(/\s?[a-zA-Z\.]+/g, '').trim();
    const usuarioImpresion = username || 'Usuario';
    const efNombre = hospitalName || 'Efector';
    const fDesdeStr = repDesde.split('-').reverse().join('/');
    const fHastaStr = repHasta.split('-').reverse().join('/');

    interface FilaEntrega {
      fechaOriginal: string;
      fechaOrder: string;
      servicioName: string;
      agenteNombreClean: string;
      agenteDetalle: string;
      tipoComida: string;
      tipoDieta: string;
      comidaDietaDetalle: string;
      cantidadRaciones: number;
    }

    const construirFilas = (listaReportes: any[]): FilaEntrega[] => {
      // Agrupar los reportes por Servicio
      const porServicio: Record<string, any[]> = {};
      listaReportes.forEach(r => {
        const sName = getServicioNombre(r);
        if (!porServicio[sName]) porServicio[sName] = [];
        porServicio[sName].push(r);
      });

      const filas: FilaEntrega[] = [];

      const serviciosKeys = Object.keys(porServicio).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

      serviciosKeys.forEach(servicio => {
        const reportesServicio = porServicio[servicio];

        const individuales = reportesServicio.filter(r => esServicioIndividual(r));
        const consolidados = reportesServicio.filter(r => !esServicioIndividual(r));

        // 1. Renglón CONSOLIDADO para la planilla de entrega (coincide exactamente con el Voucher Consolidado emitido)
        if (consolidados.length > 0) {
          const date = consolidados[0].FechaPedido.split('T')[0].split('-').reverse().join('/');
          const totalPlatos = consolidados.length;
          const counts: Record<string, number> = {};
          consolidados.forEach(p => { counts[p.TipoDieta || 'Normal'] = (counts[p.TipoDieta || 'Normal'] || 0) + 1; });
          const dietasText = Object.entries(counts).map(([dieta, cant]) => `${dieta} (${cant})`).join(' | ');

          filas.push({
            fechaOriginal: consolidados[0].FechaPedido,
            fechaOrder: date,
            servicioName: servicio,
            agenteNombreClean: 'CONSOLIDADO',
            agenteDetalle: `<strong>CONSOLIDADO (${servicio})</strong><br/><span style="color: #2563eb; font-size: 10px; font-weight: bold;">TOTAL: ${totalPlatos} RACION(ES)</span><br/><span style="color: #555; font-size: 9px;">${dietasText}</span>`,
            tipoComida: consolidados[0].TipoComida || turno,
            tipoDieta: dietasText,
            comidaDietaDetalle: `<strong>${consolidados[0].TipoComida || turno}</strong><br/><span style="font-size: 9px;">${dietasText}</span>`,
            cantidadRaciones: totalPlatos
          });
        }

        // 2. Renglones INDIVIDUALES para la planilla de entrega (coinciden exactamente con los Vouchers Individuales emitidos)
        const filasIndividualesServicio: FilaEntrega[] = [];
        individuales.forEach(p => {
          const fechaOrder = p.FechaPedido.split('T')[0].split('-').reverse().join('/');
          const nombreAgente = p.EmergenciaNombreCompleto
            || p.Personal?.NombreCompleto
            || `${p.EmergenciaNombre || ''} ${p.EmergenciaApellido || ''}`.trim()
            || p.PersonalReemplazado?.NombreCompleto
            || 'Agente';

          const dniAgente = p.EmergenciaDNI
            || p.Personal?.DNI
            || p.PersonalReemplazado?.DNI
            || '-';

          filasIndividualesServicio.push({
            fechaOriginal: p.FechaPedido,
            fechaOrder: fechaOrder,
            servicioName: servicio,
            agenteNombreClean: nombreAgente,
            agenteDetalle: `<strong>${nombreAgente}</strong><br/><span style="color: #555; font-size: 10px;">DNI: ${dniAgente}</span>`,
            tipoComida: p.TipoComida || turno,
            tipoDieta: p.TipoDieta || 'Normal',
            comidaDietaDetalle: `<strong>${p.TipoComida || turno}</strong> (${p.TipoDieta || 'Normal'})`,
            cantidadRaciones: 1
          });
        });

        // Ordenar alfabéticamente por nombre del agente dentro de este servicio (A-Z)
        filasIndividualesServicio.sort((a, b) => a.agenteNombreClean.localeCompare(b.agenteNombreClean, 'es', { sensitivity: 'base' }));

        filas.push(...filasIndividualesServicio);
      });

      return filas;
    };

    const filas = construirFilas(filtered);
    const iconoTurno = turno === 'Almuerzo' ? '☀️' : '🌙';

    let rowsHTML = '';
    let totalRacionesTurno = 0;

    filas.forEach((f, idx) => {
      totalRacionesTurno += f.cantidadRaciones;
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
          <title>Planilla de Entrega y Conformidad - ${turno}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; color: #111; }
            .header { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-end; }
            .title { font-size: 18px; font-weight: bold; color: #111; }
            .subtitle { font-size: 13px; color: #374151; margin-top: 4px; }
            .meta { text-align: right; font-size: 11px; color: #4b5563; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background-color: #f3f4f6; padding: 8px 6px; border: 1px solid #666; font-size: 11px; text-align: left; text-transform: uppercase; color: #374151; }
            .summary { margin-top: 18px; font-size: 13px; font-weight: bold; text-align: right; border-top: 2px solid #111; padding-top: 8px; }
            .footer { margin-top: 25px; border-top: 1px dashed #aaa; padding-top: 6px; font-size: 9px; color: #6b7280; text-align: right; }
            @media print {
              @page { size: A4 portrait; margin: 1cm; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body onload="setTimeout(() => { window.print(); window.close(); }, 600)">
          <div class="header">
            <div>
              <div class="title">${iconoTurno} PLANILLA DE ENTREGA Y CONFORMIDAD - ${turno.toUpperCase()}</div>
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
            TOTAL RACIONES A ENTREGAR (${turno.toUpperCase()}): ${totalRacionesTurno}
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

  const handleImprimirVouchers = async (tipo: 'Almuerzo' | 'Cena') => {
    if (reportes.length === 0) {
      Swal.fire({ title: "Aviso", text: "No hay reportes generados para imprimir.", icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }
    
    // Obtener la lista de servicios con raciones aprobadas para este turno
    const serviciosDisponiblesSet = new Set<string>();
    reportes.forEach(r => {
      if (r.Estado === 'Aprobado' && r.TipoComida === tipo) {
        serviciosDisponiblesSet.add(getServicioNombre(r));
      }
    });

    const serviciosDisponibles = Array.from(serviciosDisponiblesSet).sort((a, b) => a.localeCompare(b));

    if (serviciosDisponibles.length === 0) {
      Swal.fire({ title: "Aviso", text: `No hay solicitudes aprobadas de ${tipo} para imprimir vouchers.`, icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
      return;
    }

    let servicioSeleccionado = "TODOS";

    // Si hay servicios disponibles, pedir confirmación/selección al Gerente
    if (serviciosDisponibles.length > 0) {
      const swalBg = theme === 'dark' ? '#1f2937' : '#ffffff';
      const swalText = theme === 'dark' ? '#ffffff' : '#111827';
      const swalBorder = theme === 'dark' ? '#374151' : '#d1d5db';

      const optionsHtml = `
        <option value="TODOS" style="background-color: ${swalBg}; color: ${swalText};">-- Todos los Servicios (${serviciosDisponibles.length}) --</option>
        ${serviciosDisponibles.map(s => `<option value="${s}" style="background-color: ${swalBg}; color: ${swalText};">${s}</option>`).join('')}
      `;

      const { value: sel } = await Swal.fire({
        title: `Imprimir Vouchers de ${tipo}`,
        text: "Selecciona el servicio que deseas imprimir:",
        html: `
          <div style="margin-top: 15px; text-align: left;">
            <label style="display: block; font-size: 12px; font-weight: bold; margin-bottom: 6px; color: ${theme === 'dark' ? '#d1d5db' : '#374151'};">Servicio / Área:</label>
            <select id="swal-servicio-voucher" class="swal2-input" style="width: 100%; margin: 0; font-size: 14px; background-color: ${swalBg}; color: ${swalText}; border: 1px solid ${swalBorder}; border-radius: 8px;">
              ${optionsHtml}
            </select>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: "Imprimir Vouchers",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#3b82f6",
        background: swalBg,
        color: swalText,
        preConfirm: () => {
          return (document.getElementById('swal-servicio-voucher') as HTMLSelectElement).value;
        }
      });

      if (!sel) return; // Cancelado
      servicioSeleccionado = sel;
    }

    const filtered = reportes.filter(r => {
      if (r.Estado !== "Aprobado") return false;
      if (r.TipoComida !== tipo) return false;

      // Filtro de Servicio
      if (servicioSeleccionado && servicioSeleccionado !== "TODOS") {
        const sName = getServicioNombre(r);
        if (sName.toLowerCase() !== servicioSeleccionado.toLowerCase()) return false;
      }

      if (!repFiltroEmpleado) return true;
      const term = repFiltroEmpleado.toLowerCase();
      const name = r.Personal ? `${r.Personal.NombreCompleto}`.toLowerCase() : `${r.EmergenciaNombreCompleto}`.toLowerCase();
      const dni = r.Personal ? (r.Personal.DNI || "").toLowerCase() : (r.EmergenciaDNI || "").toLowerCase();
      return name.includes(term) || dni.includes(term);
    });

    if (filtered.length === 0) {
      Swal.fire({ title: "Aviso", text: `No hay reportes de ${tipo} que coincidan con el servicio seleccionado.`, icon: "info", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
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
        const sIdMatch = consolidados[0].ServicioId || consolidados[0].Personal?.ServicioId || consolidados[0].PersonalReemplazado?.ServicioId || consolidados[0].SolicitadoPor?.ServicioId;
        const qrData = encodeURIComponent(sIdMatch ? `SERVICE_ORDER:${sIdMatch}` : `${servicio}-${tipo}-${date}-Total:${totalPlatos}`);
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
    { id: "CrearEmergencia", label: "Pedido de Emergencia", icon: <PlusCircle className="w-4 h-4 mr-2" /> },
    { id: "Hospital", label: "Servicios", icon: <Building className="w-4 h-4 mr-2" /> },
    { id: "Reportes", label: "Reportes", icon: <FileText className="w-4 h-4 mr-2" /> },
    { id: "Auditoria", label: "Auditoría", icon: <Shield className="w-4 h-4 mr-2" /> },
    { id: "Configuracion", label: "Configuración", icon: <Settings className="w-4 h-4 mr-2" /> },
    { id: "Entregas", label: "Entrega", icon: <QrCode className="w-4 h-4 mr-2 text-indigo-500" /> }
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

      {/* PUNTO DE ENTREGA (ESCÁNER DNI / QR) */}
      {activeTab === "Entregas" && (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
          
          {/* BARRA DE PROGRESO DE ENTREGAS */}
          <div className="bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/60 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 rounded-2xl shadow-sm border border-blue-150 dark:border-gray-800 p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-950/60 px-3 py-1 rounded-full border border-indigo-200 dark:border-indigo-800">
                  📊 Indicador de Avance de Entregas
                </span>
                <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 mt-2 flex items-center">
                  <Utensils className="w-5 h-5 mr-2 text-indigo-500" />
                  Progreso del Turno ({scanTipoComida} - {scanFecha.split('-').reverse().join('/')})
                </h3>
              </div>

              {/* KPI BADGES */}
              <div className="flex flex-wrap gap-2 text-xs font-extrabold">
                <div className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-3.5 py-1.5 rounded-xl flex items-center shadow-xs">
                  <CheckCircle className="w-4 h-4 mr-1.5 text-emerald-500" />
                  Entregadas: <strong className="ml-1 text-sm">{summaryData?.totalDelivered ?? 0}</strong>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-3.5 py-1.5 rounded-xl flex items-center shadow-xs">
                  <AlertTriangle className="w-4 h-4 mr-1.5 text-amber-500" />
                  Faltan Entregar: <strong className="ml-1 text-sm">{summaryData?.totalPending ?? 0}</strong>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-3.5 py-1.5 rounded-xl flex items-center shadow-xs">
                  <Users className="w-4 h-4 mr-1.5 text-blue-500" />
                  Total Aprobadas: <strong className="ml-1 text-sm">{summaryData?.totalApproved ?? 0}</strong>
                </div>
              </div>
            </div>

            {/* BARRA DE PROGRESO */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold text-gray-600 dark:text-gray-400">
                <span>Completado: {summaryData?.totalDelivered ?? 0} de {summaryData?.totalApproved ?? 0} raciones ({summaryData?.percentage ?? 0}%)</span>
                <span>Faltan: {summaryData?.totalPending ?? 0} raciones</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-800 h-6 rounded-2xl overflow-hidden shadow-inner p-1 border border-gray-300/70 dark:border-gray-700 relative">
                <div 
                  className="bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 h-full rounded-xl transition-all duration-700 ease-out flex items-center justify-end pr-3 text-[11px] font-black text-white shadow-sm"
                  style={{ width: `${Math.max(summaryData?.percentage ?? 0, 2)}%` }}
                >
                  {(summaryData?.percentage ?? 0) >= 8 && `${summaryData?.percentage}%`}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            
            {/* HEADER CON INDICADOR DE ESTADO */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-6 border-b border-gray-200 dark:border-gray-800">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
                  <QrCode className="w-6 h-6 mr-2 text-blue-600 dark:text-blue-400" /> 
                  Estación de Entrega de Viandas (DNI / QR)
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Escanee el DNI físico del agente o el código QR del voucher para validar y registrar la entrega en tiempo real.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Fecha */}
                <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700">
                  <span className="text-xs font-bold text-gray-500">Fecha:</span>
                  <input 
                    type="date" 
                    value={scanFecha} 
                    onChange={e => setScanFecha(e.target.value)}
                    className="bg-transparent text-xs font-bold text-gray-900 dark:text-gray-100 focus:outline-none"
                  />
                </div>

                {/* Tipo Comida */}
                <div className="flex bg-gray-200 dark:bg-gray-800 p-1 rounded-xl gap-1">
                  <button
                    onClick={() => setScanTipoComida("Almuerzo")}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                      scanTipoComida === "Almuerzo"
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                    }`}
                  >
                    ☀️ Almuerzo
                  </button>
                  <button
                    onClick={() => setScanTipoComida("Cena")}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                      scanTipoComida === "Cena"
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                    }`}
                  >
                    🌙 Cena
                  </button>
                </div>
              </div>
            </div>

            {/* CAJA DE ESCANEO ACTIVA (AUTOFOCUS) */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (scanInput.trim()) {
                  handleScanCheck(scanInput.trim());
                }
              }}
              className="mb-8"
            >
              <div className="relative flex items-center">
                <Scan className="w-6 h-6 absolute left-4 text-blue-500 animate-pulse" />
                <input
                  ref={scanInputRef}
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="📲 LECTOR ACTIVO: Escanee el DNI o QR aquí (o ingrese DNI y presione Enter)..."
                  className="w-full pl-12 pr-28 py-4 bg-blue-50/50 dark:bg-gray-800/60 border-2 border-blue-400 dark:border-blue-600 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/40 rounded-2xl font-bold text-gray-900 dark:text-gray-100 text-base placeholder-gray-400 transition-all"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={cargandoScan || !scanInput.trim()}
                  className="absolute right-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl transition-all shadow-sm flex items-center"
                >
                  {cargandoScan ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : <Search className="w-4 h-4 mr-1" />}
                  Buscar
                </button>
              </div>
            </form>

            {/* RESULTADO DEL ESCANEO */}
            {cargandoScan && (
              <div className="p-12 text-center flex flex-col items-center">
                <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mb-3" />
                <p className="text-sm font-bold text-gray-600 dark:text-gray-400">Verificando raciones registradas...</p>
              </div>
            )}

            {!cargandoScan && !scanResult && (
              <div className="p-12 text-center flex flex-col items-center bg-gray-50/50 dark:bg-gray-800/20 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
                <QrCode className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
                <h3 className="text-base font-bold text-gray-700 dark:text-gray-300">Estación Lista para Escanear</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-md">
                  Aproxime el código de barras PDF417 del DNI físico del agente o el código QR del voucher al lector de cocina.
                </p>
              </div>
            )}

            {!cargandoScan && scanResult && (
              <div className="space-y-6">
                {scanResult.pedidos.length === 0 ? (
                  <div className="p-6 bg-red-50 dark:bg-red-950/30 border-2 border-red-300 dark:border-red-800 rounded-2xl text-center">
                    <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-2" />
                    <h3 className="text-lg font-extrabold text-red-700 dark:text-red-400">
                      ❌ SIN RACIÓN SOLICITADA PARA HOY
                    </h3>
                    <p className="text-sm text-red-600 dark:text-red-300 mt-1 font-medium">
                      No se encontró ninguna solicitud autorizada para {scanResult.dniScanned ? `el DNI ${scanResult.dniScanned}` : 'el código escaneado'} en la fecha {scanFecha.split('-').reverse().join('/')}.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* ENCABEZADO DE SERVICIO / AGENTE */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-6 rounded-2xl shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="bg-white/20 text-white text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider">
                            {scanResult.mode === 'servicio' ? '🏢 Servicio Consolidado' : '👤 Entrega Individual'}
                          </span>
                          <span className="bg-amber-400 text-gray-900 text-xs font-black px-3 py-1 rounded-full uppercase">
                            {scanTipoComida}
                          </span>
                        </div>
                        <h3 className="text-2xl font-black mt-2">
                          {scanResult.servicio ? scanResult.servicio.Nombre : (scanResult.agenteScanned?.NombreCompleto || scanResult.pedidos[0]?.ServicioNombre || 'Servicio')}
                        </h3>
                        <p className="text-xs text-blue-100 mt-0.5">
                          Total Raciones Registradas: <strong className="text-white text-sm">{scanResult.pedidos.length}</strong> | Entregadas: <strong className="text-green-300 text-sm">{scanResult.pedidos.filter((p: any) => p.Entregado).length}</strong> | Pendientes: <strong className="text-yellow-300 text-sm">{scanResult.pedidos.filter((p: any) => !p.Entregado).length}</strong>
                        </p>
                      </div>

                      {/* ACCIONES RÁPIDAS DE ENTREGA */}
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleConfirmDelivery(scanResult.pedidos.filter((p: any) => !p.Entregado).map((p: any) => p.Id))}
                          disabled={scanResult.pedidos.filter((p: any) => !p.Entregado).length === 0}
                          className="px-4 py-2.5 bg-green-500 hover:bg-green-600 disabled:opacity-40 text-white text-xs font-black rounded-xl transition-all shadow-sm flex items-center cursor-pointer"
                        >
                          <CheckCircle className="w-4 h-4 mr-1.5" />
                          Entregar TODAS las Pendientes ({scanResult.pedidos.filter((p: any) => !p.Entregado).length})
                        </button>

                        <button
                          onClick={() => handleConfirmDelivery(selectedPedidoIds)}
                          disabled={selectedPedidoIds.length === 0}
                          className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-xs font-black rounded-xl transition-all shadow-sm flex items-center cursor-pointer"
                        >
                          <Utensils className="w-4 h-4 mr-1.5" />
                          Entregar Seleccionadas ({selectedPedidoIds.length})
                        </button>
                      </div>
                    </div>

                    {/* GRILLA DE RACIONES DEL SERVICIO / AGENTE */}
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
                      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
                        <h4 className="text-sm font-extrabold text-gray-900 dark:text-gray-100 flex items-center">
                          <Users className="w-4 h-4 mr-2 text-indigo-500" />
                          Integrantes y Raciones del Servicio
                        </h4>

                        <div className="flex items-center space-x-2 text-xs">
                          <button
                            onClick={() => {
                              const pendIds = scanResult.pedidos.filter((p: any) => !p.Entregado).map((p: any) => p.Id);
                              setSelectedPedidoIds(pendIds);
                            }}
                            className="text-blue-600 dark:text-blue-400 font-bold hover:underline"
                          >
                            Seleccionar Pendientes
                          </button>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={() => setSelectedPedidoIds([])}
                            className="text-gray-500 font-bold hover:underline"
                          >
                            Deseleccionar
                          </button>
                        </div>
                      </div>

                      <div className="divide-y divide-gray-200 dark:divide-gray-800">
                        {scanResult.pedidos.map((p: any) => {
                          const isSelected = selectedPedidoIds.includes(p.Id);
                          const isEntregado = p.Entregado;
                          const isDietaEspecial = (p.TipoDieta || '').toLowerCase() !== 'normal';

                          return (
                            <div 
                              key={p.Id} 
                              className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                                isEntregado 
                                  ? 'bg-green-50/50 dark:bg-green-950/20' 
                                  : isSelected 
                                  ? 'bg-blue-50/60 dark:bg-blue-950/30' 
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'
                              }`}
                            >
                              <div className="flex items-center space-x-4">
                                {!isEntregado && (
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedPedidoIds(prev => [...prev, p.Id]);
                                      } else {
                                        setSelectedPedidoIds(prev => prev.filter(id => id !== p.Id));
                                      }
                                    }}
                                    className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                                  />
                                )}

                                <div>
                                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                    <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">
                                      {p.AgenteNombre}
                                    </h4>
                                    <span className="text-xs text-gray-500 font-semibold">
                                      DNI: {p.AgenteDNI}
                                    </span>
                                    {isDietaEspecial && (
                                      <span className="bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 text-xs font-black px-2.5 py-0.5 rounded-full border border-amber-300 flex items-center">
                                        🥗 {p.TipoDieta}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    Servicio: <strong>{p.ServicioNombre}</strong> • Dieta: <strong className="text-gray-700 dark:text-gray-300">{p.TipoDieta}</strong>
                                  </p>
                                </div>
                              </div>

                              {/* ESTADO & BOTÓN INDIVIDUAL */}
                              <div className="flex items-center space-x-3">
                                {isEntregado ? (
                                  <div className="text-right">
                                    <span className="inline-flex items-center text-xs font-black bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 px-3 py-1.5 rounded-xl border border-green-300 dark:border-green-800">
                                      <CheckCircle className="w-3.5 h-3.5 mr-1 text-green-600" />
                                      ENTREGADO {p.FechaEntregado ? new Date(p.FechaEntregado).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }) + ' hs' : ''}
                                    </span>
                                    {p.EntregadoPor && (
                                      <div className="text-[10px] text-gray-400 mt-0.5">Por: {p.EntregadoPor}</div>
                                    )}
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleConfirmDelivery([p.Id])}
                                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center cursor-pointer"
                                  >
                                    <Check className="w-3.5 h-3.5 mr-1" />
                                    Entregar Ración
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* HISTORIAL DE ENTREGAS EN LA MISMA VISTA (ÚLTIMO PRIMERO) */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
                  <History className="w-5 h-5 mr-2 text-indigo-500" />
                  Historial de Entregas Realizadas
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Las entregas registradas en este turno figuran en tiempo real. <strong>El último escaneo exitoso se ubica siempre al principio.</strong>
                </p>
              </div>

              <div className="flex items-center space-x-3 w-full sm:w-auto">
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                  <input 
                    type="text"
                    value={filtroHistorialEntregas}
                    onChange={e => setFiltroHistorialEntregas(e.target.value)}
                    placeholder="Buscar agente, DNI o servicio..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs font-semibold rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <button
                  onClick={fetchDeliverySummary}
                  className="p-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl text-gray-600 dark:text-gray-300"
                  title="Actualizar historial"
                >
                  <RefreshCw className={`w-4 h-4 ${cargandoSummary ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            <div className="p-6">
              {!summaryData?.deliveriesHistory || summaryData.deliveriesHistory.length === 0 ? (
                <div className="p-12 text-center text-gray-400 dark:text-gray-500 italic bg-gray-50/50 dark:bg-gray-800/20 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">
                  <History className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="font-bold text-sm">Aún no hay entregas registradas para la fecha y turno seleccionados.</p>
                  <p className="text-xs mt-1">Escanee un DNI en el cuadro superior para registrar la primera ración.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-xl">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                    <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3 text-left">Hora Entrega</th>
                        <th className="px-4 py-3 text-left">Agente / DNI</th>
                        <th className="px-4 py-3 text-left">Servicio</th>
                        <th className="px-4 py-3 text-left">Comida / Dieta</th>
                        <th className="px-4 py-3 text-left">Registrado Por</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-xs">
                      {summaryData.deliveriesHistory
                        .filter((item: any) => {
                          if (!filtroHistorialEntregas.trim()) return true;
                          const query = filtroHistorialEntregas.toLowerCase();
                          return (
                            (item.AgenteNombre || '').toLowerCase().includes(query) ||
                            (item.AgenteDNI || '').toLowerCase().includes(query) ||
                            (item.ServicioNombre || '').toLowerCase().includes(query)
                          );
                        })
                        .map((item: any, idx: number) => {
                          const isLatest = idx === 0;
                          return (
                            <tr 
                              key={item.Id} 
                              className={`transition-colors ${
                                isLatest 
                                  ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-l-4 border-l-emerald-500 font-semibold' 
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'
                              }`}
                            >
                              <td className="px-4 py-3 whitespace-nowrap font-mono font-bold text-gray-900 dark:text-gray-100">
                                <div className="flex items-center space-x-1.5">
                                  {isLatest && (
                                    <span className="bg-emerald-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase animate-pulse">
                                      Último
                                    </span>
                                  )}
                                  <span>
                                    {item.FechaEntregado 
                                      ? new Date(item.FechaEntregado).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }) + ' hs'
                                      : '-'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="font-bold text-gray-900 dark:text-gray-100">{item.AgenteNombre}</div>
                                <div className="text-[10px] text-gray-500 font-mono">DNI: {item.AgenteDNI}</div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300 font-medium">
                                {item.ServicioNombre}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 font-bold px-2 py-0.5 rounded-md mr-1.5">
                                  {item.TipoComida}
                                </span>
                                <span className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold px-2 py-0.5 rounded-md">
                                  {item.TipoDieta}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                                {item.EntregadoPor}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* BANDEJA CONTENT */}
      {activeTab === "Bandeja" && (() => {
        const isAuthExpired = (e: any) => {
          const fPedidoStr = e.FechaPedido ? e.FechaPedido.split('T')[0] : getTodayStr();
          if (fPedidoStr !== getTodayStr()) return false;

          const comida = (e.TipoComida || '').toLowerCase();
          if (comida === 'almuerzo') return isPastAuthAlmuerzo;
          if (comida === 'cena') return isPastAuthCena;
          return isPastAuthAlmuerzo || isPastAuthCena;
        };

        const getLimitHora = (e: any) => {
          const comida = (e.TipoComida || '').toLowerCase();
          if (comida === 'cena') return configAuthCena;
          return configAuthAlmuerzo;
        };

        const rawListToDisplay = 
          emgSubTab === "pendientes" ? emergencias :
          emgSubTab === "aprobadas" ? emergenciasAprobadas : emergenciasRechazadas;

        const listToDisplay = rawListToDisplay.filter(e => {
          const isNutricion = e.JustificacionSolicitud?.includes('[EMERGENCIA NUTRICIÓN / GERENCIA]');
          if (emgOrigenFiltro === 'nutricion') return isNutricion;
          if (emgOrigenFiltro === 'jefes') return !isNutricion;
          return true;
        });

        return (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50/50 dark:bg-gray-800/30 gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-2 text-orange-500" /> 
                  {emgSubTab === 'pendientes' ? 'Solicitudes Pendientes del Día' : emgSubTab === 'aprobadas' ? 'Solicitudes Aprobadas Hoy' : 'Solicitudes Rechazadas Hoy'}
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {emgSubTab === 'pendientes' ? 'Emergencias ingresadas para el día de hoy pendientes de autorización.' : 
                   emgSubTab === 'aprobadas' ? 'Emergencias autorizadas para hoy (puedes revertir la decisión antes del límite horario).' : 
                   'Emergencias rechazadas hoy (puedes revertir la decisión antes del límite horario).'}
                </p>
              </div>
              
              <div className="flex flex-wrap gap-2 items-center">
                {/* Subfiltro Origen Nutricion / Jefes */}
                <div className="flex bg-gray-200 dark:bg-gray-800 p-1 rounded-xl gap-1">
                  <button onClick={() => setEmgOrigenFiltro('todos')} className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${emgOrigenFiltro === 'todos' ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}>Todas</button>
                  <button onClick={() => setEmgOrigenFiltro('nutricion')} className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${emgOrigenFiltro === 'nutricion' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}>⚡ Nutrición/Gerencia</button>
                  <button onClick={() => setEmgOrigenFiltro('jefes')} className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${emgOrigenFiltro === 'jefes' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}>👤 Jefes de Servicio</button>
                </div>

                <div className="flex bg-gray-200 dark:bg-gray-800 p-1 rounded-xl gap-1">
                  <button
                    onClick={() => setEmgSubTab("pendientes")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center cursor-pointer ${
                      emgSubTab === "pendientes" 
                        ? 'bg-white dark:bg-gray-900 text-indigo-700 dark:text-indigo-300 shadow-sm' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 mr-1 text-orange-500" />
                    Pendientes ({emergencias.length})
                  </button>

                  <button
                    onClick={() => setEmgSubTab("aprobadas")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center cursor-pointer ${
                      emgSubTab === "aprobadas" 
                        ? 'bg-white dark:bg-gray-900 text-green-700 dark:text-green-300 shadow-sm' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                    }`}
                  >
                    <CheckCircle className="w-3.5 h-3.5 mr-1 text-green-500" />
                    Aprobadas ({emergenciasAprobadas.length})
                  </button>

                  <button
                    onClick={() => setEmgSubTab("rechazadas")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center cursor-pointer ${
                      emgSubTab === "rechazadas" 
                        ? 'bg-white dark:bg-gray-900 text-red-700 dark:text-red-300 shadow-sm' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                    }`}
                  >
                    <X className="w-3.5 h-3.5 mr-1 text-red-500" />
                    Rechazadas ({emergenciasRechazadas.length})
                  </button>
                </div>
              </div>
            </div>
            
            {listToDisplay.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center">
                <CheckCircle className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Sin solicitudes</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {emgSubTab === "pendientes" ? "No hay emergencias pendientes para el día de hoy." :
                   emgSubTab === "aprobadas" ? "No hay emergencias aprobadas para el día de hoy." :
                   "No hay emergencias rechazadas para el día de hoy."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-800">
                {listToDisplay.map(e => {
                  const isNutricion = e.JustificacionSolicitud?.includes('[EMERGENCIA NUTRICIÓN / GERENCIA]');
                  const nombreAgente = e.EmergenciaNombreCompleto
                    || e.Personal?.NombreCompleto
                    || `${e.EmergenciaNombre || ''} ${e.EmergenciaApellido || ''}`.trim()
                    || e.PersonalReemplazado?.NombreCompleto
                    || 'Agente';

                  const dniAgente = e.EmergenciaDNI
                    || e.Personal?.DNI
                    || e.PersonalReemplazado?.DNI
                    || '-';

                  const fechaPedidoStr = e.FechaPedido ? e.FechaPedido.split('T')[0].split('-').reverse().join('/') : '-';
                  const expired = isAuthExpired(e);
                  const limitHora = getLimitHora(e);

                  return (
                    <div key={e.Id} className={`p-6 transition-colors ${isNutricion ? 'bg-purple-50/40 dark:bg-purple-950/20 hover:bg-purple-50/70 dark:hover:bg-purple-950/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-6">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2 flex-wrap gap-y-1">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${
                              e.Estado === 'Aprobado' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' :
                              e.Estado === 'Rechazado' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400' :
                              'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400'
                            }`}>
                              {e.Estado.toUpperCase()}
                            </span>
                            <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 text-xs font-extrabold px-2.5 py-1 rounded-md flex items-center">
                              <Utensils className="w-3.5 h-3.5 mr-1 text-blue-600 dark:text-blue-400" />
                              {getServicioNombre(e)}
                            </span>
                            {isNutricion && (
                              <span className="bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300 text-xs font-bold px-2.5 py-1 rounded-md border border-purple-300 dark:border-purple-700 flex items-center">
                                ⚡ Nutrición / Gerencia (Auto-aprobada)
                              </span>
                            )}
                            <span className="text-xs text-gray-500 font-semibold">
                              Fecha: {fechaPedidoStr}
                            </span>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{nombreAgente}</h3>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                            <span className="font-semibold text-gray-900 dark:text-gray-200">Servicio:</span> <span className="font-extrabold text-indigo-600 dark:text-indigo-400">{getServicioNombre(e)}</span> • <span className="font-semibold text-gray-900 dark:text-gray-200">Agente:</span> <span className="font-bold text-gray-900 dark:text-gray-100">{nombreAgente}</span> • <span className="font-semibold text-gray-900 dark:text-gray-200">DNI:</span> {dniAgente} • <span className="font-semibold text-gray-900 dark:text-gray-200">Solicita:</span> {e.TipoComida} ({e.TipoDieta})
                          </p>
                          {e.PersonalReemplazado && (
                            <p className="text-xs text-blue-600 dark:text-blue-400 mb-1 font-medium">
                              Reemplaza a: {e.PersonalReemplazado.NombreCompleto} (DNI: {e.PersonalReemplazado.DNI})
                            </p>
                          )}
                          {e.JustificacionSolicitud && (
                            <div className="mt-3 bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm italic text-gray-700 dark:text-gray-300 relative">
                              <div className="absolute top-0 left-0 w-1 h-full bg-orange-400 rounded-l-xl"></div>
                              "{e.JustificacionSolicitud.replace(/\[SERVICIO:.*?\]/g, '').trim()}"
                            </div>
                          )}
                          {e.JustificacionResolucion && (
                            <div className="mt-2 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
                              <strong>Observación / Motivo:</strong> "{e.JustificacionResolucion}"
                            </div>
                          )}
                          {expired && (
                            <div className="mt-2.5 inline-flex items-center text-xs font-bold text-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800">
                              <Lock className="w-3.5 h-3.5 mr-1.5" /> Horario límite de autorización expirado ({limitHora} hs). No se pueden realizar cambios.
                            </div>
                          )}
                        </div>
                      
                        <div className="flex flex-col space-y-3 w-full md:w-80">
                          {emgSubTab === "pendientes" && (
                            <>
                              <textarea 
                                disabled={expired}
                                className="w-full text-sm border-gray-300 dark:border-gray-700 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-3 border transition-shadow disabled:opacity-50" 
                                placeholder="Motivo de rechazo (opcional al aprobar)..." 
                                rows={2}
                                value={resolucionTxt[e.Id] || ""}
                                onChange={(evt) => setResolucionTxt({...resolucionTxt, [e.Id]: evt.target.value})}
                              ></textarea>
                              <div className="flex space-x-3">
                                <button disabled={expired} onClick={() => resolveEmergency(e.Id, "Rechazado")} className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800 border border-red-300 dark:border-red-700/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 py-2.5 px-4 rounded-xl text-sm font-bold transition-all transform hover:scale-[1.02] active:scale-95 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                                  <X className="w-4 h-4 mr-1.5" /> Rechazar
                                </button>
                                <button disabled={expired} onClick={() => resolveEmergency(e.Id, "Aprobado")} className="flex-1 flex items-center justify-center bg-green-600 hover:bg-green-700 text-white py-2.5 px-4 rounded-xl text-sm font-bold transition-all transform hover:scale-[1.02] active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                                  <Check className="w-4 h-4 mr-1.5" /> Aprobar
                                </button>
                              </div>
                            </>
                          )}

                          {emgSubTab === "aprobadas" && (
                            <div className="flex flex-col space-y-2">
                              <button 
                                disabled={expired}
                                onClick={() => resolveEmergency(e.Id, "Pendiente")} 
                                className="w-full flex items-center justify-center bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/60 border border-amber-200 dark:border-amber-700/50 py-2.5 px-4 rounded-xl text-sm font-bold transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                              >
                                <RotateCcw className="w-4 h-4 mr-2" /> Revertir Aprobación
                              </button>
                            </div>
                          )}

                          {emgSubTab === "rechazadas" && (
                            <div className="flex flex-col space-y-2">
                              <button 
                                disabled={expired}
                                onClick={() => resolveEmergency(e.Id, "Pendiente")} 
                                className="w-full flex items-center justify-center bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/60 border border-amber-200 dark:border-amber-700/50 py-2.5 px-4 rounded-xl text-sm font-bold transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                              >
                                <RotateCcw className="w-4 h-4 mr-2" /> Revertir Rechazo
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* CREAR EMERGENCIA CONTENT (GERENCIA / ENCARGADO DE NUTRICIÓN) */}
      {activeTab === "CrearEmergencia" && (
        <div className="space-y-4">
          {/* BANNER DESTACADO PARA EMERGENCIA ANTICIPADA */}
          {gerEmgFecha !== getTodayStr() && (
            <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white px-6 py-4 rounded-2xl shadow-md flex items-center justify-between animate-in fade-in duration-300 border border-amber-300">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-white/20 rounded-xl shrink-0">
                  <Zap className="w-6 h-6 text-yellow-200" />
                </div>
                <div>
                  <h4 className="font-black text-sm uppercase tracking-wide flex items-center gap-2">
                    ⚡ CARGA DE EMERGENCIA ANTICIPADA DE GERENCIA / NUTRICIÓN
                  </h4>
                  <p className="text-xs text-amber-100 mt-0.5 font-medium">
                    Estás registrando una emergencia para la fecha futura <span className="font-black underline">{gerEmgFecha.split('-').reverse().join('/')}</span> ({fechasAnticipadas.find(f=>f.FechaHabilitadaStr===gerEmgFecha)?.Descripcion || 'Fecha Futura Autorizada'}).
                  </p>
                </div>
              </div>
              <span className="hidden sm:inline-block text-[11px] font-black bg-white/25 px-3.5 py-1.5 rounded-full uppercase border border-white/40 shrink-0">
                Emergencia Anticipada
              </span>
            </div>
          )}

          <div className={`rounded-2xl shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-300 p-6 flex flex-col gap-6 transition-all ${
            gerEmgFecha !== getTodayStr()
              ? 'bg-gradient-to-b from-amber-50/90 via-orange-50/40 to-white dark:from-amber-950/30 dark:via-orange-950/20 dark:to-gray-900 border-2 border-amber-400 dark:border-amber-700/60 shadow-lg'
              : 'bg-white dark:bg-gray-900 border border-purple-200 dark:border-purple-900/40'
          }`}>
          <div className="border-b border-gray-200 dark:border-gray-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
                <PlusCircle className="w-6 h-6 mr-2.5 text-purple-600 dark:text-purple-400" /> Cargar Pedido de Emergencia (Nutrición / Gerencia)
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Carga directa de emergencias para cualquier servicio del efector (fines de semana, feriados o imprevistos de guardia).</p>
            </div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-700 shrink-0">
              ⚡ Auto-Autorización Automática
            </span>
          </div>

          <div className="bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 p-4 rounded-xl text-xs sm:text-sm text-purple-900 dark:text-purple-300 flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-purple-600 dark:text-purple-400 mt-0.5" />
            <div>
              <strong>Control de Auditoría:</strong> Toda emergencia cargada desde esta solapa quedará registrada como <strong>Auto-Autorizada</strong> y se identificará automáticamente con el sello <code className="bg-purple-200 dark:bg-purple-900 px-1.5 py-0.5 rounded font-mono text-purple-900 dark:text-purple-200 text-xs">[EMERGENCIA NUTRICIÓN / GERENCIA]</code> para el filtrado de control de Gerencia.
            </div>
          </div>

          <form className="flex flex-col gap-6" onSubmit={submitGerenteEmergency}>
            {/* SERVICIO DESTINO CON BUSCADOR INCORPORADO */}
            <div className="bg-gray-50 dark:bg-gray-800/40 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <ServiceSearchableSelect
                options={servicios}
                selectedId={gerEmgServicioId}
                onSelect={id => {
                  setGerEmgServicioId(id);
                  setGerEmgReemplazaId("");
                }}
                label="1. Seleccionar Servicio de Destino (con Buscador)"
                placeholder="Escribe para buscar el servicio (ej. Guardia, Cirugía, Clínica...)"
                accentColor="purple"
                required
              />
            </div>

            {/* SELECTOR DE FECHA DE EMERGENCIA (HOY O FECHA ANTICIPADA) */}
            <div className={`p-4 rounded-xl border transition-all ${
              gerEmgFecha !== getTodayStr()
                ? 'bg-amber-100/70 dark:bg-amber-950/60 border-amber-400 dark:border-amber-700'
                : 'bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700'
            }`}>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Fecha del Pedido de Emergencia
                </label>
                {gerEmgFecha !== getTodayStr() && (
                  <span className="text-[10px] font-black uppercase text-amber-800 dark:text-amber-300 bg-amber-200 dark:bg-amber-900 px-2 py-0.5 rounded-md">
                    ⚡ Fecha Anticipada
                  </span>
                )}
              </div>
              <select
                value={gerEmgFecha}
                onChange={e => setGerEmgFecha(e.target.value)}
                className="w-full text-sm border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:border-purple-500 focus:ring-purple-500/50 px-3 py-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-bold"
              >
                <option value={getTodayStr()}>📍 Hoy ({getTodayStr().split('-').reverse().join('/')})</option>
                {fechasAnticipadas.map(f => (
                  <option key={f.Id} value={f.FechaHabilitadaStr}>
                    ⚡ {f.Descripcion || 'Carga Anticipada'} ({f.FechaHabilitadaStr.split('-').reverse().join('/')})
                  </option>
                ))}
              </select>
            </div>

            {/* TIPO DE SOLICITUD */}
            <div className="bg-gray-50 dark:bg-gray-800/40 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">2. Tipo de Solicitud</label>
              <div className="flex flex-wrap gap-5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="gerEmgTipo" 
                    value="extra" 
                    checked={gerEmgTipo === 'extra'} 
                    onChange={() => {
                      setGerEmgTipo('extra');
                      setGerEmgJustificacion("Carga de emergencia por Encargado de Nutrición / Gerencia en fin de semana o feriado");
                    }} 
                    className="accent-purple-600 w-4 h-4" 
                  /> 
                  <span className="text-sm font-semibold">Agregado Extra / Guardia</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="gerEmgTipo" 
                    value="reemplazo" 
                    checked={gerEmgTipo === 'reemplazo'} 
                    onChange={() => {
                      setGerEmgTipo('reemplazo');
                      setGerEmgJustificacion("por reemplazo de personal de turno");
                    }} 
                    className="accent-purple-600 w-4 h-4" 
                  /> 
                  <span className="text-sm font-semibold">Reemplazo de Personal</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="gerEmgTipo" 
                    value="reemplazo_excepcional" 
                    checked={gerEmgTipo === 'reemplazo_excepcional'} 
                    onChange={() => {
                      setGerEmgTipo('reemplazo_excepcional');
                      setGerEmgJustificacion("Reemplazo excepcional de última hora por Nutrición");
                    }} 
                    className="accent-purple-600 w-4 h-4" 
                  /> 
                  <span className="text-sm font-bold text-purple-700 dark:text-purple-400">⚡ Reemplazo Excepcional (Última Hora)</span>
                </label>
              </div>

              {/* Selector A quién reemplaza */}
              {(gerEmgTipo === 'reemplazo' || gerEmgTipo === 'reemplazo_excepcional') && (() => {
                const idsYaReemplazados = new Set(
                  emergenciasAprobadas
                    .concat(emergencias)
                    .filter(h => h.EmergenciaReemplazaId !== null && h.Estado !== 'Rechazado')
                    .map(h => h.EmergenciaReemplazaId)
                );

                const esInhabilitado = (p: any) => Boolean(
                  p.bajaProvisoriaHoy || p.bajaDefinitivaHoy || p.BajaProvisoriaFecha || p.bajaMotivo || p.BajaMotivo || p.Activo === false
                );

                const listaAMostrar = gerEmgStaffServicio.filter(p => esInhabilitado(p) && !idsYaReemplazados.has(p.Id));

                return (
                  <div className="mt-4">
                    <AgentSearchableSelect
                      options={listaAMostrar}
                      selectedId={gerEmgReemplazaId}
                      onSelect={setGerEmgReemplazaId}
                      label={`Seleccionar a quién reemplaza (Únicamente agentes inhabilitados/licencias - Servicio ${servicios.find(s=>s.Id===Number(gerEmgServicioId))?.Nombre || ''}):`}
                      placeholder="Buscar por nombre o DNI..."
                      accentColor="purple"
                      required
                    />
                    {listaAMostrar.length === 0 && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 font-semibold">
                        * No hay agentes inhabilitados ni con licencia pendientes de reemplazo en este servicio.
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* DATOS DEL AGENTE (Si es extra) */}
            {gerEmgTipo === 'extra' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-800/40 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Nombre Completo del Agente *</label>
                  <input 
                    type="text" 
                    required 
                    value={gerEmgNombre} 
                    onChange={e => setGerEmgNombre(e.target.value)} 
                    placeholder="Ej. Perez Juan" 
                    className="w-full text-sm border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:border-purple-500 focus:ring-purple-500/50 px-3 py-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">DNI *</label>
                  <input 
                    type="text" 
                    required 
                    value={gerEmgDni} 
                    onChange={e => setGerEmgDni(e.target.value)} 
                    placeholder="Sin puntos" 
                    className="w-full text-sm border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:border-purple-500 focus:ring-purple-500/50 px-3 py-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono" 
                  />
                </div>
              </div>
            )}

            {/* DATOS DE COMIDA Y DIETA */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 dark:bg-gray-800/40 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Comida Solicitada</label>
                <select 
                  value={gerEmgComida} 
                  onChange={e => setGerEmgComida(e.target.value)} 
                  className="w-full text-sm border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:border-purple-500 focus:ring-purple-500/50 px-3 py-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-semibold"
                >
                  <option value="Almuerzo">☀️ Almuerzo</option>
                  <option value="Cena">🌙 Cena</option>
                  <option value="Ambos">☀️🌙 Ambos (Almuerzo y Cena)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  {gerEmgComida === 'Ambos' ? 'Dieta para Almuerzo' : 'Tipo de Dieta'}
                </label>
                <select 
                  value={gerEmgDieta} 
                  onChange={e => setGerEmgDieta(e.target.value)} 
                  className="w-full text-sm border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:border-purple-500 focus:ring-purple-500/50 px-3 py-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-semibold"
                >
                  {dietasConfig.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {gerEmgComida === 'Ambos' && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Dieta para Cena</label>
                  <select 
                    value={gerEmgDietaCena} 
                    onChange={e => setGerEmgDietaCena(e.target.value)} 
                    className="w-full text-sm border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:border-purple-500 focus:ring-purple-500/50 px-3 py-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-semibold"
                  >
                    {dietasConfig.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* JUSTIFICACIÓN */}
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Justificación del Pedido *</label>
              <textarea 
                required 
                rows={2} 
                value={gerEmgJustificacion} 
                onChange={e => setGerEmgJustificacion(e.target.value)} 
                placeholder="Indique el motivo..." 
                className="w-full text-sm border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:border-purple-500 focus:ring-purple-500/50 px-3 py-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" 
              />
            </div>

            <div className="flex justify-end">
              <button 
                type="submit" 
                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold px-6 py-3 rounded-xl shadow-lg transition-all transform hover:scale-[1.02] active:scale-95 flex items-center cursor-pointer text-sm"
              >
                <Zap className="w-5 h-5 mr-2 text-yellow-300" /> Registrar y Auto-Autorizar Emergencia
              </button>
            </div>
          </form>
        </div>
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
                            <button
                              type="button"
                              onClick={() => renombrarServicioModal(s.Id, s.Nombre)}
                              className="p-1 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 rounded transition-colors"
                              title="Corregir/Renombrar Nombre de Servicio"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleAgentesServicio(s.Id)}
                              className={`text-[11px] px-2.5 py-0.5 rounded-full font-extrabold flex items-center transition-all shadow-sm cursor-pointer ${
                                openAgentesServicios[s.Id]
                                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                  : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800/60'
                              }`}
                              title="Clic para desplegar u ocultar agentes del servicio"
                            >
                              <Users className="w-3 h-3 mr-1" />
                              {(s.Personal?.length || s._count?.Personal || 0)} {(s.Personal?.length === 1 || s._count?.Personal === 1) ? 'Agente' : 'Agentes'}
                              {(s.Personal?.length > 0 || (s._count?.Personal && s._count.Personal > 0)) && (
                                openAgentesServicios[s.Id] ? (
                                  <ChevronUp className="w-3 h-3 ml-1" />
                                ) : (
                                  <ChevronDown className="w-3 h-3 ml-1" />
                                )
                              )}
                            </button>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${s.VoucherIndividual ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300'}`}>
                              Voucher {s.VoucherIndividual ? 'Individual' : 'Consolidado'}
                            </span>
                          </div>

                          {/* SECCION EXPANSIBLE DE AGENTES AL HACER CLIC EN LA PILDORA */}
                          {openAgentesServicios[s.Id] && (
                            <div className="mt-2.5 mb-3 p-3 bg-gray-50 dark:bg-gray-900/80 rounded-xl border border-gray-200 dark:border-gray-700 animate-in fade-in slide-in-from-top-1 duration-200">
                              <h5 className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center">
                                <Users className="w-3.5 h-3.5 mr-1.5 text-indigo-500" />
                                Agentes del servicio {s.Nombre} ({(s.Personal?.length || 0)}):
                              </h5>
                              {s.Personal && s.Personal.length > 0 ? (
                                <div className="divide-y divide-gray-200/60 dark:divide-gray-800 max-h-48 overflow-y-auto pr-1">
                                  {s.Personal.map((p: any) => (
                                    <div key={p.Id} className="py-1.5 flex justify-between items-center text-xs">
                                      <span className="font-semibold text-gray-800 dark:text-gray-200 flex items-center">
                                        <User className="w-3 h-3 mr-1.5 text-gray-400" />
                                        {p.NombreCompleto}
                                      </span>
                                      <div className="flex items-center space-x-2">
                                        <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                                          DNI: {p.DNI}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => cambiarServicioAgenteModal(p.Id, p.NombreCompleto, s.Id)}
                                          className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-800/60 rounded border border-indigo-200 dark:border-indigo-800 flex items-center text-[10px] font-bold transition-colors cursor-pointer"
                                          title="Cambiar de servicio a este agente"
                                        >
                                          <ArrowRightLeft className="w-3 h-3 mr-1" /> Mover Servicio
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400 dark:text-gray-500 italic">No hay agentes asignados en este servicio.</p>
                              )}
                            </div>
                          )}

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
              <button onClick={() => handleImprimirCocina('Almuerzo')} disabled={reportes.length === 0} className={`flex-1 sm:flex-none flex items-center justify-center px-3.5 py-2.5 rounded-lg shadow-sm font-bold transition-colors ${reportes.length === 0 ? 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-700 text-white'}`} title="Imprimir reporte de producción para Cocina (Almuerzo)">
                <Printer className="w-4 h-4 mr-1.5" /> Cocina Alm.
              </button>
              <button onClick={() => handleImprimirCocina('Cena')} disabled={reportes.length === 0} className={`flex-1 sm:flex-none flex items-center justify-center px-3.5 py-2.5 rounded-lg shadow-sm font-bold transition-colors ${reportes.length === 0 ? 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed' : 'bg-amber-700 hover:bg-amber-800 text-white'}`} title="Imprimir reporte de producción para Cocina (Cena)">
                <Printer className="w-4 h-4 mr-1.5" /> Cocina Cena
              </button>
              <button onClick={() => handleImprimirEntrega('Almuerzo')} disabled={reportes.length === 0} className={`flex-1 sm:flex-none flex items-center justify-center px-3.5 py-2.5 rounded-lg shadow-sm font-bold transition-colors ${reportes.length === 0 ? 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`} title="Imprimir planilla de Entrega para Almuerzo">
                <Printer className="w-4 h-4 mr-1.5" /> Entrega Alm.
              </button>
              <button onClick={() => handleImprimirEntrega('Cena')} disabled={reportes.length === 0} className={`flex-1 sm:flex-none flex items-center justify-center px-3.5 py-2.5 rounded-lg shadow-sm font-bold transition-colors ${reportes.length === 0 ? 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`} title="Imprimir planilla de Entrega para Cena">
                <Printer className="w-4 h-4 mr-1.5" /> Entrega Cena
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

              {/* SECCIÓN HABILITACIÓN CARGA ANTICIPADA (SÁBADOS, DOMINGOS Y FERIADOS) */}
              <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
                <div className="mb-4">
                  <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center">
                    <Zap className="w-5 h-5 mr-2 text-yellow-500 animate-pulse" /> Habilitación de Carga Anticipada (Fines de Semana y Feriados)
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Autoriza fechas futuras para que los Jefes de Servicio puedan cargar sus planillas de comida con antelación.
                  </p>
                </div>

                {/* Botones de acción rápida */}
                <div className="flex flex-wrap gap-3 mb-6 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 p-4 rounded-xl border border-amber-200 dark:border-amber-800/50">
                  <button
                    type="button"
                    onClick={() => habilitarFechaAnticipada(getNextSaturdayStr(), "Próximo Sábado")}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg shadow-sm transition-all flex items-center cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4 mr-1.5" /> Habilitar Próximo Sábado ({getNextSaturdayStr().split('-').reverse().join('/')})
                  </button>

                  <button
                    type="button"
                    onClick={() => habilitarFechaAnticipada(getNextSundayStr(), "Próximo Domingo")}
                    className="bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg shadow-sm transition-all flex items-center cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4 mr-1.5" /> Habilitar Próximo Domingo ({getNextSundayStr().split('-').reverse().join('/')})
                  </button>

                  {/* Picker personalizado de Feriados */}
                  <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto lg:ml-auto">
                    <input
                      type="date"
                      value={nuevaFechaAnticipada}
                      onChange={e => setNuevaFechaAnticipada(e.target.value)}
                      className="text-xs border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                    <input
                      type="text"
                      placeholder="Ej: Feriado Patrio"
                      value={descripcionAnticipada}
                      onChange={e => setDescripcionAnticipada(e.target.value)}
                      className="text-xs border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-40"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!nuevaFechaAnticipada) {
                          Swal.fire({ title: "Atención", text: "Por favor seleccione una fecha.", icon: "warning", background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#000' });
                          return;
                        }
                        habilitarFechaAnticipada(nuevaFechaAnticipada, descripcionAnticipada || "Feriado Autorizado");
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-sm transition-all flex items-center cursor-pointer"
                    >
                      <Plus className="w-4 h-4 mr-1" /> Habilitar Feriado
                    </button>
                  </div>
                </div>

                {/* Lista de Fechas Autorizadas */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Fechas Autorizadas Vigentes:</h4>
                  {fechasAnticipadas.length === 0 ? (
                    <div className="p-4 text-xs text-center text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800 italic">
                      No hay fechas anticipadas autorizadas actualmente. Usa los botones superiores para autorizar un fin de semana o feriado.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {fechasAnticipadas.map((f: any) => (
                        <div key={f.Id} className="flex items-center justify-between bg-amber-50/70 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-200 dark:border-amber-800/60 shadow-sm">
                          <div className="flex items-center space-x-3">
                            <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg text-amber-800 dark:text-amber-300 font-bold text-sm">
                              ⚡ {f.FechaHabilitadaStr.split('-').reverse().join('/')}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-gray-900 dark:text-gray-100">{f.Descripcion || 'Carga Anticipada'}</div>
                              <div className="text-[10px] text-gray-500 dark:text-gray-400">Autorizado por Gerencia</div>
                            </div>
                          </div>
                          <button
                            onClick={() => deshabilitarFechaAnticipada(f.Id)}
                            className="text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 p-1.5 rounded-lg transition-colors cursor-pointer"
                            title="Revocar / Deshabilitar esta fecha"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
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

      {/* AUDITORIA CONTENT */}
      {activeTab === "Auditoria" && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
          <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/50 dark:bg-gray-800/30">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
                <Shield className="w-5 h-5 mr-2 text-indigo-500" /> Auditoría de Jefes de Servicio
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Historial de acciones registradas por los encargados del efector ({hospitalName || 'Efector'})</p>
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
                  placeholder="Buscar acción, usuario, servicio..." 
                  className="block w-full pl-9 pr-3 py-2 text-sm border-gray-300 dark:border-gray-700 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500/50 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" 
                />
              </div>

              <button 
                onClick={fetchAuditoria} 
                className="p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl text-gray-700 dark:text-gray-300 font-bold transition-colors cursor-pointer"
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
                    : 'bg-green-600 hover:bg-green-700 text-white cursor-pointer'
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
                    : 'bg-red-600 hover:bg-red-700 text-white cursor-pointer'
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
                <p className="font-bold">No se encontraron registros de auditoría para Jefes de Servicio.</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5 text-left">Fecha y Hora</th>
                    <th className="px-6 py-3.5 text-left">Acción</th>
                    <th className="px-6 py-3.5 text-left">Jefe de Servicio</th>
                    <th className="px-6 py-3.5 text-left">Servicio</th>
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
                        {log.Usuario?.NombreCompleto && (
                          <span className="text-xs font-normal text-gray-500 ml-1">({log.Usuario.NombreCompleto})</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-700 dark:text-gray-300 font-bold">
                        {log.Usuario?.Servicio?.Nombre || '-'}
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

  const [openAgentesServicios, setOpenAgentesServicios] = useState<{ [servicioId: number]: boolean }>({});
  const toggleAgentesServicio = (id: number) => {
    setOpenAgentesServicios(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const [gerentes, setGerentes] = useState<any[]>([]);
  const [importando, setImportando] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importLogText, setImportLogText] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{
    total: number;
    created: number;
    updated: number;
    skipped: number;
  } | null>(null);

  const descargarLogImportacion = () => {
    if (!importLogText) return;
    const element = document.createElement("a");
    const file = new Blob([importLogText], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    const dateStr = new Date().toISOString().slice(0, 10) + '_' + new Date().toTimeString().slice(0, 8).replace(/:/g, '');
    element.download = `Log_Importacion_Personal_${dateStr}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

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
    setImportLogText(null);
    setImportSummary(null);

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
        let totalCreated = 0;
        let totalUpdated = 0;
        let totalSkipped = 0;
        let allDetails: any[] = [];
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
            totalImported += respData.count || 0;
            totalCreated += respData.createdCount || 0;
            totalUpdated += respData.updatedCount || 0;
            totalSkipped += respData.skippedCount || 0;
            if (respData.details && Array.isArray(respData.details)) {
              allDetails = allDetails.concat(respData.details);
            }
            setImportProgress(Math.min(100, Math.round(((i + chunk.length) / data.length) * 100)));
          } else {
            const errData = await res.json();
            Swal.fire('Error', errData.error || 'Error al importar', 'error');
            hasError = true;
            break;
          }
        }

        if (!hasError) {
          const nowStr = new Date().toLocaleString('es-AR');
          let logTxt = `================================================================================\n`;
          logTxt += `LOG DE AUDITORÍA - IMPORTACIÓN MASIVA DE PERSONAL (SisAR)\n`;
          logTxt += `================================================================================\n`;
          logTxt += `Fecha y Hora         : ${nowStr}\n`;
          logTxt += `Archivo Procesado   : ${file.name}\n`;
          logTxt += `Total Filas         : ${data.length}\n`;
          logTxt += `--------------------------------------------------------------------------------\n`;
          logTxt += `RESUMEN GENERAL DE OPERACIONES:\n`;
          logTxt += `  - Agentes Creados (Nuevos)        : ${totalCreated}\n`;
          logTxt += `  - Agentes Actualizados (Repetidos) : ${totalUpdated}\n`;
          logTxt += `  - Filas Omitidas / Inválidas      : ${totalSkipped}\n`;
          logTxt += `================================================================================\n\n`;
          logTxt += `DETALLE INDIVIDUAL DE ACCIONES TOMADAS POR FILA:\n`;
          logTxt += `--------------------------------------------------------------------------------\n`;

          allDetails.forEach((item, index) => {
            const numFila = index + 1;
            if (item.type === 'NUEVO') {
              logTxt += `[AGENTE NUEVO] Fila #${numFila} | DNI: ${item.dni} | Nombre: ${item.nombre} | Efector: ${item.efector} | Servicio: ${item.servicio} | Vianda: ${item.conVianda ? 'SI' : 'NO'} | Guardia24h: ${item.isGuardia24 ? 'SI' : 'NO'}\n`;
            } else if (item.type === 'ACTUALIZADO') {
              const cambiosStr = item.changes ? item.changes.join(' | ') : 'Sin cambios';
              logTxt += `[AGENTE REPETIDO / ACTUALIZADO] Fila #${numFila} | DNI: ${item.dni} | Nombre: ${item.nombre} | Efector: ${item.efector} | Servicio: ${item.servicio} | Modificaciones: [${cambiosStr}]\n`;
            } else if (item.type === 'OMITIDO') {
              logTxt += `[FILA OMITIDA] Fila #${numFila} | Razón: ${item.reason || 'Sin datos mínimos'}\n`;
            }
          });

          logTxt += `\n================================================================================\n`;
          logTxt += `FIN DEL REPORT DE IMPORTACIÓN - SISAR\n`;
          logTxt += `================================================================================\n`;

          setImportLogText(logTxt);
          setImportSummary({
            total: data.length,
            created: totalCreated,
            updated: totalUpdated,
            skipped: totalSkipped
          });

          Swal.fire({
            title: '¡Importación Finalizada!',
            html: `
              <div class="text-left text-sm space-y-2">
                <p>Se procesó el archivo Excel con éxito:</p>
                <ul class="list-disc pl-5 font-semibold">
                  <li class="text-green-600">Nuevos Agentes Creados: <strong>${totalCreated}</strong></li>
                  <li class="text-amber-600">Agentes Repetidos / Actualizados: <strong>${totalUpdated}</strong></li>
                  ${totalSkipped > 0 ? `<li class="text-red-600">Filas Omitidas: <strong>${totalSkipped}</strong></li>` : ''}
                </ul>
                <p class="text-xs text-gray-500 mt-2">Se ha generado el reporte de log detallado (.txt). Puedes descargarlo abajo.</p>
              </div>
            `,
            icon: 'success'
          });

          fetchHospitales();
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
                          <div className="p-3 bg-gray-50/50 dark:bg-gray-800/30 rounded-xl border border-gray-100 dark:border-gray-800 flex flex-col gap-2.5 max-h-56 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200">
                            {h.Servicios && h.Servicios.length > 0 ? (
                              h.Servicios.map((s: any) => {
                                const cantAgentes = s.Personal?.length || 0;
                                return (
                                  <div key={s.Id} className="bg-white dark:bg-gray-800 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col gap-1.5 shadow-sm">
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold text-xs text-indigo-700 dark:text-indigo-300 flex items-center">
                                        <Utensils className="w-3 h-3 mr-1 text-indigo-500" />
                                        {s.Nombre}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => toggleAgentesServicio(s.Id)}
                                        className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold flex items-center transition-all cursor-pointer ${
                                          openAgentesServicios[s.Id]
                                            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                            : 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 hover:bg-indigo-200 dark:hover:bg-indigo-800/60'
                                        }`}
                                        title="Clic para desplegar u ocultar agentes"
                                      >
                                        <Users className="w-3 h-3 mr-1" />
                                        {cantAgentes} {cantAgentes === 1 ? 'agente' : 'agentes'}
                                        {cantAgentes > 0 && (
                                          openAgentesServicios[s.Id] ? (
                                            <ChevronUp className="w-3 h-3 ml-1" />
                                          ) : (
                                            <ChevronDown className="w-3 h-3 ml-1" />
                                          )
                                        )}
                                      </button>
                                    </div>
                                    {openAgentesServicios[s.Id] && (
                                      <div className="mt-1 p-2 bg-gray-50 dark:bg-gray-900/80 rounded-lg border border-gray-200 dark:border-gray-700 animate-in fade-in slide-in-from-top-1 duration-200">
                                        <h5 className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex items-center">
                                          <Users className="w-3 h-3 mr-1 text-indigo-500" />
                                          Integrantes ({cantAgentes}):
                                        </h5>
                                        {cantAgentes > 0 ? (
                                          <div className="divide-y divide-gray-200/60 dark:divide-gray-800 max-h-40 overflow-y-auto pr-1">
                                            {s.Personal.map((p: any) => (
                                              <div key={p.Id} className="py-1 flex justify-between items-center text-[11px]">
                                                <span className="font-semibold text-gray-800 dark:text-gray-200 flex items-center truncate">
                                                  <User className="w-2.5 h-2.5 mr-1 text-gray-400 flex-shrink-0" />
                                                  {p.NombreCompleto}
                                                </span>
                                                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono ml-2">
                                                  DNI: {p.DNI}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <p className="text-[10px] text-gray-400 dark:text-gray-500 italic">Sin agentes en este servicio</p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
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

          {/* INFORME Y DESCARGA DE LOG DE AUDITORÍA DE IMPORTACIÓN */}
          {importLogText && importSummary && (
            <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-800 animate-in fade-in zoom-in-95 duration-300">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                <div>
                  <h3 className="text-base font-extrabold text-gray-900 dark:text-gray-100 flex items-center">
                    <FileText className="w-5 h-5 mr-2 text-indigo-500" />
                    Resultado y Auditoría de la Última Importación
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Detalle de agentes creados, repetidos/actualizados y campos modificados.
                  </p>
                </div>

                <button
                  onClick={descargarLogImportacion}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-md transition-all flex items-center cursor-pointer"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar Log de Auditoría (.txt)
                </button>
              </div>

              {/* RESUMEN DE BADGES */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
                <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-3.5 rounded-xl">
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">Total Filas</span>
                  <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">{importSummary.total}</div>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3.5 rounded-xl">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Nuevos Creados</span>
                  <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-1">{importSummary.created}</div>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3.5 rounded-xl">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">Repetidos / Actualizados</span>
                  <div className="text-2xl font-black text-amber-700 dark:text-amber-400 mt-1">{importSummary.updated}</div>
                </div>
                <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 p-3.5 rounded-xl">
                  <span className="text-[10px] font-black uppercase tracking-wider text-red-600 dark:text-red-400">Filas Omitidas</span>
                  <div className="text-2xl font-black text-red-700 dark:text-red-400 mt-1">{importSummary.skipped}</div>
                </div>
              </div>

              {/* CONSOLA PREVISUALIZADORA DE LOG */}
              <div className="relative">
                <div className="bg-gray-900 text-emerald-400 p-4 rounded-2xl font-mono text-xs max-h-80 overflow-y-auto shadow-inner border border-gray-800 whitespace-pre-wrap leading-relaxed">
                  {importLogText}
                </div>
              </div>
            </div>
          )}
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
