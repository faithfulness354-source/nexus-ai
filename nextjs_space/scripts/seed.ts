import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DEFAULT_CHARACTERS } from '../lib/default-cards';
import { TIERS, TIER_ORDER } from '../lib/tiers';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Admin accounts (creator whitelist). Existing passwords are never overwritten.
  const admins = [
    { email: 'test-admin@example.com', password: process.env.SEED_TEST_ADMIN_PASSWORD ?? '', name: 'Test Admin' },
    { email: 'faithfulness354@gmail.com', password: process.env.SEED_CREATOR_PASSWORD ?? '', name: 'Creator' },
  ].filter((a) => a.password);
  for (const a of admins) {
    await prisma.user.upsert({
      where: { email: a.email },
      update: { role: 'CREATOR_ADMIN', isWhitelisted: true },
      create: { email: a.email, name: a.name, password: await bcrypt.hash(a.password, 12), role: 'CREATOR_ADMIN', isWhitelisted: true },
    });
  }

  for (const card of DEFAULT_CHARACTERS) {
    await prisma.character.upsert({
      where: { id: card.id },
      update: {},
      create: card,
    });
  }

  // Seed default provider configs
  // Google Gemini is the default primary provider; OpenAI is not supported.
  const providers = ['GEMINI', 'ANTHROPIC', 'OPENROUTER', 'CUSTOM'] as const;
  for (const provider of providers) {
    await prisma.providerConfig.upsert({
      where: { provider },
      update: {},
      create: {
        provider,
        isActive: provider === 'GEMINI',
        defaultModel: provider === 'GEMINI' ? 'gemini-flash-latest' : null,
      },
    });
  }

  // Subscription plan prices ($0 / $9.99 / $19.99 / $49.99). Stripe price IDs are kept as-is.
  for (const t of TIER_ORDER) {
    const def = TIERS[t];
    const priceCents = Math.round(def.price * 100);
    await prisma.subscriptionPlan.upsert({
      where: { tier: t },
      update: { name: def.name, priceCents },
      create: { tier: t, name: def.name, priceCents },
    });
  }

  console.log('Seed complete!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
