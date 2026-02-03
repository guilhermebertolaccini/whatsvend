import { IsOptional, IsDateString, IsString, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';

export class ApiLogFilterDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  endpoint?: string;

  @IsOptional()
  @IsString()
  method?: string;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  })
  @IsOptional()
  @IsNumber()
  statusCode?: number;
}

