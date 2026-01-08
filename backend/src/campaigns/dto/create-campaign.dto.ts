import { IsEnum, IsNotEmpty, IsString, IsOptional, IsBoolean, IsNumber, IsArray } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Speed } from '@prisma/client';
import { ValidateNested } from 'class-validator';

export class TemplateVariableDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsString()
  @IsNotEmpty()
  value: string;
}

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(Speed)
  @IsNotEmpty()
  speed: Speed;

  @IsString()
  @IsNotEmpty()
  segment: string;

  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return false;
  })
  @IsBoolean()
  @IsOptional()
  useTemplate?: boolean;

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

  @IsString()
  @IsOptional()
  endTime?: string; // Formato: "HH:mm" (ex: "19:00")
}
