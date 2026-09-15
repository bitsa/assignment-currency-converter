import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFixture } from './fixture';
import { MOCK_PORT, createMockServer } from './mock-server';

const fixturePath = join(__dirname, '..', 'fixtures', 'default.json');
const fixture = parseFixture(readFileSync(fixturePath, 'utf8'));
if (fixture === undefined) {
  process.stderr.write(`monobank-mock: ${fixturePath} is not a JSON array\n`);
  process.exit(1);
}

const server = createMockServer(fixture);
server.listen(MOCK_PORT, () => {
  process.stdout.write(`monobank-mock listening on ${MOCK_PORT}\n`);
});

// Held `timeout` requests would otherwise keep close() waiting until the container is killed.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
}
