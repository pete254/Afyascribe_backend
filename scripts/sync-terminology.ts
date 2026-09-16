import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TerminologySyncService } from '../src/terminology/terminology-sync.service';

/**
 * Sync KNHTS (OCL) sources into the terminology mirror.
 *
 *   npm run sync:terminology                 # all default sources
 *   npm run sync:terminology -- --optional   # include optional (e.g. full LOINC)
 *   npm run sync:terminology -- WHO ICD-11   # a single org/source
 *
 * Run on Render (the shell reaches both KNHTS and the database).
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const sync = app.get(TerminologySyncService);
  try {
    const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    if (args.length === 2) {
      const [org, source] = args;
      const n = await sync.syncSource(org, source);
      console.log(`Done: ${org}/${source} → ${n} concepts`);
    } else {
      const includeOptional = process.argv.includes('--optional');
      const out = await sync.syncAll(includeOptional);
      console.log('Done:', out);
    }
  } catch (e) {
    console.error('Sync failed:', (e as Error).message);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main();
