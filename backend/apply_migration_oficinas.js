const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando aplicación de migración Fase 5 (Oficinas) en BD local...');
  let sqlPath = path.join(__dirname, '../database/migration_oficinas_catering_versatil.sql');
  if (!fs.existsSync(sqlPath)) {
    sqlPath = '/database_migration_oficinas.sql';
  }
  const sqlContent = fs.readFileSync(sqlPath, 'utf8');

  // Clean batches
  const batches = sqlContent
    .split(/^\s*GO\s*$/gmi)
    .map(b => b.trim())
    .map(b => b.replace(/BEGIN\s+TRANSACTION;?/gi, '').replace(/COMMIT\s+TRANSACTION;?/gi, '').replace(/SET\s+XACT_ABORT\s+ON;?/gi, '').trim())
    .filter(b => b.length > 0 && !b.startsWith('USE '));

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    try {
      console.log(`Ejecutando lote ${i + 1}/${batches.length}...`);
      await prisma.$executeRawUnsafe(batch);
    } catch (err) {
      console.error(`Error en lote ${i + 1}:`, err.message);
      // If error is about already existing objects or USE, continue or inspect
      if (!err.message.includes('already exists') && !err.message.includes('ya existe')) {
        throw err;
      }
    }
  }

  console.log('¡Migración de Fase 5 aplicada exitosamente en la base de datos local!');
}

main()
  .catch(e => {
    console.error('Error fatal al aplicar migración:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
