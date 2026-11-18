import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

const hash = (password) => bcrypt.hash(password, 10);

async function upsertUser(email, name, role, password) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      email,
      name,
      role,
      passwordHash: await hash(password),
      active: true,
      mustChangePassword: false,
    },
  });
}

async function main() {
  const admin = await upsertUser('admin@localhost', 'Administrador', 'ADMIN', 'admin123');
  const enc1 = await upsertUser('encargado1@localhost', 'Ana - Encargado turno mañana', 'ENCARGADO', 'enc12345');
  const enc2 = await upsertUser('encargado2@localhost', 'Luis - Encargado turno tarde', 'ENCARGADO', 'enc23456');

  await prisma.shiftTemplate.deleteMany({ where: { userId: { in: [enc1.id, enc2.id] } } });
  await prisma.shiftTemplate.createMany({
    data: [
      ...[1, 2, 3, 4, 5, 6].map((weekday) => ({
        userId: enc1.id,
        weekday,
        startTime: '08:00',
        endTime: '14:00',
      })),
      ...[1, 2, 3, 4, 5, 6].map((weekday) => ({
        userId: enc2.id,
        weekday,
        startTime: '14:00',
        endTime: '22:30',
      })),
    ],
  });

  const products = [
    { sku: 'CHI-001', name: 'Chicle', category: 'Golosinas', salePrice: '1.00', lastCost: '0.60', stock: '100', minStock: '20', reorderQty: '50', unit: 'unidad' },
    { sku: 'SOD-001', name: 'Soda lata', category: 'Bebidas', salePrice: '5.00', lastCost: '3.20', stock: '48', minStock: '12', reorderQty: '24', unit: 'lata' },
    { sku: 'NAC-001', name: 'Nachos', category: 'Snacks', salePrice: '8.00', lastCost: '5.00', stock: '30', minStock: '10', reorderQty: '20', unit: 'paquete' },
    { sku: 'PAP-001', name: 'Papas', category: 'Snacks', salePrice: '8.00', lastCost: '5.00', stock: '30', minStock: '10', reorderQty: '20', unit: 'paquete' },
  ];
  for (const product of products) {
    await prisma.item.upsert({
      where: { sku: product.sku },
      update: {},
      create: { type: 'PRODUCTO', active: true, ...product },
    });
  }
  await prisma.item.upsert({
    where: { sku: 'SRV-IMP' },
    update: {},
    create: {
      type: 'SERVICIO',
      sku: 'SRV-IMP',
      name: 'Impresión por página',
      category: 'Servicios',
      salePrice: '2.00',
      active: true,
    },
  });

  const settings = {
    qrImageUrl: '',
    qrLabel: 'QR fijo del centro',
    closeTime: '22:30',
    closeGraceMinutes: 60,
    openingAmountDefault: '0',
    adminEmail: 'admin@localhost',
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }

  const genesisPayload = {
    prevHash: 'GENESIS',
    action: 'SYSTEM_SEED',
    entity: 'System',
    entityId: null,
    before: null,
    after: { seededUsers: 3 },
    reason: null,
    actorId: null,
    actorRole: null,
    ip: null,
    userAgent: null,
  };
  const stableStringify = (value) => {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  };
  const genesisHash = createHash('sha256')
    .update(`GENESIS${stableStringify(genesisPayload)}`)
    .digest('hex');
  const genesis = await prisma.auditLog.findFirst({ where: { action: 'SYSTEM_SEED' } });
  if (!genesis) {
    await prisma.auditLog.create({
      data: {
        prevHash: 'GENESIS',
        hash: genesisHash,
        action: 'SYSTEM_SEED',
        entity: 'System',
        after: { seededUsers: 3 },
      },
    });
  }

  console.log('Seed listo.');
  console.log('Admin: admin@localhost / admin123');
  console.log('Encargado mañana: encargado1@localhost / enc12345');
  console.log('Encargado tarde: encargado2@localhost / enc23456');
  console.log(`Admin id: ${admin.id}`);
  void enc1;
  void enc2;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
