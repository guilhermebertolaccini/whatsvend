import { IsString, IsNotEmpty, IsArray, ValidateNested, IsBoolean, IsOptional, IsNumber } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class TemplateVariableDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsString()
  @IsNotEmpty()
  value: string;
}

export class MessageDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsNumber()
  @IsOptional()
  idMessage?: number;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    return value;
  })
  @IsString()
  @IsOptional()
  clientId?: string;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    return value;
  })
  @IsString()
  @IsOptional()
  contract?: string;

  @IsBoolean()
  @IsNotEmpty()
  closeTicket: boolean;

  @IsString()
  @IsNotEmpty()
  specialistCode: string;

  @IsString()
  @IsNotEmpty()
  mainTemplate: string;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    return value;
  })
  @IsString()
  @IsOptional()
  retryTemplate?: string;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    return value;
  })
  @IsString()
  @IsOptional()
  lastTemplate?: string;

  // Novos campos para suporte a templates oficiais
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return false;
  })
  @IsBoolean()
  @IsOptional()
  useOfficialTemplate?: boolean;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  })
  @IsNumber()
  @IsOptional()
  templateId?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateVariableDto)
  @IsOptional()
  templateVariables?: TemplateVariableDto[];
}

export class MassiveCpcDto {
  @IsString()
  @IsNotEmpty()
  campaign: string;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    return value;
  })
  @IsString()
  @IsOptional()
  idAccount?: string;

  @IsString()
  @IsNotEmpty()
  tag: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageDto)
  messages: MessageDto[];

  // Novos campos globais para templates
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return false;
  })
  @IsBoolean()
  @IsOptional()
  useOfficialTemplate?: boolean;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  })
  @IsNumber()
  @IsOptional()
  defaultTemplateId?: number;
}

// DTO para envio de template 1x1 via API externa
export class SendTemplateExternalDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  })
  @IsNumber()
  @IsNotEmpty()
  templateId: number;

  @IsString()
  @IsOptional()
  contactName?: string;

  @IsString()
  @IsNotEmpty()
  specialistCode: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateVariableDto)
  @IsOptional()
  variables?: TemplateVariableDto[];

  @IsString()
  @IsOptional()
  tag?: string;
}

