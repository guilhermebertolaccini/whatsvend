import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { LineStatus } from '@prisma/client';

export class CreateLineDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsEnum(LineStatus)
  @IsOptional()
  lineStatus?: LineStatus;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  })
  @IsNumber()
  @IsOptional()
  segment?: number;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  })
  @IsNumber()
  @IsOptional()
  linkedTo?: number;

  @IsString()
  @IsNotEmpty()
  evolutionName: string;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return false;
    return Boolean(value);
  })
  @IsBoolean()
  @IsOptional()
  oficial?: boolean;

  @Transform(({ value }) => {
    if (!value || value === '' || value === null) return null;
    return value;
  })
  @IsString()
  @IsOptional()
  token?: string | null;

  @Transform(({ value }) => {
    if (!value || value === '' || value === null) return null;
    return value;
  })
  @IsString()
  @IsOptional()
  businessID?: string | null;

  @Transform(({ value }) => {
    if (!value || value === '' || value === null) return null;
    return value;
  })
  @IsString()
  @IsOptional()
  numberId?: string | null;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return false;
    return Boolean(value);
  })
  @IsBoolean()
  @IsOptional()
  receiveMedia?: boolean; // Se true, ativa webhook_base64 para receber imagens/áudios/docs
}
