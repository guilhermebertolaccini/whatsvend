import { IsNotEmpty, IsString, IsBoolean, IsOptional, IsEnum, IsNumber, Min } from 'class-validator';
import { Identifier } from '@prisma/client';

export class CreateSegmentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsBoolean()
  @IsOptional()
  allowsFreeMessage?: boolean;

  @IsEnum(Identifier)
  @IsOptional()
  identifier?: Identifier; // cliente ou proprietario - usado para filtrar relatórios

  @IsNumber()
  @IsOptional()
  @Min(1)
  maxOperatorsPerLine?: number; // Máximo de operadores por linha neste segmento
}
