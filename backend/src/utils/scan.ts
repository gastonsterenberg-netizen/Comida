/**
 * Extrae un DNI válido (7 u 8 dígitos) desde cualquier formato de escaneo de código de barras o lector PDF417:
 * 1. Formato nuevo DNI con separador '@' (00300123456@APELLIDO@NOMBRE@M@37311650@...)
 * 2. Formato antiguo DNI PDF417 sin '@' usando '2' como separador (ej: 007460592322SILVA TESEIRA2LEONARDO RICARDO2M2220733292B19/03/1971207/02/20262208)
 * 3. Formato Carnet de Conducir / Licencia de Conducir (multilínea o espacio separado)
 * 4. Texto plano con prefijo "DNI: 37311650" o solo dígitos "37311650"
 */
export function extractDniFromScan(rawCode: string): string | null {
  if (!rawCode) return null;
  const clean = rawCode.trim();

  // 1. Prefijo explícito tipo "DNI: 12345678" o "DNI 12345678"
  const dniPrefixMatch = clean.match(/\bDNI\b\s*[:=]?\s*(\d{7,8})\b/i);
  if (dniPrefixMatch && dniPrefixMatch[1]) {
    return dniPrefixMatch[1];
  }

  // 2. Formato multilínea (Carnet de conducir o PDF417 de varias líneas)
  if (clean.includes('\n') || clean.includes('\r')) {
    const lines = clean.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    
    // Buscar si hay una línea 'DNI' y la siguiente línea contiene el número
    for (let i = 0; i < lines.length; i++) {
      if (/^DNI$/i.test(lines[i]) && i + 1 < lines.length) {
        const nextLineMatch = lines[i + 1].match(/^\d{7,8}$/);
        if (nextLineMatch) return nextLineMatch[0];
      }
    }

    // Buscar entre las líneas una que contenga estrictamente 7 u 8 dígitos
    for (const line of lines) {
      if (/^\d{7,8}$/.test(line)) {
        return line;
      }
    }
  }

  // 3. Formato DNI nuevo PDF417 con separador '@'
  // Ejemplo: 00300123456@APELLIDO@NOMBRE@M@37311650@A@01/01/1990@01/01/2020@200
  if (clean.includes('@')) {
    const parts = clean.split('@').map(p => p.trim());
    if (parts[4] && /^\d{7,8}$/.test(parts[4])) {
      return parts[4];
    }
    for (const part of parts) {
      if (/^\d{7,8}$/.test(part)) {
        return part;
      }
    }
    const match = clean.match(/(?<!\d)\d{7,8}(?!\d)/);
    if (match) return match[0];
  }

  // 4. Formato DNI antiguo PDF417 sin '@' (usa '2' como separador entre campos)
  // Ejemplos:
  // 007460592322SILVA TESEIRA2LEONARDO RICARDO2M2220733292B19/03/1971207/02/20262208 -> 22073329
  // 005356992172STERENBERG2GASTON2M2373116502B209/03/1993218/02/20182206 -> 37311650
  // Patrón alrededor de Sexo: [MFX] seguido opcionalmente de '2', luego 7 u 8 dígitos de DNI, seguido de '2' y la letra del ejemplar (A, B, C, etc.)
  const oldDniMatch = clean.match(/[MFXmfx]2?(\d{7,8})2?[A-Za-z]/);
  if (oldDniMatch && oldDniMatch[1]) {
    return oldDniMatch[1];
  }

  // Coincidencia genérica de Sexo + separador + DNI: ej. M237311650 o F12345678
  const sexDniMatch = clean.match(/[MFXmfx]\D*?(\d{7,8})/i);
  if (sexDniMatch && sexDniMatch[1]) {
    return sexDniMatch[1];
  }

  // 5. Buscar secuencia independiente de 7 u 8 dígitos (delimitada por no-dígitos)
  const boundaryMatch = clean.match(/(?<!\d)\d{7,8}(?!\d)/);
  if (boundaryMatch) {
    return boundaryMatch[0];
  }

  // 6. Respaldo directo si la entrada completa son 7 u 8 dígitos
  const directMatch = clean.match(/\d{7,8}/);
  if (directMatch) {
    return directMatch[0];
  }

  return clean;
}
