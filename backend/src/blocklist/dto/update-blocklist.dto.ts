import { PartialType } from '@nestjs/mapped-types';
import { CreateBlocklistDto } from './create-blocklist.dto';

export class UpdateBlocklistDto extends PartialType(CreateBlocklistDto) {}
