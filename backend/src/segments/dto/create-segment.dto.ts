import { IsNotEmpty, IsString, IsBoolean, IsOptional, IsEnum } from 'class-validator';
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
}
