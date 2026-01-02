import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import compression from 'compression';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Compression middleware - reduce response size by ~70%
  app.use(compression());

  // Cookie parser - for HTTP-only cookie auth
  app.use(cookieParser());

  // CORS config with specific origins for cookie auth
  const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:8081',
    'http://localhost:8081',
    'http://localhost:5173',
    'https://task-managament-fe.vercel.app',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = process.env.PORT || 8080;

  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Server is running on port: ${port}`);
}
bootstrap();
