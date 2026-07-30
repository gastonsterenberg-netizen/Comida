const { PrismaClient } = require('@prisma/client'); 
const prisma = new PrismaClient(); 
prisma.personal.groupBy({ by: ['ServicioId'], _count: true }).then(console.log).finally(()=>prisma.$disconnect());
