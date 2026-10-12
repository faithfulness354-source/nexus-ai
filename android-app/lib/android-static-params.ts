import { prisma } from '@/lib/db';

export async function characterStaticParams(): Promise<{ id: string }[]> {
  try {
    const rows = await prisma.character.findMany({ select: { id: true } });
    return rows.map((row) => ({ id: row.id }));
  } catch {
    return [];
  }
}

export async function usernameStaticParams(): Promise<{ username: string }[]> {
  try {
    const rows = await prisma.user.findMany({
      where: { username: { not: null } },
      select: { username: true },
    });
    return rows.flatMap((row) => {
      const username = row.username?.trim();
      return username ? [{ username }] : [];
    });
  } catch {
    return [];
  }
}
