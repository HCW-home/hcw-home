// scripts/create-admin.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const existingAdmin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  });

  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        firstName:'Admin',
        lastName:"User",
        email: 'admin@gmail.com',
        password: 'admin',
        role: 'ADMIN',
        status:'APPROVED',
      },
    });
    console.log('Admin user created');
  } else {
    console.log('ℹAdmin user already exists');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
