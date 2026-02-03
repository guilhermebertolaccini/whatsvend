import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateContactDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsNumber()
  @IsOptional()
  segment?: number;

  @IsString()
  @IsOptional()
  cpf?: string;

  @IsString()
  @IsOptional()
  contract?: string;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return false;
    return Boolean(value);
  })
  @IsBoolean()
  @IsOptional()
  isCPC?: boolean; // Se true, contato foi marcado como CPC
}
