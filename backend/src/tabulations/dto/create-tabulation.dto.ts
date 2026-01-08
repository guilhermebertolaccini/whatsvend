import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTabulationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsBoolean()
  @IsOptional()
  isCPC?: boolean;
}
