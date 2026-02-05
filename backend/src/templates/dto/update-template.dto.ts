import { PartialType } from '@nestjs/mapped-types';
import { CreateTemplateDto } from './create-template.dto';
import { IsOptional, IsString, IsEnum } from 'class-validator';

export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {
    @IsOptional()
    @IsString()
    @IsEnum(['APPROVED', 'PENDING', 'REJECTED'])
    status?: 'APPROVED' | 'PENDING' | 'REJECTED';
}

