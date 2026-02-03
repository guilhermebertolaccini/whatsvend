import { IsOptional, IsDateString, IsNumber, IsBoolean, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';

export class ReportFilterDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  })
  @IsOptional()
  @IsNumber()
  segment?: number;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsOptional()
  @IsBoolean()
  onlyMovimentedLines?: boolean; // Para relatório de linhas: true = apenas movimentadas, false/undefined = todas
}

