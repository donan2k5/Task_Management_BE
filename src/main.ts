import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 8080;

  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Server is running on: http://0.0.0.0:${port}`);
}

bootstrap().catch((err) => {
  console.error('💥 Error starting application:', err);
  process.exit(1);
});
