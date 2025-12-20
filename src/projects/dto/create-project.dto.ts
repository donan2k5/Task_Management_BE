import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsUrl,
  Min,
  Max,
} from 'class-validator';

export class CreateProjectDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUrl()
  @IsOptional()
  coverImage?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsEnum(['active', 'completed', 'archived'])
  @IsOptional()
  status?: string;

  @IsOptional()
  dueDate?: Date;

  @IsString()
  @IsOptional()
  color?: string;

  @IsString()
  @IsOptional()
  icon?: string;
}
