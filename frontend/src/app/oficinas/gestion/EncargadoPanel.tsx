"use client";

import React, { useState, useEffect } from "react";
import {
  Calendar,
  RefreshCw,
  Plus,
  Trash2,
  Printer,
  Share2,
  CheckCircle,
  AlertTriangle,
  Clock,
  Utensils,
  Building,
  Users
} from "lucide-react";
import Swal from "sweetalert2";

export interface EncargadoPanelProps {
  token: string | null;
  hospitalName?: string | null;
  username?: string | null;
}

interface PedidoRecibido {
  pedidoId: number;
  dni: string;
  nombreCompleto: string;
  sector: string;
  plato: string;
  guarnicion?: string | null;
  observaciones?: string;
  hora: string;
}

interface EmpleadoPendiente {
  dni: string;
  nombreCompleto: string;
  sector: string;
}

interface PlatoConteo {
  plato: string;
  cantidad: number;
}

interface SectorConteo {
  sector: string;
  cantidad: number;
}

interface MonitoreoData {
  oficina: {
    id: number;
    nombre: string;
    limiteAlmuerzo: string;
    proveedorNombre: string;
    proveedorTelefono: string;
  };
  fecha: string;
  totalHabilitados: number;
  totalPedidos: number;
  totalPendientes: number;
  porcentajeCompletado: number;
  pedidosRecibidos: PedidoRecibido[];
  pendientes: EmpleadoPendiente[];
  conteoPlatos: PlatoConteo[];
  conteoSectores: SectorConteo[];
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

export default function EncargadoPanel({ token, hospitalName, username }: EncargadoPanelProps) {
  // Navigation / Tabs
  const [tabActual, setTabActual] = useState<"MONITOREO" | "MENU" | "REMITO">("MONITOREO");

  // Date State
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

  // Data State
  const [loadingData, setLoadingData] = useState(false);
  const [monitoreo, setMonitoreo] = useState<MonitoreoData | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Menu Management State
  const [platosDelDia, setPlatosDelDia] = useState<PlatoOpcion[]>([]);
  const [principales, setPrincipales] = useState<PlatoOpcion[]>([]);
  const [guarniciones, setGuarniciones] = useState<Guarnicion[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [nuevoPlato, setNuevoPlato] = useState({
    nombre: "",
    descripcion: "",
    tipoPlato: "PLATO_DEL_DIA",
    permiteGuarnicion: false,
  });
  const [nuevaGuarnicion, setNuevaGuarnicion] = useState("");
  const [menuMensaje, setMenuMensaje] = useState("");

  // WhatsApp copied state
  const [copiadoWhatsapp, setCopiadoWhatsapp] = useState(false);

  // 1. Fetch Live Monitoring Data
  const cargarDatosMonitoreo = async (silent = false) => {
    if (!token) return;
    if (!silent) setLoadingData(true);
    try {
      const res = await fetch(`/api/oficinas/admin/monitoreo?fecha=${fechaSeleccionada}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setMonitoreo(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoadingData(false);
    }
  };

  // 2. Fetch Admin Menu
  const cargarMenuAdmin = async () => {
    if (!token) return;
    setMenuLoading(true);
    try {
      const res = await fetch(`/api/oficinas/admin/menu?fecha=${fechaSeleccionada}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setPlatosDelDia(data.platosDelDia || []);
        setPrincipales(data.principales || []);
        setGuarniciones(data.guarniciones || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setMenuLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      cargarDatosMonitoreo();
      cargarMenuAdmin();
    }
  }, [token, fechaSeleccionada]);

  // Auto-refresh interval (15s) for live monitoring
  useEffect(() => {
    if (!token || !autoRefresh || tabActual !== "MONITOREO") return;
    const interval = setInterval(() => {
      cargarDatosMonitoreo(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [token, fechaSeleccionada, autoRefresh, tabActual]);

  // 3. Add Dish Option
  const handleCrearPlato = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !nuevoPlato.nombre.trim()) return;

    setMenuMensaje("");
    try {
      const nextNumero =
        nuevoPlato.tipoPlato === "PLATO_DEL_DIA"
          ? platosDelDia.length + 1
          : principales.length + 1;

      const res = await fetch("/api/oficinas/admin/menu/opcion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fecha: fechaSeleccionada,
          tipoPlato: nuevoPlato.tipoPlato,
          numeroOpcion: nextNumero,
          nombrePlato: nuevoPlato.nombre.trim(),
          permiteGuarnicion: nuevoPlato.tipoPlato === "PRINCIPAL" ? true : false,
          descripcion: nuevoPlato.descripcion.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setMenuMensaje("¡Plato agregado exitosamente al menú!");
        setNuevoPlato({
          nombre: "",
          descripcion: "",
          tipoPlato: nuevoPlato.tipoPlato,
          permiteGuarnicion: false,
        });
        cargarMenuAdmin();
        cargarDatosMonitoreo(true);
        setTimeout(() => setMenuMensaje(""), 4000);
      } else {
        Swal.fire({
          icon: "error",
          title: "Error",
          text: data.error || "No se pudo agregar el plato."
        });
      }
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Error al comunicarse con el servidor."
      });
    }
  };

  // 4. Delete Dish Option
  const handleEliminarPlato = async (id: number) => {
    if (!token) return;
    const result = await Swal.fire({
      title: "¿Eliminar plato?",
      text: "¿Deseas eliminar este plato del menú de la fecha?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar"
    });

    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`/api/oficinas/admin/menu/opcion/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        cargarMenuAdmin();
        cargarDatosMonitoreo(true);
      } else {
        Swal.fire({ icon: "error", title: "Error", text: data.error || "No se pudo eliminar el plato." });
      }
    } catch (err) {
      Swal.fire({ icon: "error", title: "Error", text: "Error al comunicarse con el servidor." });
    }
  };

  // 5. Add Side Dish
  const handleCrearGuarnicion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !nuevaGuarnicion.trim()) return;

    try {
      const res = await fetch("/api/oficinas/admin/menu/guarnicion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fecha: fechaSeleccionada,
          nombreGuarnicion: nuevaGuarnicion.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setNuevaGuarnicion("");
        cargarMenuAdmin();
      } else {
        Swal.fire({ icon: "error", title: "Error", text: data.error || "No se pudo agregar la guarnición." });
      }
    } catch (err) {
      Swal.fire({ icon: "error", title: "Error", text: "Error al comunicarse con el servidor." });
    }
  };

  // 6. Delete Side Dish
  const handleEliminarGuarnicion = async (id: number) => {
    if (!token) return;
    const result = await Swal.fire({
      title: "¿Eliminar guarnición?",
      text: "¿Deseas eliminar esta guarnición?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar"
    });

    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`/api/oficinas/admin/menu/guarnicion/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        cargarMenuAdmin();
      } else {
        Swal.fire({ icon: "error", title: "Error", text: data.error || "No se pudo eliminar la guarnición." });
      }
    } catch (err) {
      Swal.fire({ icon: "error", title: "Error", text: "Error al comunicarse con el servidor." });
    }
  };

  // 7. Copy Remito for WhatsApp
  const copiarTextoWhatsApp = () => {
    if (!monitoreo) return;

    let msg = `*REMITO DE PEDIDO - CATERING VIANDAS*\n`;
    msg += `🏢 ${monitoreo.oficina.nombre}\n`;
    msg += `📅 Fecha: ${formatDateDMY(fechaSeleccionada)}\n`;
    msg += `📦 Total Viandas: ${monitoreo.totalPedidos}\n\n`;

    msg += `*DESGLOSE DE PLATOS PARA COCINA:*\n`;
    monitoreo.conteoPlatos.forEach((r) => {
      msg += `▪ ${r.plato}: *${r.cantidad}*\n`;
    });

    msg += `\n*DISTRIBUCIÓN POR SECTOR:*\n`;
    monitoreo.conteoSectores.forEach((s) => {
      msg += `▪ ${s.sector}: *${s.cantidad} viandas*\n`;
    });

    navigator.clipboard.writeText(msg);
    setCopiadoWhatsapp(true);
    setTimeout(() => setCopiadoWhatsapp(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Barra Operativa y Pestañas */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 flex flex-wrap items-center justify-between gap-4">
        {/* Selector de Fecha */}
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Fecha Operativa:</span>
          <input
            type="date"
            value={fechaSeleccionada}
            onChange={(e) => setFechaSeleccionada(e.target.value)}
            className="border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-1.5 text-sm font-semibold text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-xs bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-full font-bold border border-indigo-200 dark:border-indigo-800 hidden sm:inline-block">
            {formatDateDMY(fechaSeleccionada)}
          </span>
        </div>

        {/* Pestañas de Navegación del Encargado */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
          <button
            onClick={() => setTabActual("MONITOREO")}
            className={`px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition flex items-center gap-1.5 ${
              tabActual === "MONITOREO"
                ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            }`}
          >
            <span>📊</span> Monitoreo en Vivo
          </button>
          <button
            onClick={() => setTabActual("MENU")}
            className={`px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition flex items-center gap-1.5 ${
              tabActual === "MENU"
                ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            }`}
          >
            <span>🍽️</span> Gestión del Menú
          </button>
          <button
            onClick={() => setTabActual("REMITO")}
            className={`px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition flex items-center gap-1.5 ${
              tabActual === "REMITO"
                ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            }`}
          >
            <span>🚚</span> Remito Proveedor
          </button>
        </div>

        {/* Refrescar Datos */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => cargarDatosMonitoreo()}
            disabled={loadingData}
            className="text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 bg-gray-50 dark:bg-gray-800 px-3.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 transition flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? "animate-spin" : ""}`} />
            <span>{loadingData ? "Cargando..." : "Refrescar"}</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          TAB 1: MONITOREO EN VIVO
          ===================================================================== */}
      {tabActual === "MONITOREO" && (
        <div className="space-y-6">
          {/* Métricas / KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Viandas Confirmadas
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                  {monitoreo?.totalPedidos || 0}
                </span>
                <span className="text-sm font-bold text-gray-400">
                  / {monitoreo?.totalHabilitados || 0} comensales
                </span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2 mt-3 overflow-hidden">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${monitoreo?.porcentajeCompletado || 0}%` }}
                />
              </div>
              <span className="text-xs text-gray-400 mt-1 block">
                {monitoreo?.porcentajeCompletado || 0}% de participación
              </span>
            </div>

            <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Faltan Pedir
              </span>
              <p className="text-3xl font-black text-amber-600 dark:text-amber-400 mt-1">
                {monitoreo?.totalPendientes || 0}
              </p>
              <span className="text-xs text-gray-400">Avisarles antes del cierre ({monitoreo?.oficina?.limiteAlmuerzo || "10:30"} hs)</span>
            </div>

            <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Variedades Solicitadas
              </span>
              <p className="text-3xl font-black text-blue-600 dark:text-blue-400 mt-1">
                {monitoreo?.conteoPlatos?.length || 0}
              </p>
              <span className="text-xs text-gray-400">Combinaciones diferentes</span>
            </div>

            <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Proveedor Catering
              </span>
              <p className="text-base font-bold text-gray-800 dark:text-gray-100 mt-1 truncate">
                {monitoreo?.oficina?.proveedorNombre || "Catering Sabores Gourmet"}
              </p>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                WhatsApp: {monitoreo?.oficina?.proveedorTelefono || "381-4556677"}
              </span>
            </div>
          </div>

          {/* Tablas de Pedidos Recibidos vs Faltan Pedir */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-black text-gray-800 dark:text-gray-100 text-lg flex items-center gap-2">
                    <span>📥</span> Pedidos Ingresados en Tiempo Real
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Listado de viandas solicitadas para el {formatDateDMY(fechaSeleccionada)}.
                  </p>
                </div>
                <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 font-bold text-xs px-2.5 py-1 rounded-full">
                  {monitoreo?.pedidosRecibidos?.length || 0} pedidos
                </span>
              </div>

              {!monitoreo?.pedidosRecibidos || monitoreo.pedidosRecibidos.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  No hay pedidos registrados aún para esta fecha.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-800 text-xs font-bold text-gray-400 uppercase tracking-wider">
                        <th className="pb-3">Hora</th>
                        <th className="pb-3">Comensal</th>
                        <th className="pb-3">Sector</th>
                        <th className="pb-3">Plato Principal</th>
                        <th className="pb-3">Guarnición</th>
                        <th className="pb-3">Obs.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium text-gray-700 dark:text-gray-300">
                      {monitoreo.pedidosRecibidos.map((p) => (
                        <tr key={p.pedidoId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                          <td className="py-3 text-xs font-mono text-gray-400">{p.hora} hs</td>
                          <td className="py-3 font-bold text-gray-900 dark:text-gray-100">
                            {p.nombreCompleto}
                            <span className="block text-xs font-mono text-gray-400 font-normal">
                              DNI {p.dni}
                            </span>
                          </td>
                          <td className="py-3 text-xs">{p.sector}</td>
                          <td className="py-3 text-blue-600 dark:text-blue-400 font-bold">{p.plato}</td>
                          <td className="py-3 text-indigo-600 dark:text-indigo-400 font-semibold">{p.guarnicion || "-"}</td>
                          <td className="py-3 text-gray-400 text-xs italic">{p.observaciones || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-gray-800 dark:text-gray-100 text-lg flex items-center gap-2">
                  <span>⏳</span> Faltan Pedir
                </h3>
                <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-bold text-xs px-2.5 py-1 rounded-full">
                  {monitoreo?.pendientes?.length || 0} pendientes
                </span>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Personal que aún no ingresó su pedido para esta fecha:
              </p>

              {!monitoreo?.pendientes || monitoreo.pendientes.length === 0 ? (
                <div className="p-6 text-center text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl font-bold text-sm">
                  🎉 ¡Todos los empleados han realizado su pedido!
                </div>
              ) : (
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {monitoreo.pendientes.map((emp) => (
                    <div
                      key={emp.dni}
                      className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60 text-xs flex items-center justify-between"
                    >
                      <div>
                        <p className="font-bold text-gray-800 dark:text-gray-200">{emp.nombreCompleto}</p>
                        <span className="text-gray-400">
                          DNI {emp.dni} • {emp.sector}
                        </span>
                      </div>
                      <span className="text-amber-600 dark:text-amber-400 font-bold text-xs bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                        Pendiente
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: GESTIÓN DEL MENÚ DEL DÍA
          ===================================================================== */}
      {tabActual === "MENU" && (
        <div className="space-y-8">
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
            <h3 className="text-xl font-black text-gray-800 dark:text-gray-100 flex items-center gap-2">
              🍽️ Carga de Menú para el {formatDateDMY(fechaSeleccionada)}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Configura los platos del día (completos) o las opciones para armar (principales + guarniciones) disponibles para los comensales.
            </p>

            {menuMensaje && (
              <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold rounded-xl text-xs flex items-center justify-between">
                <span>✓ {menuMensaje}</span>
                <button onClick={() => setMenuMensaje("")}>✕</button>
              </div>
            )}

            <form onSubmit={handleCrearPlato} className="mt-6 p-5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-4">
              <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Agregar Nueva Opción de Plato</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">
                    Tipo de Plato
                  </label>
                  <select
                    value={nuevoPlato.tipoPlato}
                    onChange={(e) =>
                      setNuevoPlato({ ...nuevoPlato, tipoPlato: e.target.value })
                    }
                    className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-semibold bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="PLATO_DEL_DIA">Plato del Día / Completo (Cerrado)</option>
                    <option value="PRINCIPAL">Plato Principal (Para armar con guarnición)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">
                    Nombre del Plato
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Pastel de Papa o Milanesa de Carne"
                    value={nuevoPlato.nombre}
                    onChange={(e) => setNuevoPlato({ ...nuevoPlato, nombre: e.target.value })}
                    required
                    className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">
                    Descripción u Observación (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Con carne picada especial y puré gratinado"
                    value={nuevoPlato.descripcion}
                    onChange={(e) =>
                      setNuevoPlato({ ...nuevoPlato, descripcion: e.target.value })
                    }
                    className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition shadow-md cursor-pointer"
                >
                  Guardar Plato en el Menú
                </button>
              </div>
            </form>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-black text-gray-800 dark:text-gray-100 text-base flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 text-xs font-bold flex items-center justify-center">
                    A
                  </span>
                  Platos del Día / Menú Completo (Cerrados)
                </h4>
                <span className="text-xs text-gray-400 font-semibold">
                  {platosDelDia.length} cargados
                </span>
              </div>

              {platosDelDia.length === 0 ? (
                <p className="text-xs text-gray-400 py-6 text-center">
                  No hay platos cerrados cargados para esta fecha.
                </p>
              ) : (
                <div className="space-y-3">
                  {platosDelDia.map((p) => (
                    <div
                      key={p.Id}
                      className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60 flex items-start justify-between gap-3"
                    >
                      <div>
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase">
                          Opción #{p.NumeroOpcion}
                        </span>
                        <h5 className="font-bold text-gray-800 dark:text-gray-100 text-sm">{p.NombrePlato}</h5>
                        {p.Descripcion && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{p.Descripcion}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleEliminarPlato(p.Id)}
                        className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-bold transition cursor-pointer"
                        title="Eliminar plato"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-black text-gray-800 dark:text-gray-100 text-base flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 text-xs font-bold flex items-center justify-center">
                    B
                  </span>
                  Platos Principales (Para Armar)
                </h4>
                <span className="text-xs text-gray-400 font-semibold">
                  {principales.length} cargados
                </span>
              </div>

              {principales.length === 0 ? (
                <p className="text-xs text-gray-400 py-6 text-center">
                  No hay platos principales cargados para esta fecha.
                </p>
              ) : (
                <div className="space-y-3">
                  {principales.map((p) => (
                    <div
                      key={p.Id}
                      className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60 flex items-start justify-between gap-3"
                    >
                      <div>
                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase">
                          Opción #{p.NumeroOpcion}
                        </span>
                        <h5 className="font-bold text-gray-800 dark:text-gray-100 text-sm">{p.NombrePlato}</h5>
                        {p.Descripcion && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{p.Descripcion}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleEliminarPlato(p.Id)}
                        className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-bold transition cursor-pointer"
                        title="Eliminar plato"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
            <div>
              <h4 className="font-black text-gray-800 dark:text-gray-100 text-base flex items-center gap-2">
                <span>🥗</span> Guarniciones y Acompañamientos
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Acompañamientos que el comensal puede seleccionar al pedir un Plato Principal.
              </p>
            </div>

            <form onSubmit={handleCrearGuarnicion} className="flex gap-3">
              <input
                type="text"
                placeholder="Nueva guarnición (ej. Ensalada Mixta, Papas Fritas, Arroz Blanco...)"
                value={nuevaGuarnicion}
                onChange={(e) => setNuevaGuarnicion(e.target.value)}
                required
                className="flex-1 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 text-white font-bold px-5 py-2 rounded-xl text-sm transition cursor-pointer"
              >
                + Agregar Guarnición
              </button>
            </form>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
              {guarniciones.map((g) => (
                <div
                  key={g.Id}
                  className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs font-bold text-gray-800 dark:text-gray-200"
                >
                  <span>{g.NombreGuarnicion}</span>
                  <button
                    onClick={() => handleEliminarGuarnicion(g.Id)}
                    className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: REMITO PROVEEDOR
          ===================================================================== */}
      {tabActual === "REMITO" && (
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-gray-900 to-indigo-950 text-white p-6 rounded-3xl shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4 border border-indigo-900/30">
            <div>
              <span className="bg-blue-500/20 text-blue-300 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border border-blue-500/30">
                🚚 Remito de Producción Oficial
              </span>
              <h2 className="text-2xl font-black mt-2">
                Proveedor: {monitoreo?.oficina?.proveedorNombre || "Catering Sabores Gourmet"}
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                WhatsApp: <strong>{monitoreo?.oficina?.proveedorTelefono || "381-4556677"}</strong> • {hospitalName || "Casa Central - SIPROSA"}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={copiarTextoWhatsApp}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-4 py-2.5 rounded-xl text-sm transition shadow-lg shadow-emerald-600/20 flex items-center gap-2 cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>{copiadoWhatsapp ? "¡Copiado al Portapapeles!" : "Copiar para WhatsApp"}</span>
              </button>
              <button
                onClick={() => window.print()}
                className="bg-white/10 hover:bg-white/20 text-white font-bold px-4 py-2.5 rounded-xl text-sm border border-white/20 transition flex items-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Remito</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm">
              <h3 className="font-bold text-gray-800 dark:text-gray-100 text-base mb-4 flex items-center gap-2">
                <span>🍴</span> Desglose de Platos para Cocina
              </h3>
              <div className="space-y-3">
                {monitoreo?.conteoPlatos?.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60"
                  >
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{item.plato}</span>
                    <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-300 font-black text-sm px-3 py-1 rounded-lg">
                      {item.cantidad}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm">
              <h3 className="font-bold text-gray-800 dark:text-gray-100 text-base mb-4 flex items-center gap-2">
                <span>🏢</span> Distribución por Sector / Piso
              </h3>
              <div className="space-y-3">
                {monitoreo?.conteoSectores?.map((sec, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60"
                  >
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{sec.sector}</span>
                    <span className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-900 dark:text-indigo-300 font-black text-sm px-3 py-1 rounded-lg">
                      {sec.cantidad} viandas
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <h3 className="font-bold text-gray-800 dark:text-gray-100 text-base mb-4 flex items-center gap-2">
              <span>📋</span> Remito Nominal de Entrega por Comensal
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800 text-xs font-bold text-gray-400 uppercase tracking-wider">
                    <th className="pb-3">Comensal</th>
                    <th className="pb-3">DNI</th>
                    <th className="pb-3">Sector</th>
                    <th className="pb-3">Plato Principal</th>
                    <th className="pb-3">Guarnición</th>
                    <th className="pb-3">Observaciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium text-gray-700 dark:text-gray-300">
                  {monitoreo?.pedidosRecibidos?.map((d) => (
                    <tr key={d.pedidoId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="py-3 font-bold text-gray-900 dark:text-gray-100">{d.nombreCompleto}</td>
                      <td className="py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">{d.dni}</td>
                      <td className="py-3">{d.sector}</td>
                      <td className="py-3 text-blue-600 dark:text-blue-400 font-bold">{d.plato}</td>
                      <td className="py-3 text-indigo-600 dark:text-indigo-400 font-semibold">{d.guarnicion || "-"}</td>
                      <td className="py-3 text-gray-400 italic text-xs">{d.observaciones || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
