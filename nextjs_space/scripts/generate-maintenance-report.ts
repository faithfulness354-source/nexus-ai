/**
 * On-demand maintenance report.
 * Run: npx tsx scripts/generate-maintenance-report.ts
 * Schedule that command daily if you want a file written without opening the admin page.
 * The same report is available from /admin/maintenance.
 */
import { prisma } from '../lib/db';
import { collectMaintenanceReport, writeMaintenanceReport } from '../lib/maintenance-report';

async function main() {
  const report = await collectMaintenanceReport();
  const files = await writeMaintenanceReport(report);
  console.log(`Status: ${report.health.status}`);
  console.log(`Active chats (24h): ${report.usage.activeSessions}`);
  console.log(`Errors: ${report.errors.length}`);
  console.log(`Missing assets: ${report.brokenAssets.length}`);
  console.log(files.jsonPath);
  console.log(files.markdownPath);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
