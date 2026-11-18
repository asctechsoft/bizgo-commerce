import { PrismaClient } from '@prisma/client';
import { seedAll } from './seed';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient();
  try {
    const report = await seedAll(prisma);
    console.log('Seed complete:', JSON.stringify(report));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
