import { Test } from '@nestjs/testing';
import { RedisModule } from './redis.module';
import { REDIS_CLIENT } from './redis.tokens';

describe('RedisModule', () => {
  it('disconnects the Redis client when the application closes', async () => {
    const redis = { disconnect: jest.fn() };
    const moduleRef = await Test.createTestingModule({ imports: [RedisModule] })
      .overrideProvider(REDIS_CLIENT)
      .useValue(redis)
      .compile();
    const app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    await app.close();

    expect(redis.disconnect).toHaveBeenCalledTimes(1);
  });
});
