"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Swal from 'sweetalert2';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Printer,
  QrCode,
  Sparkles,
  ShieldCheck,
  Volume2,
  LogOut,
  Hospital,
  AlertTriangle,
  Link2Off
} from "lucide-react";

interface TicketData {
  id: number;
  hospital: string;
  fecha: string;
  hora: string;
  turno: string;
  agenteNombre: string;
  agenteDni: string;
  servicio: string;
  tipoDieta: string;
  pie: string;
  horaVencimiento?: string;
  validezTexto?: string;
  avisoCocina?: string;
  isLateLunch?: boolean;
}

type KioskState = "STANDBY" | "PROCESSING" | "SUCCESS" | "REJECTED";

export default function TotemKioskPage() {
  const [token, setToken] = useState<string | null>(null);
  const [kioskState, setKioskState] = useState<KioskState>("STANDBY");
  const [hospitalNombre, setHospitalNombre] = useState<string>("Hospital");
  const [activeTurno, setActiveTurno] = useState<string>("Almuerzo");
  const [currentTime, setCurrentTime] = useState<string>("");
  const [scanInput, setScanInput] = useState<string>("");
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [manualModalOpen, setManualModalOpen] = useState<boolean>(false);
  const [manualUser, setManualUser] = useState<string>("");
  const [manualPass, setManualPass] = useState<string>("");
  const [manualError, setManualError] = useState<string>("");
  const [pinError, setPinError] = useState<string>("");
  const [claimPin, setClaimPin] = useState<string>("");

  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);
  const bufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);


  // 2. RELOJ EN VIVO Y CÁLCULO DE TURNO
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false
        })
      );
      const hour = now.getHours();
      setActiveTurno(hour < 16 ? "Almuerzo" : "Cena");
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // 3. CONSULTA DE ESTADO DEL TÓTEM (HOSPITAL Y CONECTIVIDAD)
  useEffect(() => {
    if (!token) return;

    const fetchInfo = async () => {
      try {
        const res = await fetch("/api/totem/info", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.hospitalNombre) setHospitalNombre(data.hospitalNombre);
          if (data.activeTurno) setActiveTurno(data.activeTurno);
        } else if (res.status === 401 || res.status === 403) {
          localStorage.removeItem("sisar_totem_token");
          setToken(null);
          setClaimPin("");
        }
      } catch (err) {
        console.error("Error al consultar info del tótem:", err);
      }
    };

    fetchInfo();
    const interval = setInterval(fetchInfo, 2000);
    return () => clearInterval(interval);
  }, [token]);

  // 4. PREPARACIÓN DE SÍNTESIS DE VOZ
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  // 5. MOTOR DE AUDIO (CHIMES CON WEB AUDIO API)
  const playChime = useCallback((type: "success" | "error") => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (type === "success") {
        // Acorde brillante ascendente (587Hz -> 880Hz, Re5 -> La5)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);

        gain.gain.setValueAtTime(0.6, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.55);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      } else {
        // Tono grave de alerta descendente (220Hz -> 140Hz)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(140, ctx.currentTime + 0.35);

        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.45);
      }
    } catch (e) {
      console.error("Audio error:", e);
    }
  }, []);

  // 6. MOTOR DE VOZ INSTITUCIONAL (WEB SPEECH API)
  const speakVoice = useCallback((text: string) => {
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "es-AR";
        utterance.rate = 1.05;
        utterance.pitch = 1.0;

        const voices = window.speechSynthesis.getVoices();
        const argVoice = voices.find(v => v.lang === "es-AR") ||
          voices.find(v => v.lang.startsWith("es-419")) ||
          voices.find(v => v.lang.startsWith("es-")) ||
          voices.find(v => v.lang.includes("es"));
        if (argVoice) utterance.voice = argVoice;

        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      console.error("Speech error:", e);
    }
  }, []);

  // VINCULACIÓN MEDIANTE CÓDIGO QR ESCANEADO
  const handlePairWithPin = useCallback(async (codeToUse: string) => {
    const clean = codeToUse.trim();
    if (!clean) return false;
    setPinError("");
    try {
      const res = await fetch("/api/totem/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: clean })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem("sisar_totem_token", data.token);
        setToken(data.token);
        if (data.hospitalName) setHospitalNombre(data.hospitalName);
        playChime("success");
        speakVoice("Terminal vinculada exitosamente.");
        return true;
      } else {
        const err = data.error || "Código de activación inválido.";
        setPinError(err);
        playChime("error");
        speakVoice("Código de activación inválido.");
        return false;
      }
    } catch (err: any) {
      setPinError("Error de conexión al vincular.");
      return false;
    }
  }, [playChime, speakVoice]);

  // 1. CARGA INICIAL DE TOKEN DESDE LOCALSTORAGE O PARÁMETRO URL
  useEffect(() => {
    const savedToken = localStorage.getItem("sisar_totem_token");
    if (savedToken) {
      setToken(savedToken);
    }

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get("token");
      const urlActivate = params.get("activate");
      const urlHospital = params.get("hospital") || params.get("hospitalId");

      if (urlHospital) {
        localStorage.setItem("sisar_totem_hospital_binding", urlHospital);
      }

      if (urlToken) {
        localStorage.setItem("sisar_totem_token", urlToken);
        setToken(urlToken);
        window.history.replaceState({}, document.title, window.location.pathname);
        playChime("success");
        speakVoice("Terminal vinculada exitosamente.");
      } else if (urlActivate) {
        handlePairWithPin(urlActivate);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [handlePairWithPin, playChime, speakVoice]);

  // 1.1 SOLICITUD Y POLLING DE VINCULACIÓN INVERSA (CLAIM POR PIN)
  useEffect(() => {
    if (token) {
      if (claimPin) setClaimPin("");
      return;
    }

    let isSubscribed = true;

    const requestPin = async () => {
      try {
        const boundHospital = typeof window !== "undefined"
          ? (new URLSearchParams(window.location.search).get("hospital") ||
             new URLSearchParams(window.location.search).get("hospitalId") ||
             localStorage.getItem("sisar_totem_hospital_binding") || "")
          : "";

        const res = await fetch("/api/totem/request-claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hospital: boundHospital })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.pinCode && isSubscribed) {
            setClaimPin(data.pinCode);
          }
        }
      } catch (err) {
        console.error("Error al solicitar PIN de vinculación:", err);
      }
    };

    if (!claimPin) {
      requestPin();
    }

    const checkClaim = async () => {
      if (!claimPin) return;
      try {
        const res = await fetch(`/api/totem/check-claim?code=${claimPin}`);
        if (res.ok) {
          const data = await res.json();
          if (data.claimed && data.token && isSubscribed) {
            localStorage.setItem("sisar_totem_token", data.token);
            setToken(data.token);
            if (data.hospitalName) setHospitalNombre(data.hospitalName);
            playChime("success");
            speakVoice("Terminal vinculada exitosamente.");
          } else if (data.expired && isSubscribed) {
            requestPin();
          }
        }
      } catch (err) {
        // Ignorar fallas transitorias de polling
      }
    };

    const interval = setInterval(checkClaim, 2500);
    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [token, claimPin, playChime, speakVoice]);

  // 7. TRAMPA DE FOCO PERPETUA PARA EL LECTOR USB
  useEffect(() => {
    if (kioskState !== "STANDBY") return;

    const keepFocus = () => {
      if (!manualModalOpen && inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
      }
    };

    keepFocus();
    const interval = setInterval(keepFocus, 300);
    return () => clearInterval(interval);
  }, [kioskState, manualModalOpen]);

  // 8. DISPARO SILENCIOSO DE IMPRESIÓN TÉRMICA
  const triggerThermalPrint = useCallback(() => {
    setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.error("Error al imprimir ticket:", err);
      }
    }, 150);
  }, []);

  // 9. PROCESAMIENTO DEL CÓDIGO ESCANEADO
  const processScanCode = useCallback(async (code: string) => {
    const cleanCode = code.trim();
    if (!cleanCode) return;

    // A) Si es un código PIN de 6 dígitos o escaneo de TOTEM-123456 (con cualquier separador)
    const pinMatch = cleanCode.match(/\b\d{6}\b/) || cleanCode.match(/TOTEM[_\-:;>^]?(\d{6})/i);
    if (pinMatch) {
      const pin = pinMatch[1] || pinMatch[0];
      const paired = await handlePairWithPin(pin);
      if (paired) return;
    }

    // B) Si contiene un JWT directamente (formato anterior TOTEM_ACTIVATE:... con cualquier variación de teclado)
    if (cleanCode.includes("eyJ") || /TOTEM.*ACTIVATE/i.test(cleanCode)) {
      const extractedToken = cleanCode.replace(/^.*eyJ/i, "eyJ").trim();
      if (extractedToken.startsWith("eyJ")) {
        localStorage.setItem("sisar_totem_token", extractedToken);
        setToken(extractedToken);
        playChime("success");
        speakVoice("Terminal tótem vinculada exitosamente.");
        return;
      }
    }

    if (!token) {
      setErrorMessage("Terminal no vinculada. Por favor escanee el QR maestro de activación.");
      playChime("error");
      speakVoice("Terminal no vinculada. Escanee el código de activación.");
      return;
    }

    if (kioskState === "PROCESSING") return;

    setKioskState("PROCESSING");
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);

    try {
      const res = await fetch("/api/totem/dispense", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ code: cleanCode })
      });

      const data = await res.json();

      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("sisar_totem_token");
        setToken(null);
        setClaimPin("");
        setKioskState("STANDBY");
        playChime("error");
        speakVoice("Terminal desvinculada por Nutrición.");
        return;
      }

      if (res.ok && data.success && data.ticket) {
        // === CASO ÉXITO ===
        setTicketData(data.ticket);
        setKioskState("SUCCESS");

        // 1. Sonido instantáneo
        playChime("success");

        // 2. Locución por voz institucional adaptada
        if (data.ticket.isLateLunch) {
          speakVoice("Ración confirmada. Almuerzo tardío autorizado. Retire su ticket.");
        } else {
          speakVoice("Ración confirmada. Por favor retire su ticket.");
        }

        // 3. Impresión térmica silenciosa
        triggerThermalPrint();

        // 4. Temporizador de retorno automático al reposo (4 segundos)
        resetTimerRef.current = setTimeout(() => {
          setKioskState("STANDBY");
          setTicketData(null);
          setScanInput("");
        }, 4000);

      } else {
        // === CASO RECHAZO ===
        const errMsg = data.error || "No fue posible validar la entrega.";
        setErrorMessage(errMsg);
        setKioskState("REJECTED");

        // 1. Sonido de alerta
        playChime("error");

        // 2. Locución por voz adaptada según el error
        if (data.code === "CONSOLIDATED_VOUCHER" || data.code === "CONSOLIDATED_SERVICE") {
          speakVoice("Voucher consolidado. Por favor valide en nutrición.");
        } else if (data.code === "ALREADY_DELIVERED") {
          speakVoice("Atención: Esta ración ya fue retirada hoy.");
        } else if (data.code === "WRONG_MEAL_TIME") {
          speakVoice("Turno no coincidente. Su pedido es para el otro turno.");
        } else if (data.code === "NO_ORDER_FOUND") {
          speakVoice("No posee un pedido aprobado para este turno.");
        } else {
          speakVoice(errMsg);
        }

        // 3. Temporizador de retorno automático al reposo (5 segundos)
        resetTimerRef.current = setTimeout(() => {
          setKioskState("STANDBY");
          setErrorMessage("");
          setScanInput("");
        }, 5000);
      }
    } catch (err: any) {
      console.error("Error de comunicación con el tótem:", err);
      const connErr = "Error de conexión con el servidor hospitalario.";
      setErrorMessage(connErr);
      setKioskState("REJECTED");
      playChime("error");
      speakVoice(connErr);

      resetTimerRef.current = setTimeout(() => {
        setKioskState("STANDBY");
        setErrorMessage("");
        setScanInput("");
      }, 5000);
    }
  }, [token, kioskState, playChime, speakVoice, triggerThermalPrint, handlePairWithPin]);

  // 10. CAPTURA GLOBAL DE TECLADO Y BLOQUEO DE TECLAS DE ESCAPE KIOSK (ALTA SEGURIDAD)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Bloquear teclas de escape / inspección de navegador en modo quiosco
      // F1 a F12 (F11 pantalla completa, F12 inspector, F5 recargar, etc.)
      if (e.key.startsWith("F") && e.key.length <= 3) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Bloquear combinaciones de Ctrl / Meta (Ctrl+W, Ctrl+R, Ctrl+N, Ctrl+T, Ctrl+Shift+I, etc.)
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (["w", "r", "n", "t", "p", "s", "u", "i", "j"].includes(key) || (e.shiftKey && key === "i")) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      // Bloquear combinaciones con Alt
      if (e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (manualModalOpen) return;

      const now = Date.now();
      if (now - lastKeyTimeRef.current > 500) {
        bufferRef.current = "";
      }
      lastKeyTimeRef.current = now;

      if (e.key === "Enter") {
        e.preventDefault();
        const scanned = bufferRef.current || scanInput;
        bufferRef.current = "";
        setScanInput("");
        if (scanned) {
          processScanCode(scanned);
        }
      } else if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      // Desactivar menú contextual con botón derecho para evitar accesos indebidos
      e.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("contextmenu", handleContextMenu);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [manualModalOpen, scanInput, processScanCode]);

  // 11. SUBMIT DEL INPUT OCULTO
  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (scanInput) {
      processScanCode(scanInput);
      setScanInput("");
    }
  };

  // 12. LOGIN MANUAL DE RESPALDO
  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: manualUser, password: manualPass })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem("sisar_totem_token", data.token);
        setToken(data.token);
        setManualModalOpen(false);
        setManualUser("");
        setManualPass("");
        playChime("success");
        speakVoice("Sesión iniciada correctamente.");
      } else {
        setManualError(data.error || "Credenciales incorrectas.");
      }
    } catch (err: any) {
      setManualError("Error de conexión al iniciar sesión.");
    }
  };

  const handleUnlinkTotem = async () => {
    const result = await Swal.fire({
      title: "¿Desvincular esta terminal?",
      text: "La terminal quedará fuera de servicio y requerirá una nueva vinculación por PIN desde Nutrición.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Sí, desvincular",
      cancelButtonText: "Cancelar",
      background: "#0f172a",
      color: "#f8fafc"
    });

    if (result.isConfirmed) {
      localStorage.removeItem("sisar_totem_token");
      setToken(null);
      setHospitalNombre("Hospital");
      setClaimPin("");
      playChime("error");
      speakVoice("Terminal desvinculada.");
    }
  };

  return (
    <>
      {/* ===================================================================== */}
      {/* PLANTILLA DE IMPRESIÓN TÉRMICA (80MM) - SOLO VISIBLE AL IMPRIMIR      */}
      {/* ===================================================================== */}
      <style jsx global>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            width: 80mm !important;
            font-family: 'Courier New', Courier, monospace, sans-serif !important;
          }
          .kiosk-screen {
            display: none !important;
          }
          .thermal-ticket-container {
            display: block !important;
            width: 76mm !important;
            padding: 2mm 3mm !important;
            margin: 0 auto !important;
            color: #000000 !important;
            line-height: 1.25 !important;
          }
        }
        @media screen {
          .thermal-ticket-container {
            display: none !important;
          }
        }
        
        @keyframes laserSweep {
          0% { top: 10%; opacity: 0.3; }
          50% { top: 85%; opacity: 1; }
          100% { top: 10%; opacity: 0.3; }
        }
        .laser-beam {
          animation: laserSweep 2.2s infinite ease-in-out;
        }
      `}</style>

      {/* CONTENIDO DEL TICKET TÉRMICO */}
      <div className="thermal-ticket-container">
        {ticketData && (
          <div style={{ textAlign: "center", fontSize: "12px" }}>
            <div style={{ fontWeight: "bold", fontSize: "14px", textTransform: "uppercase" }}>
              {ticketData.hospital}
            </div>
            <div style={{ fontSize: "11px", margin: "3px 0" }}>
              SISTEMA DE ADMINISTRACIÓN DE RACIONES
            </div>
            <div style={{ fontSize: "11px", fontWeight: "bold" }}>
              ==========================================
            </div>
            <div style={{ fontSize: "15px", fontWeight: "bold", margin: "4px 0" }}>
              *** TICKET DE RETIRO ***
            </div>
            <div style={{ fontSize: "13px", fontWeight: "bold" }}>
              TURNO: {ticketData.turno.toUpperCase()}
            </div>
            <div style={{ fontSize: "11px", margin: "2px 0" }}>
              Fecha: {ticketData.fecha} | Hora: {ticketData.hora}
            </div>
            <div style={{ fontSize: "11px", fontWeight: "bold" }}>
              ------------------------------------------
            </div>
            <div style={{ textAlign: "left", fontSize: "13px", margin: "6px 0" }}>
              <div><strong>AGENTE:</strong> {ticketData.agenteNombre}</div>
              <div><strong>DNI:</strong> {ticketData.agenteDni}</div>
              <div><strong>SERVICIO:</strong> {ticketData.servicio}</div>
            </div>
            <div style={{ fontSize: "11px", fontWeight: "bold" }}>
              ==========================================
            </div>
            <div style={{
              margin: "8px 0",
              padding: "6px 2px",
              border: "2px dashed #000",
              fontSize: "17px",
              fontWeight: "900",
              textAlign: "center",
              letterSpacing: "0.5px"
            }}>
              DIETA: *** {ticketData.tipoDieta.toUpperCase()} ***
            </div>
            <div style={{ fontSize: "11px", fontWeight: "bold" }}>
              ==========================================
            </div>

            {/* CUADRO DE CADUCIDAD Y VALIDEZ MÁXIMA DEL COMPROBANTE */}
            <div style={{
              margin: "6px 0",
              padding: "4px 2px",
              border: "1px solid #000",
              textAlign: "center"
            }}>
              <div style={{ fontSize: "10px", fontWeight: "bold" }}>
                {ticketData.validezTexto || "VALIDEZ: MÁXIMO 20 MINUTOS DESDE SU EMISIÓN"}
              </div>
              <div style={{ fontSize: "13px", fontWeight: "900", marginTop: "2px" }}>
                VENCE: {ticketData.horaVencimiento ? `${ticketData.horaVencimiento} HS` : `${ticketData.hora} HS`}
              </div>
            </div>

            <div style={{
              fontSize: "10px",
              fontWeight: "900",
              margin: "5px 0 3px 0",
              textAlign: "center",
              textTransform: "uppercase",
              letterSpacing: "0.2px"
            }}>
              *** {ticketData.avisoCocina || "COCINA: RETENER Y DESCARTAR ESTE COMPROBANTE"} ***
            </div>

            <div style={{ fontSize: "11px", fontWeight: "bold" }}>
              ------------------------------------------
            </div>
            <div style={{
              fontSize: "12px",
              fontWeight: "bold",
              margin: "4px 0",
              textAlign: "center"
            }}>
              {ticketData.pie}
            </div>
            <div style={{ fontSize: "10px", marginTop: "6px", textAlign: "center" }}>
              Comprobante #{ticketData.id} - SisAR
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* PANTALLA PRINCIPAL MODO KIOSCO FULLSCREEN                             */}
      {/* ===================================================================== */}
      <main className="kiosk-screen fixed inset-0 z-50 flex flex-col justify-between select-none overflow-hidden font-sans bg-slate-950 text-slate-100">

        {/* INPUT TRAMPA DE FOCO */}
        <form onSubmit={handleInputSubmit} className="absolute opacity-0 pointer-events-none">
          <input
            ref={inputRef}
            type="text"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            autoComplete="off"
            autoFocus
          />
        </form>

        {/* ----------------------------------------------------------------- */}
        {/* BARRA SUPERIOR: ENCABEZADO INSTITUCIONAL Y RELOJ                  */}
        {/* ----------------------------------------------------------------- */}
        <header className={`w-full px-5 py-2.5 md:py-3 flex items-center justify-between border-b backdrop-blur-md transition-colors shrink-0 ${!token
            ? "border-amber-500/30 bg-amber-950/20"
            : "border-slate-800/80 bg-slate-900/60"
          }`}>
          {/* Logo y Hospital */}
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl shadow-lg transition-all ${!token
                ? "bg-gradient-to-tr from-amber-600 to-orange-600 shadow-amber-500/25 ring-2 ring-amber-500/40"
                : "bg-gradient-to-tr from-cyan-600 to-blue-600 shadow-cyan-500/20"
              }`}>
              {!token ? (
                <AlertTriangle className="w-6 h-6 text-white" />
              ) : (
                <Hospital className="w-6 h-6 text-white" />
              )}
            </div>
            <div>
              <div className={`text-[10px] md:text-xs uppercase tracking-widest font-black ${!token ? "text-amber-400" : "text-cyan-400"
                }`}>
                {!token ? "Terminal Fuera de Servicio" : "Terminal de Autoservicio"}
              </div>
              <h1 className={`text-lg md:text-xl font-black tracking-tight ${!token ? "text-amber-200" : "text-white"
                }`}>
                {!token ? "TERMINAL DESVINCULADA" : hospitalNombre}
              </h1>
            </div>
          </div>

          {/* Turno Activo y Reloj */}
          <div className="flex items-center gap-3 md:gap-4">
            {/* Badge de Turno */}
            {!token ? (
              <div className="px-3 py-1.5 rounded-xl text-xs font-black tracking-wide flex items-center gap-2 bg-slate-800/90 text-slate-400 border border-slate-700 shadow-sm">
                <span>⚙️</span>
                <span>MODO ACTIVACIÓN</span>
              </div>
            ) : (
              <div className={`px-3.5 py-1.5 rounded-xl text-xs font-black tracking-wide flex items-center gap-2 shadow-sm ${activeTurno === "Almuerzo"
                  ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-amber-500/20"
                  : "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-purple-500/20"
                }`}>
                <span>{activeTurno === "Almuerzo" ? "☀️" : "🌙"}</span>
                <span>TURNO {activeTurno.toUpperCase()}</span>
              </div>
            )}

            {/* Reloj Digital en Vivo */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 rounded-xl border border-slate-700">
              <Clock className={`w-4 h-4 ${!token ? "text-amber-400" : "text-cyan-400"}`} />
              <span className="text-base md:text-lg font-mono font-bold text-white tracking-wider">
                {currentTime}
              </span>
            </div>

            {/* Indicador de Estado */}
            {!token ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-950/90 border border-amber-500/50 rounded-lg text-amber-300 text-[11px] font-black animate-pulse shadow-md shadow-amber-500/20">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                DESVINCULADA
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/60 border border-emerald-500/30 rounded-lg text-emerald-400 text-[11px] font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                EN LÍNEA
              </div>
            )}
          </div>
        </header>

        {/* ----------------------------------------------------------------- */}
        {/* CUERPO CENTRAL SEGÚN EL ESTADO DEL TÓTEM                         */}
        {/* ----------------------------------------------------------------- */}
        <section className="flex-1 min-h-0 flex items-center justify-center p-3 md:p-4 relative overflow-hidden">

          {/* CASO: TERMINAL NO VINCULADA (DISEÑO EXCLUSIVO ÁMBAR / ALERTA) */}
          {!token && (
            <div className="flex flex-col items-center justify-center max-w-xl w-full text-center relative z-10 py-1">
              {/* Ícono animado central compacto */}
              <div className="relative w-24 h-24 md:w-28 md:h-28 mb-2 p-2 bg-gradient-to-b from-amber-950/40 to-slate-900/90 border-2 border-dashed border-amber-500/60 rounded-2xl shadow-xl shadow-amber-500/10 flex flex-col items-center justify-center shrink-0">
                <div className="relative flex items-center justify-center">
                  <div className="absolute inset-0 -m-2 rounded-full bg-amber-500/20 animate-ping opacity-60"></div>
                  <div className="w-14 h-14 md:w-16 md:h-16 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center relative shadow-inner">
                    <QrCode className="w-8 h-8 md:w-9 md:h-9 text-amber-400" />
                    <div className="absolute -top-2 -right-2 p-1 bg-rose-600 text-white rounded-lg shadow-md border-2 border-slate-950">
                      <Link2Off className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Banner de Estado */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] font-black uppercase tracking-wider mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                TERMINAL FUERA DE SERVICIO - REQUIERE VINCULACIÓN
              </div>

              <h2 className="text-xl md:text-2xl font-black text-white tracking-tight mb-1">
                VINCULACIÓN DE TERMINAL TÓTEM
              </h2>

              {/* DESTACADO: PIN DE VINCULACIÓN REMOTA */}
              {claimPin ? (
                <div className="my-3 px-6 py-3 bg-gradient-to-r from-amber-950/90 via-slate-900 to-amber-950/90 border-2 border-amber-400 rounded-2xl shadow-xl shadow-amber-500/20 flex flex-col items-center max-w-sm w-full">
                  <span className="text-[10px] uppercase tracking-widest text-amber-400 font-extrabold">
                    PIN DE VINCULACIÓN REMOTA
                  </span>
                  <span className="text-3xl md:text-4xl font-mono font-black text-amber-300 tracking-widest drop-shadow my-1">
                    {claimPin.slice(0, 3)} - {claimPin.slice(3)}
                  </span>
                  <span className="text-xs text-slate-300">
                    Ingrese este PIN en la computadora de Nutrición
                  </span>
                </div>
              ) : (
                <div className="my-3 px-5 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-slate-400">
                  Generando PIN de terminal...
                </div>
              )}

              <p className="text-xs text-slate-400 font-medium max-w-sm mb-3 leading-relaxed">
                Abra la pantalla de <strong className="text-amber-300">Nutrición</strong>, haga clic en <strong>"Vincular Tótem"</strong> e introduzca el número PIN que ve aquí arriba para activarla.
              </p>

              {pinError && (
                <div className="p-2 bg-rose-950/80 border border-rose-500/50 rounded-xl text-xs text-rose-200 font-bold mb-2 shadow-md max-w-md">
                  ⚠️ {pinError}
                </div>
              )}
            </div>
          )}

          {/* CASO: STANDBY (EN ESPERA DE ESCANEO) */}
          {token && kioskState === "STANDBY" && (
            <div className="flex flex-col items-center justify-center max-w-xl w-full text-center py-1">
              {/* Animación del Escáner Láser compacto */}
              <div className="relative w-28 h-28 md:w-32 md:h-32 mb-2 p-3 bg-slate-900/80 border-2 border-cyan-500/40 rounded-2xl shadow-xl shadow-cyan-500/15 flex items-center justify-center overflow-hidden shrink-0">
                <div className="laser-beam absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-lg shadow-cyan-400/80 z-20"></div>
                <QrCode className="w-16 h-16 md:w-18 md:h-18 text-cyan-500/40 z-10" />
                <div className="absolute inset-0 bg-radial-gradient from-cyan-500/10 to-transparent"></div>
              </div>

              {/* Título de Acción */}
              <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-1.5">
                ACERQUE SU DNI O VOUCHER
              </h2>
              <p className="text-xs md:text-sm text-slate-300 font-medium max-w-md mb-3 leading-relaxed">
                Apoye el código de barras del DNI o el código QR de su voucher frente al lector óptico.
              </p>

              {/* Guía Visual Rápida */}
              <div className="grid grid-cols-2 gap-2.5 w-full max-w-sm">
                <div className="p-2 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center gap-2 text-left">
                  <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg font-black text-sm">
                    🪪
                  </div>
                  <div>
                    <div className="font-bold text-white text-xs">DNI Físico</div>
                    <div className="text-[10px] text-slate-400">Código de barras PDF417</div>
                  </div>
                </div>

                <div className="p-2 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center gap-2 text-left">
                  <div className="p-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg font-black text-sm">
                    🧾
                  </div>
                  <div>
                    <div className="font-bold text-white text-xs">Voucher Individual</div>
                    <div className="text-[10px] text-slate-400">Código QR impreso</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CASO: PROCESANDO */}
          {token && kioskState === "PROCESSING" && (
            <div className="flex flex-col items-center justify-center text-center py-2">
              <div className="w-16 h-16 md:w-20 md:h-20 mb-3 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-cyan-400" />
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-1">
                Verificando Ración...
              </h2>
              <p className="text-xs md:text-sm text-slate-400">
                Aguarde un instante mientras validamos su pedido.
              </p>
            </div>
          )}

          {/* CASO: ÉXITO (VERDE ESMERALDA) */}
          {token && kioskState === "SUCCESS" && ticketData && (
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-700 via-teal-800 to-green-900 flex flex-col items-center justify-center p-4 text-center z-30 overflow-hidden">
              {/* Ícono de Éxito */}
              <div className="w-14 h-14 md:w-16 md:h-16 mb-2 bg-white/20 rounded-full flex items-center justify-center text-white shadow-xl backdrop-blur-sm animate-bounce shrink-0">
                <CheckCircle2 className="w-8 h-8 md:w-10 md:h-10" />
              </div>

              {/* Mensaje de Confirmación */}
              <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-1">
                ¡Ración confirmada!
              </h2>
              <p className="text-xs md:text-sm text-emerald-100 font-semibold mb-2.5 flex items-center gap-1.5">
                <Printer className="w-4 h-4 animate-pulse" />
                Imprimiendo ticket... Por favor retírelo para cocina
              </p>

              {/* Tarjeta de Datos del Agente */}
              <div className="max-w-md w-full p-3.5 bg-white/10 border border-white/20 rounded-2xl backdrop-blur-md text-white text-left shadow-xl mb-2.5">
                <div className="text-[10px] uppercase tracking-wider text-emerald-200 font-bold mb-0.5">
                  Agente Habilitado
                </div>
                <div className="text-lg md:text-xl font-extrabold mb-1.5 text-white">
                  {ticketData.agenteNombre}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-2 text-emerald-100">
                  <div>
                    <span className="opacity-75">DNI:</span> <strong>{ticketData.agenteDni}</strong>
                  </div>
                  <div>
                    <span className="opacity-75">Servicio:</span> <strong>{ticketData.servicio}</strong>
                  </div>
                </div>

                {/* Dieta Destacada */}
                <div className="p-2 bg-white/20 rounded-xl border border-white/30 text-center">
                  <div className="text-[9px] uppercase tracking-widest text-emerald-100 font-bold mb-0.5">
                    Ración Asignada
                  </div>
                  <div className="text-base md:text-lg font-black tracking-wide text-white">
                    DIETA: *** {ticketData.tipoDieta.toUpperCase()} ***
                  </div>
                </div>
              </div>

              <div className="text-xs text-emerald-200 font-medium">
                Esta pantalla volverá al inicio automáticamente en segundos...
              </div>
            </div>
          )}

          {/* CASO: RECHAZO / ERROR (ROJO CARMESÍ) */}
          {token && kioskState === "REJECTED" && (
            <div className="absolute inset-0 bg-gradient-to-br from-rose-800 via-red-800 to-red-950 flex flex-col items-center justify-center p-4 text-center z-30 overflow-hidden">
              {/* Ícono de Rechazo */}
              <div className="w-14 h-14 md:w-16 md:h-16 mb-2 bg-white/20 rounded-full flex items-center justify-center text-white shadow-xl backdrop-blur-sm shrink-0">
                <XCircle className="w-8 h-8 md:w-10 md:h-10 animate-pulse" />
              </div>

              {/* Título de Alerta */}
              <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-2">
                No se pudo entregar ración
              </h2>

              {/* Mensaje de Error Específico */}
              <div className="max-w-md w-full p-3.5 bg-white/10 border border-white/20 rounded-2xl backdrop-blur-md text-white text-center shadow-xl mb-3">
                <div className="text-base md:text-lg font-bold text-white leading-snug">
                  {errorMessage}
                </div>
              </div>

              <div className="text-xs text-rose-200 font-medium">
                La terminal se reiniciará en 5 segundos...
              </div>
            </div>
          )}

        </section>

        {/* ----------------------------------------------------------------- */}
        {/* BARRA INFERIOR: GUÍA Y CONTROLES DE SISTEMA                       */}
        {/* ----------------------------------------------------------------- */}
        <footer className="w-full px-5 py-2 md:py-2.5 border-t border-slate-800/80 bg-slate-900/60 backdrop-blur-md flex items-center justify-between text-[11px] md:text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Respuesta con audio y voz en español</span>
          </div>

          <div className="flex items-center gap-4">
            {token && (
              <button
                onClick={handleUnlinkTotem}
                className="hover:text-rose-400 transition-colors flex items-center gap-1.5"
                title="Desvincular terminal"
              >
                <LogOut className="w-3 h-3" />
                Desvincular
              </button>
            )}
            <span>SisAR Totem v1.0 &copy; 2026</span>
          </div>
        </footer>

        {/* ----------------------------------------------------------------- */}
        {/* MODAL DE LOGIN MANUAL (RESPALDO DE CONFIGURACIÓN)                 */}
        {/* ----------------------------------------------------------------- */}
        {manualModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white shadow-2xl">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
                Acceso Manual de Terminal
              </h3>
              {manualError && (
                <div className="p-3 mb-4 bg-rose-950/60 border border-rose-500/40 rounded-xl text-xs text-rose-300">
                  {manualError}
                </div>
              )}
              <form onSubmit={handleManualLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Usuario
                  </label>
                  <input
                    type="text"
                    value={manualUser}
                    onChange={(e) => setManualUser(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    value={manualPass}
                    onChange={(e) => setManualPass(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setManualModalOpen(false)}
                    className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-cyan-600/20"
                  >
                    Vincular Tótem
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>
    </>
  );
}
