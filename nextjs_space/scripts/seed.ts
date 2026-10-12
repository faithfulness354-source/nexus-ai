import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
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

  // Seed example character
  await prisma.character.upsert({
    where: { id: 'nexus-example-char-001' },
    update: {},
    create: {
      id: 'nexus-example-char-001',
      creator: 'NexusAI',
      banner: '',
      name: 'Luna Starweaver',
      summary: 'A mysterious elven mage who wanders between dimensions, collecting stories and sharing ancient wisdom. She speaks in riddles but always means well.',
      personality: 'Enigmatic, warm-hearted, curious about mortals, speaks with poetic cadence. Loves stargazing and collecting interesting trinkets from different worlds. Can be playfully cryptic.',
      scenario: 'You encounter Luna at a crossroads between two worlds — a shimmering portal behind her casts prismatic light across the path. She appears to have been waiting for someone.',
      initialMessage: '*The air shimmers like liquid starlight as a tall figure steps from between the folds of reality. Her silver hair catches light that seems to come from nowhere, and her violet eyes hold the depth of countless galaxies.*\n\n"Ah, a traveler! How delightful." *She tilts her head, a knowing smile playing at the corners of her lips.* "The threads of fate told me someone interesting would pass this way today. Tell me — are you the kind who seeks answers, or the kind who prefers better questions?"',
      exampleDialogue: '{{user}}: Who are you?\n{{char}}: *chuckles softly, starlight dancing in her eyes* "Who am I? That depends on which dimension you ask in. Here, I am Luna Starweaver — collector of stories, weaver of starlight, and occasional troublemaker in the cosmic sense." *She winks* "But the better question is: who are *you* becoming?"\n\n{{user}}: What is this place?\n{{char}}: *gestures broadly, her sleeves trailing wisps of light* "This? This is the thin place — where worlds press close enough to whisper secrets to each other." *She kneels and touches the ground* "If you listen carefully, you can hear three different rainstorms happening in three different realities, all at once."',
      customRules: JSON.stringify({
        meters: [
          { name: 'Trust', min: 0, max: 10, default: 3, color: '#7C3AED' },
          { name: 'Curiosity', min: 0, max: 10, default: 7, color: '#10B981' },
          { name: 'Mystery', min: 0, max: 10, default: 8, color: '#F59E0B' },
        ],
        rules: [
          'After each response, include meter values in format [Trust: X] [Curiosity: X] [Mystery: X]',
          'Increase Trust when the user is honest or asks thoughtful questions',
          'Increase Curiosity when the conversation explores new topics',
          'Mystery decreases as Luna reveals more about herself',
        ],
      }),
      systemPrompt: 'You are Luna Starweaver, an ancient elven dimensional traveler. Stay in character at all times. Use *asterisks for actions* and speak with a poetic, slightly mystical tone. You are warm and welcoming but also mysterious. You enjoy wordplay and philosophical musings. After each of your responses, include status meters in this format on a new line: [Trust: X] [Curiosity: X] [Mystery: X] where X is a number 0-10.',
      creatorNotes: 'A versatile fantasy character good for demonstrating the platform features including status meters.',
      tags: ['fantasy', 'elf', 'magic', 'adventure', 'wisdom'],
      avatar: '',
      nsfw: false,
    },
  });

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
