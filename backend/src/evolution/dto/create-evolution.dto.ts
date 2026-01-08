import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class CreateEvolutionDto {
  @IsString()
  @IsNotEmpty()
  evolutionName: string;

  @IsUrl()
  @IsNotEmpty()
  evolutionUrl: string;

  @IsString()
  @IsNotEmpty()
  evolutionKey: string;
}
