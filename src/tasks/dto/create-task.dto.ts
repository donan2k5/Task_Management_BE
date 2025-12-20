import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString, // Nhớ import cái này
} from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  project?: string;

  // Frontend gửi string ISO, Backend validate xong lưu vào DB là Date
  @IsString()
  @IsOptional()
  scheduledDate?: string;

  @IsString()
  @IsOptional()
  scheduledTime?: string;

  // 👇 THÊM DEADLINE VÀO DTO
  @IsDateString() // Bắt buộc phải là string dạng ngày tháng (VD: "2023-12-25T00:00:00Z")
  @IsOptional()
  deadline?: string;

  @IsBoolean()
  @IsOptional()
  isUrgent?: boolean;

  @IsBoolean()
  @IsOptional()
  isImportant?: boolean;

  @IsBoolean()
  @IsOptional()
  completed?: boolean;

  @IsEnum(['backlog', 'todo', 'done'])
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
