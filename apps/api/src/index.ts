import Fastify from 'fastify';

const app = Fastify({
  logger: true,
});

app.get('/health', async () => ({
  service: 'storyteller-studio-api',
  status: 'ok',
  version: '0.1.0',
}));

const port = Number(process.env.API_PORT ?? 3100);
const host = process.env.API_HOST ?? '127.0.0.1';

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
