const { PrismaClient } = require('@prisma/client'); 
const prisma = new PrismaClient(); 
prisma.servicios.findMany({ include: { _count: { select: { Personal: true } } } })
  .then(console.log)
  .catch(console.error)
  .finally(()=>prisma.$disconnect());
