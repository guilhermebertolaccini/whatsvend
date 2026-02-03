import { IsString, IsNotEmpty, IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class TemplateButtonDto {
  @IsString()
  @IsNotEmpty()
  type: string; // QUICK_REPLY, URL, PHONE_NUMBER

  @IsString()
  @IsNotEmpty()
  text: string;

  @IsString()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;
}

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  })
  @IsNumber()
  @IsOptional()
  segmentId?: number;  // null = global (todos os segmentos)

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  })
  @IsNumber()
  @IsOptional()
  lineId?: number;  // Mantido para compatibilidade

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    return value;
  })
  @IsString()
  @IsOptional()
  namespace?: string;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    return value;
  })
  @IsString()
  @IsOptional()
  headerType?: string; // TEXT, IMAGE, VIDEO, DOCUMENT

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    return value;
  })
  @IsString()
  @IsOptional()
  headerContent?: string;

  @IsString()
  @IsNotEmpty()
  bodyText: string;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    return value;
  })
  @IsString()
  @IsOptional()
  footerText?: string;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    if (Array.isArray(value) && value.length === 0) return undefined;
    if (!Array.isArray(value)) return undefined;
    return value;
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateButtonDto)
  buttons?: TemplateButtonDto[];

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    if (Array.isArray(value) && value.length === 0) return undefined;
    if (!Array.isArray(value)) return undefined;
    return value;
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];
}

