// Evaluated FIRST (before any module that instantiates PrismaClient) so the seed
// works whether or not a .env is loaded. Matches prisma/schema.prisma's relative
// SQLite path (resolved next to the schema → prisma/dev.db).
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db';
}
