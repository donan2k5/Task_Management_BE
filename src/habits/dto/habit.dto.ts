import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  IsBoolean,
} from 'class-validator';

export class CreateHabitDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsEnum(['daily', 'weekly'])
  frequency?: 'daily' | 'weekly';

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  targetDays?: number[];

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateHabitDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsEnum(['daily', 'weekly'])
  frequency?: 'daily' | 'weekly';

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  targetDays?: number[];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class LogHabitDto {
  @IsOptional()
  @IsString()
  date?: string; // ISO date string, defaults to today

  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}
