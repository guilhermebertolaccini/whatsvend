import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateControlPanelDto {
  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  })
  @IsNumber()
  @IsOptional()
  segmentId?: number;

  // Frases de bloqueio automático (array de strings)
  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    return Boolean(value);
  })
  @IsBoolean()
  @IsOptional()
  blockPhrasesEnabled?: boolean;

  @IsOptional()
  blockPhrases?: string[]; // Será armazenado como JSON string no banco

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  })
  @IsNumber()
  @IsOptional()
  blockTabulationId?: number;

  // Temporizador de CPC (em horas)
  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    return Boolean(value);
  })
  @IsBoolean()
  @IsOptional()
  cpcCooldownEnabled?: boolean;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return 24;
    const num = Number(value);
    return isNaN(num) ? 24 : num;
  })
  @IsNumber()
  @IsOptional()
  cpcCooldownHours?: number;

  // Reenvio - Intervalo mínimo entre campanhas para o mesmo telefone (em horas)
  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    return Boolean(value);
  })
  @IsBoolean()
  @IsOptional()
  resendCooldownEnabled?: boolean;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return 24;
    const num = Number(value);
    return isNaN(num) ? 24 : num;
  })
  @IsNumber()
  @IsOptional()
  resendCooldownHours?: number;

  // Repescagem
  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return false;
    return Boolean(value);
  })
  @IsBoolean()
  @IsOptional()
  repescagemEnabled?: boolean;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return 2;
    const num = Number(value);
    return isNaN(num) ? 2 : num;
  })
  @IsNumber()
  @IsOptional()
  repescagemMaxMessages?: number;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return 24;
    const num = Number(value);
    return isNaN(num) ? 24 : num;
  })
  @IsNumber()
  @IsOptional()
  repescagemCooldownHours?: number;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return 2;
    const num = Number(value);
    return isNaN(num) ? 2 : num;
  })
  @IsNumber()
  @IsOptional()
  repescagemMaxAttempts?: number;

  // Evolutions ativas - Controla quais evolutions podem ser usadas
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  activeEvolutions?: string[]; // Array de nomes de evolution (ex: ["Evolution01", "Evolution02"])

  // Mensagem automática quando cliente não responde (desativado por padrão)
  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return false;
    return Boolean(value);
  })
  @IsBoolean()
  @IsOptional()
  autoMessageEnabled?: boolean;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return 24;
    const num = Number(value);
    return isNaN(num) ? 24 : num;
  })
  @IsNumber()
  @IsOptional()
  autoMessageHours?: number;

  @IsString()
  @IsOptional()
  autoMessageText?: string;

  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return 1;
    const num = Number(value);
    return isNaN(num) ? 1 : num;
  })
  @IsNumber()
  @IsOptional()
  autoMessageMaxAttempts?: number;

  // Modo de linha compartilhada
  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return false;
    return Boolean(value);
  })
  @IsBoolean()
  @IsOptional()
  sharedLineMode?: boolean;
}

export class AddBlockPhraseDto {
  @IsString()
  phrase: string;
}

export class RemoveBlockPhraseDto {
  @IsString()
  phrase: string;
}

