import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createServer, type AddressInfo, type Server } from 'node:net';
import { reportBootstrapFailure, startServer } from './bootstrap';

async function emptyApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({}).compile();
  return moduleRef.createNestApplication({ logger: false });
}

function listenOnFreePort(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, () => resolve(server));
  });
}

function portOf(server: Server): number {
  return (server.address() as AddressInfo).port;
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function freePort(): Promise<number> {
  const server = await listenOnFreePort();
  const port = portOf(server);
  await close(server);
  return port;
}

function fakeStderr(): { readonly write: jest.Mock; output(): string } {
  const write = jest.fn().mockReturnValue(true);
  return {
    write,
    output: () => write.mock.calls.map((call: readonly unknown[]) => String(call[0])).join(''),
  };
}

describe('startServer', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await emptyApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('listens on the configured port', async () => {
    const port = await freePort();

    await startServer(app, port, { log: jest.fn() });
    const response = await fetch(`http://127.0.0.1:${port}/`);

    expect(response.status).toBe(404);
  });

  it('logs the listening port at info once the server accepts connections', async () => {
    const port = await freePort();
    const logger = { log: jest.fn() };

    await startServer(app, port, logger);
    await fetch(`http://127.0.0.1:${port}/`);

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({ port }),
      expect.stringContaining(String(port)),
    );
  });

  describe('when the port is already in use', () => {
    let occupier: Server;

    beforeEach(async () => {
      occupier = await listenOnFreePort();
    });

    afterEach(async () => {
      await close(occupier);
    });

    it('exits with code 1 when the port is already in use', async () => {
      const exit = jest.fn();

      await startServer(app, portOf(occupier), { log: jest.fn() }).catch((error: unknown) =>
        reportBootstrapFailure(error, fakeStderr(), exit),
      );

      expect(exit).toHaveBeenCalledWith(1);
    });

    it('prints the address-in-use error, including the port, to stderr', async () => {
      const stderr = fakeStderr();

      await startServer(app, portOf(occupier), { log: jest.fn() }).catch((error: unknown) =>
        reportBootstrapFailure(error, stderr, jest.fn()),
      );

      expect(stderr.output()).toMatch(/EADDRINUSE|address already in use/);
      expect(stderr.output()).toContain(String(portOf(occupier)));
    });
  });
});

describe('reportBootstrapFailure', () => {
  const configError = new Error(
    'Config validation error: "PORT" must be less than or equal to 65535',
  );

  it('exits with code 1 when bootstrapping fails', () => {
    const exit = jest.fn();

    reportBootstrapFailure(configError, fakeStderr(), exit);

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('writes the failure message, including the variable name, to stderr', () => {
    const stderr = fakeStderr();

    reportBootstrapFailure(configError, stderr, jest.fn());

    expect(stderr.write).toHaveBeenCalledTimes(1);
    expect(stderr.output()).toBe(
      'Bootstrap failed: Config validation error: "PORT" must be less than or equal to 65535\n',
    );
  });
});
