import { PartialType } from '@nestjs/mapped-types';
import { CreateTabulationDto } from './create-tabulation.dto';

export class UpdateTabulationDto extends PartialType(CreateTabulationDto) {}
