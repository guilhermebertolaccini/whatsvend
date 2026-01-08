import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, UseInterceptors, UploadedFile } from '@nestjs/common';
import { SegmentsService } from './segments.service';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { UpdateSegmentDto } from './dto/update-segment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('segments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SegmentsController {
  constructor(private readonly segmentsService: SegmentsService) {}

  @Post()
  @Roles(Role.admin, Role.supervisor)
  create(@Body() createSegmentDto: CreateSegmentDto) {
    return this.segmentsService.create(createSegmentDto);
  }

  @Get()
  findAll(@Query('search') search?: string) {
    return this.segmentsService.findAll(search);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.segmentsService.findOne(+id);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.supervisor)
  update(@Param('id') id: string, @Body() updateSegmentDto: UpdateSegmentDto) {
    return this.segmentsService.update(+id, updateSegmentDto);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.supervisor)
  remove(@Param('id') id: string) {
    return this.segmentsService.remove(+id);
  }

  @Post('upload-csv')
  @Roles(Role.admin, Role.supervisor)
  @UseInterceptors(FileInterceptor('file'))
  async uploadCSV(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new Error('Arquivo CSV não fornecido');
    }

    const result = await this.segmentsService.importFromCSV(file);
    return {
      message: `Importação concluída: ${result.success} segmento(s) criado(s)`,
      success: result.success,
      errors: result.errors,
    };
  }
}
