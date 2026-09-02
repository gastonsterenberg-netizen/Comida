/**
 * Extrae un DNI válido (7 u 8 dígitos) desde cualquier formato de escaneo de código de barras o lector PDF417:
 * 1. Formato RENAPER PDF417 continuo (00238295166PISTANANGEL DARIOM26454684A04/09/197808/01/2014) -> 26454684
 * 2. Formato nuevo DNI con separador '@' (00300123456@APELLIDO@NOMBRE@M@37311650@...) -> 37311650
 * 3. Formato antiguo DNI PDF417 sin '@' usando '2' como separador (007460592322SILVA TESEIRA2LEONARDO RICARDO2M2220733292B...) -> 22073329
 * 4. Formato Carnet de Conducir / Licencia de Conducir (multilínea o espacio separado)
 * 5. Texto plano con prefijo "DNI: 37311650" o solo dígitos "37311650"
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

  // 4. Formato PDF417 RENAPER DNI argentino sin '@' (Nuevo formato continuo sin separador '2')
  // Ejemplo: 00238295166PISTANANGEL DARIOM26454684A04/09/197808/01/2014
  // Estructura: ... + Sexo (M/F/X) + DNI (7 u 8 dígitos) + Ejemplar (A-Z) + FechaNac (DD/MM/YYYY)
  const renaperDirectMatch = clean.match(/[MFXmfx]\s*(\d{7,8})\s*[A-Za-z]\s*\d{2}\/\d{2}\/\d{4}/);
  if (renaperDirectMatch && renaperDirectMatch[1]) {
    return renaperDirectMatch[1];
  }

  // 5. Formato DNI antiguo PDF417 sin '@' (Usa '2' como separador entre campos)
  // Ejemplo: 007460592322SILVA TESEIRA2LEONARDO RICARDO2M2220733292B19/03/1971207/02/20262208
  const oldDniMatch = clean.match(/[MFXmfx]2(\d{7,8})2[A-Za-z]/);
  if (oldDniMatch && oldDniMatch[1]) {
    return oldDniMatch[1];
  }

  // 6. Coincidencia genérica de Sexo + DNI de 7 u 8 dígitos seguido de letra de Ejemplar
  const sexDniLetterMatch = clean.match(/[MFXmfx]\s*(\d{7,8})[A-Za-z]/i);
  if (sexDniLetterMatch && sexDniLetterMatch[1]) {
    return sexDniLetterMatch[1];
  }

  const sexDniMatch = clean.match(/[MFXmfx]\s*(\d{7,8})/i);
  if (sexDniMatch && sexDniMatch[1]) {
    return sexDniMatch[1];
  }

  // 7. Buscar secuencia independiente de 7 u 8 dígitos (delimitada por no-dígitos)
  const boundaryMatch = clean.match(/(?<!\d)\d{7,8}(?!\d)/);
  if (boundaryMatch) {
    return boundaryMatch[0];
  }

  // 8. Respaldo directo si se encuentra cualquier número de 7 u 8 dígitos
  const directMatch = clean.match(/\d{7,8}/);
  if (directMatch) {
    return directMatch[0];
  }

  return clean;
}
