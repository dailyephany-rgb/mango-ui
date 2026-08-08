/**
 * LEGACY — eng_* merge into clinical vasundhara-4c6e5 is RETIRED.
 *
 * Use the dedicated Engineering project instead:
 *   npm run eng:pull-config
 *   npm run eng:deploy
 *
 * This script now refuses to run. Clinical firestore.rules denies eng_*.
 * Do not re-enable shared-project telemetry writes.
 */

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

fail(
  "eng:ops-deploy is DISABLED.\n\n" +
    "Engineering telemetry must use project mango-engineering, not vasundhara-4c6e5.\n" +
    "Use:\n" +
    "  npm run eng:pull-config\n" +
    "  npm run eng:deploy\n\n" +
    "Hard-refresh all lab + Engineering tabs after pull-config so clients drop the\n" +
    "stale named Firebase app that still pointed at clinical."
);
