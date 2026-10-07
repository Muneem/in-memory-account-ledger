import { createReport, renderText } from './report.ts';
import { replay } from './scenario.ts';

const args = process.argv.slice(2);
if (args.length === 0) {
  process.stdout.write(renderText(replay()));
} else if (args.length === 1 && args[0] === '--json') {
  process.stdout.write(JSON.stringify(createReport(replay()), null, 2) + '\n');
} else if (args.length === 1 && args[0] === '--help') {
  process.stdout.write('Usage: npm run replay [-- --json]\nReplays the supplied six-day event stream; --json prints the full structured audit report.\n');
} else {
  process.stderr.write('Unknown arguments. Use --help or --json.\n');
  process.exitCode = 1;
}
