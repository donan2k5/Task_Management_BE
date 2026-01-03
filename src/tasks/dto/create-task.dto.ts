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

  // Date: The single source of truth for which "day" a task belongs to
  @IsDateString()
  @IsOptional()
  date?: string; // ISO string (e.g., "2023-12-25T00:00:00Z")

  // Time: Optional time for calendar display (e.g., "14:30")
  @IsString()
  @IsOptional()
  time?: string;

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

  @IsString()
  @IsOptional()
  calendarId?: string; // Optional: Explicitly sync to this calendar
}
