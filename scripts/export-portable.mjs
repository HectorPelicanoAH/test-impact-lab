import { exportRepository } from '../portable/scripts/export.mjs';

if (process.argv.length !== 3) {
  process.stderr.write('Usage: node scripts/export-portable.mjs EMPTY_DIRECTORY\n');
  process.exitCode = 2;
} else {
  try {
    const path = await exportRepository(process.argv[2]);
    process.stdout.write('Standalone repository exported to: ' + path + '\n');
    process.stdout.write('From that directory: node bin/impact.mjs --help\n');
    process.stdout.write('Git history has not been created. Run git init there when ready.\n');
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 2;
  }
}
