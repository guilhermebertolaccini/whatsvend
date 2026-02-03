import { IsNotEmpty, IsNumber } from 'class-validator';

export class TabulateConversationDto {
  @IsNumber()
  @IsNotEmpty()
  tabulationId: number;
}
