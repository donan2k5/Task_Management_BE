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

  // Frontend sends ISO string, Backend validates and stores as Date
  @IsDateString()
  @IsOptional()
  scheduledDate?: string; // Start date/time (e.g., "2023-12-25T14:30:00Z")

  @IsDateString()
  @IsOptional()
  scheduledEndDate?: string; // End date/time for calendar event duration (e.g., "2023-12-25T15:30:00Z")

  @IsDateString()
  @IsOptional()
  deadline?: string; // User-set due date - independent of calendar event duration

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
