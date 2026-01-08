import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateTagDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  })
  @IsOptional()
  @IsNumber()
  segment?: number;
}

