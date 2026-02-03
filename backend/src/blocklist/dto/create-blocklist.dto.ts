import { IsOptional, IsString } from 'class-validator';

export class CreateBlocklistDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  cpf?: string;
}
