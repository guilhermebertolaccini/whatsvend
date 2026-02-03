import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Sender } from '@prisma/client';

export class CreateConversationDto {
  @IsString()
  @IsNotEmpty()
  contactName: string;

  @IsString()
  @IsNotEmpty()
  contactPhone: string;

  @IsNumber()
  @IsOptional()
  segment?: number;

  @IsString()
  @IsOptional()
  userName?: string;

  @IsNumber()
  @IsOptional()
  userLine?: number;

  @IsNumber()
  @IsOptional()
  userId?: number; // ID do operador específico que está atendendo

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsEnum(Sender)
  @IsNotEmpty()
  sender: Sender;

  @IsNumber()
  @IsOptional()
  tabulation?: number;

  @IsString()
  @IsOptional()
  messageType?: string;

  @IsString()
  @IsOptional()
  mediaUrl?: string;

  @IsBoolean()
  @IsOptional()
  isAdminTest?: boolean; // Se true, é ação de teste administrador e não aparece nos relatórios

  @IsBoolean()
  @IsOptional()
  isGroup?: boolean; // Se true, é mensagem de grupo

  @IsString()
  @IsOptional()
  groupId?: string; // ID do grupo (remoteJid do grupo)

  @IsString()
  @IsOptional()
  groupName?: string; // Nome do grupo

  @IsString()
  @IsOptional()
  participantName?: string; // Nome do participante que enviou a mensagem (para grupos)
}
