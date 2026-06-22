"use client";

import { useState, useEffect } from "react";

type Role = "Jefe" | "Gerente" | "RRHH";

export default function Home() {
  const [role, setRole] = useState<Role | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const isPastDeadline = false; // Deshabilitado para pruebas

  const handleLogin = (jwtToken: string, userRole: number, id: number) => {
    setToken(jwtToken);
    setUserId(id);
    if (userRole === 1) setRole("RRHH");
    else if (userRole === 2) setRole("Gerente");
    else if (userRole === 3) setRole("Jefe");
  };

  const handleLogout = () => {
    setToken(null);
    setRole(null);
    setUserId(null);
  };

  if (!token || !role) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-200">
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">Comida Control Entrega</h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 bg-gray-100 px-3 py-1.5 rounded-full">
              <span className="text-sm font-medium text-gray-700">Rol: {role}</span>
              <button onClick={handleLogout} className="ml-4 text-xs text-red-600 hover:text-red-800 font-semibold">Cerrar Sesión</button>
            </div>
            <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border ${isPastDeadline ? 'bg-red-50 border-red-200 text-red-600' : 'bg-green-50 border-green-200 text-green-600'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-semibold">
                {currentTime ? currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "..."}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isPastDeadline && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm flex items-start">
            <svg className="w-5 h-5 text-red-500 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-red-800">Cierre de Pedidos</h3>
              <p className="text-sm text-red-700 mt-1">El horario límite (10:00 AM) ha pasado. Ya no se pueden realizar solicitudes normales ni de emergencia para el día de hoy.</p>
            </div>
          </div>
        )}

        {role === "Jefe" && <JefePanel isPastDeadline={isPastDeadline} token={token} userId={userId} />}
        {role === "Gerente" && <GerentePanel token={token} />}
        {role === "RRHH" && <RRHHPanel token={token} />}
      </main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (token: string, roleId: number, id: number) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const [tempToken, setTempToken] = useState("");
  const [totp, setTotp] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("http://localhost:3001/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error de login");
      
      if (data.require2FA) {
        setTempToken(data.tempToken);
        if (data.setup && data.qrCode) {
          setQrCodeUrl(data.qrCode);
        }
        setStep(2);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const do2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("http://localhost:3001/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken, token: totp })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Código inválido");
      
      onLogin(data.token, data.user.roleId, data.user.id);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 w-full max-w-md">
        <h2 className="text-2xl font-bold text-center mb-6 text-gray-900">Iniciar Sesión</h2>
        {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>}
        
        {step === 1 ? (
          <form onSubmit={doLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Usuario</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Contraseña</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border" required />
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-md font-medium hover:bg-blue-700">Continuar</button>
          </form>
        ) : (
          <form onSubmit={do2FA} className="space-y-4">
            {qrCodeUrl && (
              <div className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-lg border border-gray-200 mb-4">
                <p className="text-sm text-gray-700 font-medium mb-2 text-center">Escanea este código con tu app de Autenticación (Google Authenticator, Authy, etc.)</p>
                <img src={qrCodeUrl} alt="QR Code 2FA" className="w-48 h-48 bg-white p-2 rounded-md shadow-sm" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700">Código 2FA</label>
              <input type="text" value={totp} onChange={e => setTotp(e.target.value)} className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border" required />
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-md font-medium hover:bg-blue-700">Verificar</button>
          </form>
        )}
      </div>
    </div>
  );
}

function JefePanel({ isPastDeadline, token, userId }: { isPastDeadline: boolean, token: string, userId: number | null }) {
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Emergency form state
  const [emgNombre, setEmgNombre] = useState("");
  const [emgDni, setEmgDni] = useState("");
  const [emgComida, setEmgComida] = useState("Almuerzo");
  const [emgDieta, setEmgDieta] = useState("Normal");
  const [emgJustificacion, setEmgJustificacion] = useState("");
  
  // Reportes
  const [repDesde, setRepDesde] = useState("");
  const [repHasta, setRepHasta] = useState("");
  const [repFiltroEmpleado, setRepFiltroEmpleado] = useState("");
  const [reportes, setReportes] = useState<any[]>([]);

  const dietas = ["Normal", "Gastrica", "Diabetica", "Hepatico", "Vegetariano", "Celiaca"];

  const fetchStaff = async () => {
    try {
      const res = await fetch("http://localhost:3001/api/staff/active", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStaff(data);
      }
    } catch (e) {
      console.error("Error fetching staff:", e);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    setLoading(true);

    try {
      const res = await fetch("http://localhost:3001/api/staff/import", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        alert("Personal importado exitosamente");
        fetchStaff();
      } else {
        const data = await res.json();
        alert("Error: " + data.error);
      }
    } catch (e) {
      alert("Error de conexión");
    } finally {
      setLoading(false);
      e.target.value = ""; // reset
    }
  };

  const [selections, setSelections] = useState<{ [id: number]: { almuerzo: string | null, cena: string | null } }>({});

  const toggleSelection = (personalId: number, tipoComida: "almuerzo" | "cena", tipoDieta: string) => {
    setSelections(prev => {
      const current = prev[personalId] || { almuerzo: null, cena: null };
      // Si hace click en la misma dieta, la deselecciona (toggle off), sino la selecciona
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
    // Transform selections state into the bulk format
    const ordersToSave = Object.keys(selections).map(id => ({
      personalId: Number(id),
      almuerzoDieta: selections[Number(id)].almuerzo,
      cenaDieta: selections[Number(id)].cena
    })).filter(o => o.almuerzoDieta !== null || o.cenaDieta !== null);

    if (ordersToSave.length === 0) {
      alert("No hay ningún pedido seleccionado para guardar.");
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
          solicitadoPorUsuarioId: userId
        })
      });
      if (res.ok) {
        alert("Todos los pedidos se guardaron exitosamente.");
        // Opcionalmente: limpiar selección o recargar (en este caso lo dejamos como está)
      } else {
        const data = await res.json();
        alert("Error: " + data.error);
      }
    } catch (e) {
      alert("Error al guardar los pedidos");
    }
  };

  const submitEmergency = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("http://localhost:3001/api/emergencies", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          nombre: emgNombre,
          apellido: "", // We just use full name in the same field for MVP
          dni: emgDni,
          periodoInicio: new Date().toISOString(),
          periodoFin: new Date().toISOString(),
          tipoComida: emgComida,
          tipoDieta: emgDieta,
          justificacion: emgJustificacion,
          solicitadoPorUsuarioId: userId
        })
      });
      if (res.ok) {
        alert("Solicitud de emergencia creada");
        setEmgNombre(""); setEmgDni(""); setEmgJustificacion("");
      } else {
        const data = await res.json();
        alert("Error: " + data.error);
      }
    } catch (e) {
      alert("Error al crear emergencia");
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
      alert("Error al generar reporte");
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Planilla de Personal - Guardia Médica</h2>
            <p className="text-sm text-gray-500 mt-1">Selecciona el menú deseado para el personal activo hoy.</p>
          </div>
          <div className="flex items-center space-x-4">
            <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-3 py-1 rounded-full">Activos: {staff.length}</span>
            <button onClick={handleGuardarPedidos} disabled={isPastDeadline} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm">
              Guardar Todos los Pedidos
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Personal</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Almuerzo</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cena</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {staff.map((p) => {
                const pSelections = selections[p.Id] || { almuerzo: null, cena: null };
                return (
                  <tr key={p.Id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">{p.Nombre} {p.Apellido}</span>
                        <span className="text-xs text-gray-500">DNI: {p.DNI} • {p.Horario}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {dietas.map(d => {
                          const isSelected = pSelections.almuerzo === d;
                          return (
                            <button key={`alm-${d}`} onClick={() => toggleSelection(p.Id, "almuerzo", d)} disabled={isPastDeadline} className={`px-3 py-1.5 text-xs rounded-md border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${isSelected ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700'}`}>
                              {d}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {dietas.map(d => {
                          const isSelected = pSelections.cena === d;
                          return (
                            <button key={`cen-${d}`} onClick={() => toggleSelection(p.Id, "cena", d)} disabled={isPastDeadline} className={`px-3 py-1.5 text-xs rounded-md border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${isSelected ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700'}`}>
                              {d}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 bg-orange-50/50">
          <h2 className="text-lg font-semibold text-gray-900">Solicitud de Emergencia</h2>
          <p className="text-sm text-gray-500 mt-1">Para personal no listado en la planilla mensual.</p>
        </div>
        <div className="p-6">
          <form className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" onSubmit={submitEmergency}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre y Apellido</label>
              <input type="text" value={emgNombre} onChange={e => setEmgNombre(e.target.value)} disabled={isPastDeadline} className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed px-3 py-2 border" placeholder="Ej. Carlos Ruiz" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">DNI</label>
              <input type="text" value={emgDni} onChange={e => setEmgDni(e.target.value)} disabled={isPastDeadline} className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm disabled:bg-gray-100 px-3 py-2 border" placeholder="Ej. 11223344" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Comida y Dieta</label>
              <div className="flex space-x-2">
                <select value={emgComida} onChange={e => setEmgComida(e.target.value)} disabled={isPastDeadline} className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm disabled:bg-gray-100 px-3 py-2 border bg-white">
                  <option value="Almuerzo">Almuerzo</option>
                  <option value="Cena">Cena</option>
                </select>
                <select value={emgDieta} onChange={e => setEmgDieta(e.target.value)} disabled={isPastDeadline} className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm disabled:bg-gray-100 px-3 py-2 border bg-white">
                  {dietas.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Justificación Obligatoria</label>
              <textarea value={emgJustificacion} onChange={e => setEmgJustificacion(e.target.value)} disabled={isPastDeadline} rows={2} className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm disabled:bg-gray-100 px-3 py-2 border" placeholder="Motivo de la solicitud de emergencia..." required></textarea>
            </div>
            <div className="md:col-span-2 lg:col-span-3 flex justify-end">
              <button type="submit" disabled={isPastDeadline} className="inline-flex justify-center py-2 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                Enviar Solicitud
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Importación de Plantel Mensual</h2>
            <p className="text-sm text-gray-500 mt-1">Sube un archivo CSV con el personal autorizado para tu servicio.</p>
          </div>
          <a href="/plantilla_personal.csv" download className="text-sm text-blue-600 font-medium hover:text-blue-800 flex items-center bg-blue-50 px-3 py-1.5 rounded-md border border-blue-200 transition-colors">
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Descargar Plantilla
          </a>
        </div>
        <div className="p-6 border-dashed border-2 border-blue-300 rounded-lg m-6 flex flex-col items-center justify-center text-center hover:bg-blue-50 cursor-pointer transition-colors relative">
          <input type="file" accept=".csv" onChange={handleFileUpload} disabled={loading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
          <div className="text-blue-600 mb-2 bg-blue-100 p-3 rounded-full">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          </div>
          <h3 className="text-sm font-bold text-blue-700">{loading ? "Subiendo..." : "Importar Plantel (CSV)"}</h3>
          <p className="text-xs text-gray-500 mt-1">Actualizar base de personal activo</p>
        </div>
      </div>

      {/* Reportes Section for Jefe */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/50">
          <h2 className="text-lg font-semibold text-gray-900">Reportes de mi Servicio</h2>
        </div>
        <div className="p-6 border-b border-gray-200 flex flex-wrap gap-4 items-end">
          <div className="w-48">
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Fecha Desde</label>
            <input type="date" value={repDesde} onChange={e => setRepDesde(e.target.value)} className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border" />
          </div>
          <div className="w-48">
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Fecha Hasta</label>
            <input type="date" value={repHasta} onChange={e => setRepHasta(e.target.value)} className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border" />
          </div>
          <button onClick={generarReporte} className="bg-gray-800 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-900 shadow-sm transition-colors">
            Generar Reporte
          </button>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Filtrar por Empleado (DNI o Nombre)</label>
            <input type="text" value={repFiltroEmpleado} onChange={e => setRepFiltroEmpleado(e.target.value)} placeholder="Ej. Juan Perez" className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border" />
          </div>
        </div>
        <div className="p-8 text-gray-700 text-sm overflow-x-auto">
          {reportes.length === 0 ? (
            <div className="text-center text-gray-500">Vista previa del reporte (Selecciona fechas y haz clic en Generar Reporte)</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left">Fecha</th>
                  <th className="px-4 py-2 text-left">Tipo</th>
                  <th className="px-4 py-2 text-left">Personal / Paciente</th>
                  <th className="px-4 py-2 text-left">DNI</th>
                  <th className="px-4 py-2 text-left">Estado</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {reportes.filter(r => {
                  if (!repFiltroEmpleado) return true;
                  const term = repFiltroEmpleado.toLowerCase();
                  const name = r.Personal ? `${r.Personal.Nombre} ${r.Personal.Apellido}`.toLowerCase() : `${r.EmergenciaNombre} ${r.EmergenciaApellido}`.toLowerCase();
                  const dni = r.Personal ? (r.Personal.DNI || "").toLowerCase() : (r.EmergenciaDNI || "").toLowerCase();
                  return name.includes(term) || dni.includes(term);
                }).map((r) => (
                  <tr key={r.Id}>
                    <td className="px-4 py-2">{r.FechaPedido.split('T')[0].split('-').reverse().join('/')}</td>
                    <td className="px-4 py-2">{r.TipoComida} ({r.TipoDieta})</td>
                    <td className="px-4 py-2">{r.Personal ? `${r.Personal.Nombre} ${r.Personal.Apellido}` : `${r.EmergenciaNombre} ${r.EmergenciaApellido}`}</td>
                    <td className="px-4 py-2">{r.Personal ? r.Personal.DNI : r.EmergenciaDNI}</td>
                    <td className="px-4 py-2">{r.Estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function GerentePanel({ token }: { token: string }) {
  const [emergencias, setEmergencias] = useState<any[]>([]);
  const [resolucionTxt, setResolucionTxt] = useState<{ [id: number]: string }>({});

  // ABM Servicios
  const [servicios, setServicios] = useState<any[]>([]);
  const [nuevoServicio, setNuevoServicio] = useState("");

  // ABM Jefe Servicio
  const [jefeUsername, setJefeUsername] = useState("");
  const [jefePassword, setJefePassword] = useState("");
  const [jefeServicioId, setJefeServicioId] = useState("");

  // Reportes
  const [repDesde, setRepDesde] = useState("");
  const [repHasta, setRepHasta] = useState("");
  const [repFiltroEmpleado, setRepFiltroEmpleado] = useState("");
  const [reportes, setReportes] = useState<any[]>([]);

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
      if (res.ok) {
        const data = await res.json();
        setServicios(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchEmergencias();
    fetchServicios();
  }, []);

  const resolveEmergency = async (id: number, estado: string) => {
    const justificacion = resolucionTxt[id];
    if (!justificacion) {
      alert("La justificación es obligatoria");
      return;
    }

    try {
      const res = await fetch(`http://localhost:3001/api/emergencies/${id}/resolve`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ estado, justificacionResolucion: justificacion })
      });
      if (res.ok) {
        alert(`Emergencia ${estado}`);
        fetchEmergencias();
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (e) {
      alert("Error al resolver emergencia");
    }
  };

  const crearServicio = async () => {
    try {
      const res = await fetch("http://localhost:3001/api/services", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ nombre: nuevoServicio })
      });
      if (res.ok) {
        alert("Servicio creado");
        setNuevoServicio("");
        fetchServicios();
      }
    } catch (e) {
      alert("Error al crear servicio");
    }
  };

  const asignarJefe = async () => {
    try {
      const res = await fetch("http://localhost:3001/api/users/jefe-servicio", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          username: jefeUsername, 
          password: jefePassword, 
          servicioId: Number(jefeServicioId) 
        })
      });
      if (res.ok) {
        alert("Jefe asignado exitosamente");
        setJefeUsername(""); setJefePassword(""); setJefeServicioId("");
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (e) {
      alert("Error al asignar jefe");
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
      alert("Error al generar reporte");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Bandeja de Emergencias</h2>
            <p className="text-sm text-gray-500 mt-1">Revisa y resuelve las solicitudes pendientes de tu hospital.</p>
          </div>
          <span className="bg-orange-100 text-orange-800 text-xs font-semibold px-3 py-1 rounded-full">{emergencias.length} Pendientes</span>
        </div>
        
        {emergencias.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No hay solicitudes de emergencia pendientes.</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {emergencias.map(e => (
              <div key={e.Id} className="p-6">
                <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 uppercase">{e.EmergenciaNombre} {e.EmergenciaApellido} (DNI: {e.EmergenciaDNI})</h3>
                    <p className="text-sm text-gray-600 mt-1"><span className="font-medium">Solicita:</span> {e.TipoComida} - {e.TipoDieta}</p>
                    <p className="text-sm text-gray-600"><span className="font-medium">Jefe Solicitante ID:</span> {e.SolicitadoPorUsuarioId}</p>
                    <div className="mt-3 bg-gray-50 p-3 rounded-md border border-gray-200 text-sm italic text-gray-700">
                      "{e.JustificacionSolicitud}"
                    </div>
                  </div>
                  
                  <div className="flex flex-col space-y-3 w-full md:w-72">
                    <textarea 
                      className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 px-3 py-2 border" 
                      placeholder="Justificación de la resolución (Obligatoria)..." 
                      rows={2}
                      value={resolucionTxt[e.Id] || ""}
                      onChange={(evt) => setResolucionTxt({...resolucionTxt, [e.Id]: evt.target.value})}
                    ></textarea>
                    <div className="flex space-x-3">
                      <button onClick={() => resolveEmergency(e.Id, "Rechazado")} className="flex-1 bg-white border border-red-300 text-red-700 hover:bg-red-50 py-2 px-4 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500">
                        Rechazar
                      </button>
                      <button onClick={() => resolveEmergency(e.Id, "Aprobado")} className="flex-1 bg-green-600 border border-transparent text-white hover:bg-green-700 py-2 px-4 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                        Aprobar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/50">
          <h2 className="text-lg font-semibold text-gray-900">Gestión de Hospital</h2>
          <p className="text-sm text-gray-500 mt-1">Configura servicios y asigna Jefes de Servicio.</p>
        </div>
        <div className="p-6 flex flex-col space-y-4">
          <div className="flex flex-col space-y-2 mb-4">
            <h3 className="text-sm font-medium text-gray-900">Servicios Existentes</h3>
            {servicios.length === 0 ? (
              <p className="text-sm text-gray-500">No hay servicios creados aún.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {servicios.map(s => (
                  <span key={s.Id} className="bg-gray-100 text-gray-700 text-xs font-semibold px-3 py-1 rounded-full border border-gray-200">
                    {s.Nombre} (ID: {s.Id})
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex space-x-4">
            <input type="text" value={nuevoServicio} onChange={e => setNuevoServicio(e.target.value)} placeholder="Nombre del nuevo servicio" className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            <button onClick={crearServicio} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors">
              Crear Servicio
            </button>
          </div>
          <div className="flex space-x-4">
            <input type="text" value={jefeUsername} onChange={e => setJefeUsername(e.target.value)} placeholder="Usuario Jefe de Servicio" className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            <input type="password" value={jefePassword} onChange={e => setJefePassword(e.target.value)} placeholder="Contraseña" className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            <select value={jefeServicioId} onChange={e => setJefeServicioId(e.target.value)} className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
              <option value="" disabled>Seleccione un servicio...</option>
              {servicios.map(s => <option key={s.Id} value={s.Id}>{s.Nombre}</option>)}
            </select>
            <button onClick={asignarJefe} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors">
              Asignar
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/50">
          <h2 className="text-lg font-semibold text-gray-900">Reportes del Hospital</h2>
        </div>
        <div className="p-6 border-b border-gray-200 flex flex-wrap gap-4 items-end">
          <div className="w-48">
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Fecha Desde</label>
            <input type="date" value={repDesde} onChange={e => setRepDesde(e.target.value)} className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border" />
          </div>
          <div className="w-48">
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Fecha Hasta</label>
            <input type="date" value={repHasta} onChange={e => setRepHasta(e.target.value)} className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border" />
          </div>
          <button onClick={generarReporte} className="bg-gray-800 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-900 shadow-sm transition-colors">
            Generar Reporte
          </button>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Filtrar por Empleado (DNI o Nombre)</label>
            <input type="text" value={repFiltroEmpleado} onChange={e => setRepFiltroEmpleado(e.target.value)} placeholder="Ej. Juan Perez" className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border" />
          </div>
        </div>
        <div className="p-8 text-gray-700 text-sm overflow-x-auto">
          {reportes.length === 0 ? (
            <div className="text-center text-gray-500">Vista previa del reporte (Selecciona filtros y haz clic en Generar Reporte)</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left">Fecha</th>
                  <th className="px-4 py-2 text-left">Tipo</th>
                  <th className="px-4 py-2 text-left">Personal / Paciente</th>
                  <th className="px-4 py-2 text-left">DNI</th>
                  <th className="px-4 py-2 text-left">Estado</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {reportes.filter(r => {
                  if (!repFiltroEmpleado) return true;
                  const term = repFiltroEmpleado.toLowerCase();
                  const name = r.Personal ? `${r.Personal.Nombre} ${r.Personal.Apellido}`.toLowerCase() : `${r.EmergenciaNombre} ${r.EmergenciaApellido}`.toLowerCase();
                  const dni = r.Personal ? (r.Personal.DNI || "").toLowerCase() : (r.EmergenciaDNI || "").toLowerCase();
                  return name.includes(term) || dni.includes(term);
                }).map((r) => (
                  <tr key={r.Id}>
                    <td className="px-4 py-2">{r.FechaPedido.split('T')[0].split('-').reverse().join('/')}</td>
                    <td className="px-4 py-2">{r.TipoComida} ({r.TipoDieta})</td>
                    <td className="px-4 py-2">{r.Personal ? `${r.Personal.Nombre} ${r.Personal.Apellido}` : `${r.EmergenciaNombre} ${r.EmergenciaApellido}`}</td>
                    <td className="px-4 py-2">{r.Personal ? r.Personal.DNI : r.EmergenciaDNI}</td>
                    <td className="px-4 py-2">{r.Estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function RRHHPanel({ token }: { token: string }) {
  const [hospitales, setHospitales] = useState<any[]>([]);
  const [nuevoHospital, setNuevoHospital] = useState("");
  const [gerenteUser, setGerenteUser] = useState("");
  const [gerentePass, setGerentePass] = useState("");
  const [gerenteHospitalId, setGerenteHospitalId] = useState("");

  const fetchHospitales = async () => {
    try {
      const res = await fetch("http://localhost:3001/api/hospitals", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHospitales(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchHospitales();
  }, []);

  const crearHospital = async () => {
    try {
      const res = await fetch("http://localhost:3001/api/hospitals", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nombre: nuevoHospital })
      });
      if (res.ok) {
        alert("Hospital creado exitosamente");
        setNuevoHospital("");
        fetchHospitales();
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (e) {
      alert("Error al crear hospital");
    }
  };

  const crearGerente = async () => {
    try {
      const res = await fetch("http://localhost:3001/api/users/gerente", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: gerenteUser, password: gerentePass, hospitalId: gerenteHospitalId })
      });
      if (res.ok) {
        alert("Gerente creado exitosamente");
        setGerenteUser(""); setGerentePass(""); setGerenteHospitalId("");
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (e) {
      alert("Error al crear gerente");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col items-center justify-center text-center">
          <div className="text-blue-500 mb-2">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
          </div>
          <h3 className="text-3xl font-bold text-gray-900">{hospitales.length}</h3>
          <p className="text-sm text-gray-500 font-medium uppercase mt-1">Hospitales en Sistema</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/50">
          <h2 className="text-lg font-semibold text-gray-900">Red de Hospitales</h2>
          <p className="text-sm text-gray-500 mt-1">Estructura actual del sistema.</p>
        </div>
        <div className="p-6">
          {hospitales.length === 0 ? (
            <p className="text-sm text-gray-500">No hay hospitales registrados.</p>
          ) : (
            <div className="space-y-6">
              {hospitales.map(h => (
                <div key={h.Id} className="border border-gray-200 rounded-lg p-4 bg-gray-50/30">
                  <h3 className="font-bold text-gray-900 text-lg flex items-center">
                    <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    {h.Nombre} <span className="ml-2 text-xs font-normal text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">ID: {h.Id}</span>
                  </h3>
                  
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Gerentes Asignados</h4>
                      {h.Usuarios && h.Usuarios.length > 0 ? (
                        <ul className="space-y-1">
                          {h.Usuarios.map((u: any) => (
                            <li key={u.Id} className="text-sm text-gray-700 flex items-center">
                              <svg className="w-4 h-4 mr-1.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                              {u.NombreUsuario}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-gray-500 italic">Sin gerentes</p>
                      )}
                    </div>
                    
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Servicios Creados</h4>
                      {h.Servicios && h.Servicios.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {h.Servicios.map((s: any) => (
                            <span key={s.Id} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                              {s.Nombre}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic">Sin servicios</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/50">
          <h2 className="text-lg font-semibold text-gray-900">Panel de Administración de Red</h2>
          <p className="text-sm text-gray-500 mt-1">Crea nuevos hospitales y asígnales Gerentes administradores.</p>
        </div>
        <div className="p-6 flex flex-col space-y-6">
          
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">1. Alta de Hospital</h3>
            <div className="flex space-x-4">
              <input type="text" value={nuevoHospital} onChange={e => setNuevoHospital(e.target.value)} placeholder="Nombre del Hospital" className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
              <button onClick={crearHospital} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors">
                Crear Hospital
              </button>
            </div>
          </div>

          <hr className="border-gray-200" />

          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">2. Asignar Gerente a Hospital</h3>
            <div className="flex space-x-4">
              <input type="text" value={gerenteUser} onChange={e => setGerenteUser(e.target.value)} placeholder="Usuario Gerente" className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
              <input type="password" value={gerentePass} onChange={e => setGerentePass(e.target.value)} placeholder="Contraseña" className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
              <select value={gerenteHospitalId} onChange={e => setGerenteHospitalId(e.target.value)} className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
                <option value="" disabled>Seleccione un Hospital...</option>
                {hospitales.map(h => <option key={h.Id} value={h.Id}>{h.Nombre}</option>)}
              </select>
              <button onClick={crearGerente} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors">
                Crear Gerente
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
