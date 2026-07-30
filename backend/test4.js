const { PrismaClient } = require('@prisma/client'); 
const prisma = new PrismaClient(); 
prisma.servicios.findMany({ 
  take: 10,
  include: { _count: { select: { Personal: true } } } 
})
  .then(res => console.dir(res, { depth: null }))
  .finally(()=>prisma.$disconnect());
