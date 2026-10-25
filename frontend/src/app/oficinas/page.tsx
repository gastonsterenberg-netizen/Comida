"use client";

import React, { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import {
  Utensils,
  Building,
  User,
  Sun,
  Moon,
  LogOut,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  X
} from "lucide-react";

interface Empleado {
  dni: string;
  nombre: string;
  hospitalId: number;
  hospitalNombre: string;
  servicioId: number | null;
  servicioNombre: string;
  limiteAlmuerzo: string;
}

interface PlatoOpcion {
  Id: number;
  TipoPlato: "PLATO_DEL_DIA" | "PRINCIPAL";
  NumeroOpcion: number;
  NombrePlato: string;
  PermiteGuarnicion: boolean;
  Descripcion?: string;
}

interface Guarnicion {
  Id: number;
  NombreGuarnicion: string;
}

interface PedidoExistente {
  id: number;
  fecha: string;
  estado: string;
  platoOpcionId: number;
  nombrePlato: string;
  guarnicionId: number | null;
  nombreGuarnicion: string | null;
  observaciones?: string;
}

export default function OficinasPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Auth state
  const [token, setToken] = useState<string | null>(null);
  const [empleado, setEmpleado] = useState<Empleado | null>(null);
  const [dniInput, setDniInput] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [nuevoPinInput, setNuevoPinInput] = useState("");
  const [showNuevoPin, setShowNuevoPin] = useState(false);
  const [requiereConfigPin, setRequiereConfigPin] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Date state
  const getTomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  };

  const formatDateDMY = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const [y, m, d] = parts;
      return `${d}/${m}/${y}`;
    }
    return dateStr;
  };

  const [fechaSeleccionada, setFechaSeleccionada] = useState(getTomorrowStr());

  // Menu & Order state
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [platosDelDia, setPlatosDelDia] = useState<PlatoOpcion[]>([]);
  const [principales, setPrincipales] = useState<PlatoOpcion[]>([]);
  const [guarniciones, setGuarniciones] = useState<Guarnicion[]>([]);
  const [pedidoExistente, setPedidoExistente] = useState<PedidoExistente | null>(null);
  const [limiteAlmuerzo, setLimiteAlmuerzo] = useState("10:30");
  const [dentroDeHorario, setDentroDeHorario] = useState(true);

  // Selection state
  const [selectedPlatoId, setSelectedPlatoId] = useState<number | null>(null);
  const [selectedGuarnicionId, setSelectedGuarnicionId] = useState<number | null>(null);
  const [observacionesInput, setObservacionesInput] = useState("");
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    setMounted(true);
    const savedToken = localStorage.getItem("oficina_empleado_token");
    const savedEmp = localStorage.getItem("oficina_empleado_data");
    if (savedToken && savedEmp) {
      try {
        setToken(savedToken);
        setEmpleado(JSON.parse(savedEmp));
      } catch (e) {
        localStorage.removeItem("oficina_empleado_token");
        localStorage.removeItem("oficina_empleado_data");
      }
    }
  }, []);

  useEffect(() => {
    if (token) {
      cargarMenu();
    }
  }, [token, fechaSeleccionada]);

  // 1. Employee Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      const res = await fetch("/api/oficinas/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dni: dniInput.trim(),
          pin: pinInput.trim(),
          nuevoPin: nuevoPinInput.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || "Error al ingresar. Verifique sus datos.");
        setAuthLoading(false);
        return;
      }

      if (data.requiereConfigurarPin) {
        setRequiereConfigPin(true);
        setAuthError("");
        setAuthLoading(false);
        return;
      }

      setToken(data.token);
      setEmpleado(data.empleado);
      setLimiteAlmuerzo(data.empleado.limiteAlmuerzo || "10:30");
      localStorage.setItem("oficina_empleado_token", data.token);
      localStorage.setItem("oficina_empleado_data", JSON.stringify(data.empleado));
      setAuthLoading(false);
      setRequiereConfigPin(false);
      setPinInput("");
      setNuevoPinInput("");
    } catch (err: any) {
      setAuthError("Error de conexión al servidor.");
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setEmpleado(null);
    setPedidoExistente(null);
    setSelectedPlatoId(null);
    setSelectedGuarnicionId(null);
    localStorage.removeItem("oficina_empleado_token");
    localStorage.removeItem("oficina_empleado_data");
  };

  const quickLogin = (dni: string, pin: string) => {
    setDniInput(dni);
    setPinInput(pin);
    setRequiereConfigPin(false);
    setAuthError("");
  };

  // 2. Fetch Menu & Order
  const cargarMenu = async () => {
    if (!token) return;
    setLoadingMenu(true);
    try {
      const res = await fetch(`/api/oficinas/menu?fecha=${fechaSeleccionada}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (res.ok) {
        setPlatosDelDia(data.platosDelDia || []);
        setPrincipales(data.principales || []);
        setGuarniciones(data.guarniciones || []);
        setLimiteAlmuerzo(data.oficina?.limiteAlmuerzo || "10:30");
        setDentroDeHorario(data.oficina?.dentroDeHorario ?? true);

        if (data.pedidoExistente) {
          setPedidoExistente(data.pedidoExistente);
          setSelectedPlatoId(data.pedidoExistente.platoOpcionId);
          setSelectedGuarnicionId(data.pedidoExistente.guarnicionId);
          setObservacionesInput(data.pedidoExistente.observaciones || "");
        } else {
          setPedidoExistente(null);
          setSelectedPlatoId(null);
          setSelectedGuarnicionId(null);
          setObservacionesInput("");
        }
      } else {
        if (res.status === 401) {
          handleLogout();
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMenu(false);
    }
  };

  // 3. Confirm Order
  const handleGuardarPedido = async () => {
    if (!token || !selectedPlatoId) return;

    const plato = [...platosDelDia, ...principales].find((p) => p.Id === selectedPlatoId);
    if (!plato) return;

    if (plato.PermiteGuarnicion && !selectedGuarnicionId) {
      alert("Por favor selecciona una guarnición para acompañar tu plato principal.");
      return;
    }

    setOrderSubmitting(true);
    setSuccessMessage("");

    try {
      const res = await fetch("/api/oficinas/pedidos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fecha: fechaSeleccionada,
          platoOpcionId: selectedPlatoId,
          guarnicionId: selectedGuarnicionId || undefined,
          observaciones: observacionesInput.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccessMessage("¡Tu vianda ha sido confirmada con éxito!");
        cargarMenu();
      } else {
        alert(data.error || "No se pudo confirmar el pedido.");
      }
    } catch (err) {
      alert("Error de conexión al registrar el pedido.");
    } finally {
      setOrderSubmitting(false);
    }
  };

  // 4. Cancel Order
  const handleCancelarPedido = async () => {
    if (!token || !pedidoExistente) return;
    if (!confirm("¿Estás seguro de cancelar tu vianda para esta fecha?")) return;

    try {
      const res = await fetch("/api/oficinas/pedidos", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fecha: fechaSeleccionada }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccessMessage("Tu vianda ha sido cancelada.");
        cargarMenu();
      } else {
        alert(data.error || "No se pudo cancelar el pedido.");
      }
    } catch (err) {
      alert("Error de conexión al cancelar el pedido.");
    }
  };

  const platoSeleccionadoObj = [...platosDelDia, ...principales].find((p) => p.Id === selectedPlatoId);

  // =========================================================================
  // SI NO ESTÁ LOGUEADO: PANTALLA DE LOGIN 100% IDÉNTICA A SISAR
  // =========================================================================
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-50 via-gray-50 to-white dark:from-gray-900 dark:via-gray-950 dark:to-black relative p-4 transition-colors duration-300">
        {/* Botón Flotante de Tema en la esquina superior derecha */}
        {mounted && (
          <div className="absolute top-4 right-4 z-50">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-2.5 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm focus:outline-none"
              title="Cambiar tema claro / oscuro"
            >
              {theme === "dark" ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-indigo-500" />}
            </button>
          </div>
        )}

        {/* Tarjeta de Login Idéntica a SisAR */}
        <div className="w-full max-w-md p-8 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 dark:border-gray-800/50 animate-in zoom-in-95 duration-500">
          <div className="flex flex-col items-center mb-8">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-3 rounded-2xl shadow-lg mb-4">
              <Utensils className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
              SisAR
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium text-center">
              Portal de Viandas • Autoservicio de Empleados
            </p>
            <span className="mt-2 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              Casa Central - SIPROSA
            </span>
          </div>

          {authError && (
            <div className="mb-6 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-lg flex items-center">
              <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" /> {authError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Número de DNI
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Ingrese su DNI (ej: 40111222)"
                  value={dniInput}
                  onChange={(e) => setDniInput(e.target.value)}
                  required
                  autoFocus
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-shadow"
                />
              </div>
            </div>

            {!requiereConfigPin ? (
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  PIN de 4 dígitos
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type={showPin ? "text" : "password"}
                    maxLength={4}
                    placeholder="••••"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    required
                    className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-shadow tracking-widest font-mono text-center text-lg"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors focus:outline-none cursor-pointer"
                    title={showPin ? "Ocultar PIN" : "Mostrar PIN"}
                  >
                    {showPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl space-y-2">
                <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">
                  🌟 ¡Primer ingreso! Define un PIN de 4 dígitos para tus pedidos:
                </p>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type={showNuevoPin ? "text" : "password"}
                    maxLength={4}
                    placeholder="Define 4 números (ej: 1234)"
                    value={nuevoPinInput}
                    onChange={(e) => setNuevoPinInput(e.target.value)}
                    required
                    className="block w-full pl-10 pr-10 py-2.5 border border-blue-300 dark:border-blue-700 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 tracking-widest font-mono text-center text-lg"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNuevoPin(!showNuevoPin)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus:outline-none cursor-pointer"
                  >
                    {showNuevoPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-md text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all transform hover:scale-[1.02] active:scale-95 cursor-pointer"
            >
              {authLoading
                ? "Autenticando..."
                : requiereConfigPin
                ? "Guardar PIN e Ingresar"
                : "Iniciar Sesión"}
            </button>
          </form>

          {/* Accesos rápidos de prueba */}
          <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 text-left">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              ⚡ Acceso Rápido para Demostración:
            </p>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => quickLogin("40111222", "1234")}
                className="text-left text-xs p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 hover:text-blue-700 dark:hover:text-blue-300 border border-gray-200 dark:border-gray-700 font-medium transition cursor-pointer"
              >
                👤 <strong>Juan Pérez</strong> (Piso 3 - Sistemas) • DNI: 40111222 • PIN: 1234
              </button>
              <button
                type="button"
                onClick={() => quickLogin("40333444", "4321")}
                className="text-left text-xs p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 hover:text-blue-700 dark:hover:text-blue-300 border border-gray-200 dark:border-gray-700 font-medium transition cursor-pointer"
              >
                👤 <strong>María González</strong> (Piso 3 - Soporte) • DNI: 40333444 • PIN: 4321
              </button>
              <button
                type="button"
                onClick={() => quickLogin("40555666", "1111")}
                className="text-left text-xs p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 hover:text-blue-700 dark:hover:text-blue-300 border border-gray-200 dark:border-gray-700 font-medium transition cursor-pointer"
              >
                👤 <strong>Carlos Benítez</strong> (Piso 2 - Admin) • DNI: 40555666 • PIN: 1111
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VISTA PRINCIPAL CON ENCABEZADO IDÉNTICO A SISAR HOSPITALARIO
  // =========================================================================
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans transition-colors duration-300">
      <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg shadow-sm border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo SisAR + Título del Módulo */}
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 rounded-xl shadow-md">
              <Utensils className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
                SisAR - Sistema de Administración de Raciones
              </h1>
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 leading-none">
                Módulo Oficinas Públicas • Portal de Autoservicio
              </p>
            </div>
          </div>

          {/* Bloque Central y Derecho: Horario Límite + Entidad + Servicio + Usuario + Tema */}
          <div className="flex items-center space-x-4">
            {/* Hora de cierre en el medio */}
            <div className="hidden md:flex flex-col text-xs border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 px-3 py-1.5 rounded-r-lg">
              <div className="font-bold mb-0.5">Límite Pedido</div>
              <div>Alm: {limiteAlmuerzo} hs</div>
            </div>

            {/* Ficha de Usuario / Entidad / Servicio */}
            <div className="flex items-center space-x-3 bg-gray-100 dark:bg-gray-800 px-4 py-2 rounded-2xl border border-gray-200 dark:border-gray-700">
              <Building className="w-4 h-4 text-indigo-500 hidden md:block flex-shrink-0" />
              <div className="hidden md:flex flex-col border-r border-gray-300 dark:border-gray-600 pr-3 mr-1 text-left justify-center">
                <span className="text-xs font-bold text-gray-800 dark:text-gray-200 leading-tight" title="Entidad / Oficina">
                  {empleado?.hospitalNombre || "Casa Central - SIPROSA"}
                </span>
                <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 leading-tight mt-0.5" title="Servicio / Sección">
                  {empleado?.servicioNombre || "Autoservicio Personal"}
                </span>
              </div>

              <User className="w-4 h-4 text-gray-500 dark:text-gray-400 ml-2" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {empleado?.nombre ? `${empleado.nombre} (Empleado)` : "Sin sesión"}
              </span>

              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-2"></div>

              {/* Botón Claro / Oscuro */}
              {mounted && (
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="p-1 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors focus:outline-none"
                  title="Cambiar tema claro / oscuro"
                >
                  {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
              )}

              {/* Botón Logout */}
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

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
        {/* Barra Operativa: Selector de Fecha y Estado de Horario */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Fecha de Vianda:</span>
            <input
              type="date"
              value={fechaSeleccionada}
              onChange={(e) => setFechaSeleccionada(e.target.value)}
              className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2 text-xs md:text-sm font-medium text-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/40">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>Horario límite de pedido para el día:</span>
            <strong className="font-bold">{limiteAlmuerzo} hs</strong>
          </div>
        </div>

        <div className="space-y-6">
          {/* Mensaje de Éxito */}
          {successMessage && (
            <div className="bg-emerald-600 text-white p-4 rounded-2xl shadow-lg shadow-emerald-600/20 font-bold flex items-center justify-between animate-in fade-in">
              <span className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5" /> {successMessage}
              </span>
              <button onClick={() => setSuccessMessage("")} className="text-white/80 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Banner de Vianda Ya Confirmada */}
          {pedidoExistente && (
            <div className="bg-gradient-to-br from-indigo-700 to-blue-800 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                    ✓ Vianda Ya Confirmada para esta Fecha
                  </span>
                  <h3 className="text-2xl font-black mt-2">{pedidoExistente.nombrePlato}</h3>
                  {pedidoExistente.nombreGuarnicion && (
                    <p className="text-indigo-200 text-sm mt-0.5">
                      🥗 Guarnición elegida: <strong>{pedidoExistente.nombreGuarnicion}</strong>
                    </p>
                  )}
                  {pedidoExistente.observaciones && (
                    <p className="text-indigo-200 text-xs mt-1 italic">
                      Observación: &ldquo;{pedidoExistente.observaciones}&rdquo;
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCancelarPedido}
                    className="bg-white/10 hover:bg-red-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl border border-white/20 transition"
                  >
                    Cancelar Vianda
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Selector de Platos */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-200 dark:border-gray-800 space-y-8">
            <div>
              <h3 className="text-xl font-black text-gray-800 dark:text-gray-100 flex items-center gap-2">
                🍽️ Elige tu Vianda para el {formatDateDMY(fechaSeleccionada)}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Puedes optar por un plato completo cerrado del día, o armar tu combinación eligiendo plato principal + guarnición.
              </p>
            </div>

            {loadingMenu ? (
              <div className="py-12 text-center text-gray-400">Cargando opciones de viandas...</div>
            ) : (
              <>
                {/* OPCIÓN A: PLATOS CERRADOS DEL DÍA */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 text-xs font-bold flex items-center justify-center">
                      A
                    </span>
                    <h4 className="font-bold text-gray-800 dark:text-gray-200 text-base">
                      Platos del Día / Menú Completo (Cerrados)
                    </h4>
                    <span className="text-xs text-gray-400 font-normal">
                      (No requieren guarnición adicional)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {platosDelDia.map((p) => {
                      const isSelected = selectedPlatoId === p.Id;
                      return (
                        <div
                          key={p.Id}
                          onClick={() => {
                            setSelectedPlatoId(p.Id);
                            setSelectedGuarnicionId(null);
                          }}
                          className={`cursor-pointer rounded-2xl p-5 border-2 transition relative ${
                            isSelected
                              ? "border-blue-600 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 shadow-md ring-2 ring-blue-600/20"
                              : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800"
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                                Opción #{p.NumeroOpcion}
                              </span>
                              <h5 className="text-lg font-bold text-gray-800 dark:text-gray-100 mt-1">{p.NombrePlato}</h5>
                              {p.Descripcion && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                                  {p.Descripcion}
                                </p>
                              )}
                            </div>
                            <div
                              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${
                                isSelected
                                  ? "border-blue-600 bg-blue-600 text-white"
                                  : "border-gray-300 dark:border-gray-600"
                              }`}
                            >
                              {isSelected && "✓"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* OPCIÓN B: MENÚ PARA ARMAR */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 text-xs font-bold flex items-center justify-center">
                      B
                    </span>
                    <h4 className="font-bold text-gray-800 dark:text-gray-200 text-base">
                      Menú para Armar (Plato Principal + Guarnición)
                    </h4>
                    <span className="text-xs text-gray-400 font-normal">
                      (Elige 1 principal y 1 acompañamiento)
                    </span>
                  </div>

                  {/* Paso 1: Principales */}
                  <div className="mb-4">
                    <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                      Paso 1: Elige tu Plato Principal
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {principales.map((p) => {
                        const isSelected = selectedPlatoId === p.Id;
                        return (
                          <div
                            key={p.Id}
                            onClick={() => {
                              setSelectedPlatoId(p.Id);
                            }}
                            className={`cursor-pointer rounded-2xl p-5 border-2 transition relative ${
                              isSelected
                                ? "border-indigo-600 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 shadow-md ring-2 ring-indigo-600/20"
                                : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800"
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">
                                  Opción #{p.NumeroOpcion}
                                </span>
                                <h5 className="text-lg font-bold text-gray-800 dark:text-gray-100 mt-1">{p.NombrePlato}</h5>
                                {p.Descripcion && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                                    {p.Descripcion}
                                  </p>
                                )}
                              </div>
                              <div
                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${
                                  isSelected
                                    ? "border-indigo-600 bg-indigo-600 text-white"
                                    : "border-gray-300 dark:border-gray-600"
                                }`}
                              >
                                {isSelected && "✓"}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Paso 2: Guarniciones */}
                  {platoSeleccionadoObj?.PermiteGuarnicion && (
                    <div className="mt-6 p-5 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-200 dark:border-indigo-900/40 animate-in fade-in">
                      <p className="text-xs font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <span>🥗</span> Paso 2: Elige tu Guarnición para {platoSeleccionadoObj.NombrePlato}
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {guarniciones.map((g) => {
                          const isGSelected = selectedGuarnicionId === g.Id;
                          return (
                            <button
                              key={g.Id}
                              type="button"
                              onClick={() => setSelectedGuarnicionId(g.Id)}
                              className={`p-3.5 rounded-xl border-2 text-left font-bold text-sm transition flex flex-col justify-between h-20 ${
                                isGSelected
                                  ? "border-indigo-600 bg-indigo-600 text-white shadow-md"
                                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:border-indigo-300 dark:hover:border-indigo-700"
                              }`}
                            >
                              <span className="line-clamp-2">{g.NombreGuarnicion}</span>
                              <span className="text-xs font-normal opacity-80 self-end">
                                {isGSelected ? "✓ Elegido" : "+ Elegir"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Aclaraciones y Confirmación */}
                <div className="pt-6 border-t border-gray-100 dark:border-gray-800 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                      Aclaraciones u Observaciones (Opcional):
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Sin sal, con limón extra, etc."
                      value={observacionesInput}
                      onChange={(e) => setObservacionesInput(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={
                      !selectedPlatoId ||
                      (platoSeleccionadoObj?.PermiteGuarnicion && !selectedGuarnicionId) ||
                      orderSubmitting
                    }
                    onClick={handleGuardarPedido}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-base font-black py-4 rounded-2xl shadow-xl shadow-blue-600/25 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {orderSubmitting ? "Guardando pedido..." : "✅ CONFIRMAR MI VIANDA"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
