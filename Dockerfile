# Sử dụng Node.js bản mới nhất (khớp với môi trường dev của bạn)
FROM node:20-alpine

# Tạo thư mục làm việc
WORKDIR /app

# Copy file package để cài dependencies trước (tối ưu cache Docker)
COPY package*.json ./
RUN npm install

# Copy toàn bộ code và build
COPY . .
RUN npm run build

# Port mặc định của Cloud Run
EXPOSE 8080

# Chạy app từ thư mục dist đã build
CMD ["node", "dist/main"]