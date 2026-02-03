import { IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { Role, Status, Identifier } from '@prisma/client';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  @IsNotEmpty()
  password: string;

  @IsEnum(Role)
  @IsNotEmpty()
  role: Role;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  })
  @ValidateIf((o) => o.role === 'admin', { message: 'Segmento é opcional para administradores' })
  @IsOptional()
  @ValidateIf((o) => o.role !== 'admin')
  @IsNotEmpty({ message: 'Segmento é obrigatório para operadores e supervisores' })
  @IsNumber()
  segment?: number;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  })
  @IsNumber()
  @IsOptional()
  line?: number;

  @IsEnum(Status)
  @IsOptional()
  status?: Status;

  @Transform(({ value }) => {
    // Se não for especificado, retornar undefined para usar o default do schema (true)
    if (value === null || value === undefined || value === '') return undefined;
    return Boolean(value);
  })
  @IsBoolean()
  @IsOptional()
  oneToOneActive?: boolean; // Se true, operador pode chamar clientes no 1x1 (padrão: true)

  @IsEnum(Identifier)
  @IsOptional()
  identifier?: Identifier; // cliente ou proprietario - usado para filtrar relatórios

  @Transform(({ value }) => {
    // Se não for especificado, retornar undefined para usar o default do schema (true)
    if (value === null || value === undefined || value === '') return undefined;
    return Boolean(value);
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean; // Se true, usuário está ativo no sistema (padrão: true)
}
