import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_USERS: { email: string; fullName: string; role: Role; password: string; badgeNumber: string }[] = [
  { email: 'admin@iis.local', fullName: 'System Administrator', role: Role.ADMINISTRATOR, password: 'Admin@123', badgeNumber: 'ADM-001' },
  { email: 'investigator@iis.local', fullName: 'Priya Sharma', role: Role.INVESTIGATOR, password: 'Investigator@123', badgeNumber: 'INV-101' },
  { email: 'supervisor@iis.local', fullName: 'Rakesh Verma', role: Role.SUPERVISOR, password: 'Supervisor@123', badgeNumber: 'SUP-201' },
  { email: 'auditor@iis.local', fullName: 'Anita Desai', role: Role.AUDITOR, password: 'Auditor@123', badgeNumber: 'AUD-301' },
];

async function main() {
  for (const demo of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(demo.password, 12);
    await prisma.user.upsert({
      where: { email: demo.email },
      update: {},
      create: {
        email: demo.email,
        passwordHash,
        fullName: demo.fullName,
        role: demo.role,
        badgeNumber: demo.badgeNumber,
      },
    });
    console.log(`Seeded ${demo.role} account: ${demo.email} / ${demo.password}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
