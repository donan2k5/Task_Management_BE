import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module'; // Phải có dòng này!
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true, // Cho phép tất cả các nguồn (Dùng cho dev cho lẹ)
    // Hoặc nếu muốn bảo mật chuẩn Vibecode thì dùng dòng dưới:
    // origin: 'http://localhost:8081',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Bật cái này lên để class-validator trong DTO hoạt động
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Application is running on: http://localhost:${port}`);
}
// Đảm bảo không có lỗi typo ở đây
bootstrap().catch((err) => console.error(err));
