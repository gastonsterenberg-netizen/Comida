const { PrismaClient } = require('@prisma/client'); 
const prisma = new PrismaClient(); 
prisma.personal.count().then(c => console.log("TOTAL PERSONAL:", c))
  .catch(console.error)
  .finally(()=>prisma.$disconnect());
