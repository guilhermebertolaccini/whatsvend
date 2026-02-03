import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { EvolutionService } from './evolution.service';
import { CreateEvolutionDto } from './dto/create-evolution.dto';
import { UpdateEvolutionDto } from './dto/update-evolution.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('evolution')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EvolutionController {
  constructor(private readonly evolutionService: EvolutionService) {}

  @Post()
  @Roles(Role.admin)
  create(@Body() createEvolutionDto: CreateEvolutionDto) {
    return this.evolutionService.create(createEvolutionDto);
  }

  @Get()
  @Roles(Role.admin, Role.ativador)
  findAll() {
    return this.evolutionService.findAll();
  }

  @Get(':id')
  @Roles(Role.admin)
  findOne(@Param('id') id: string) {
    return this.evolutionService.findOne(+id);
  }

  @Patch(':id')
  @Roles(Role.admin)
  update(@Param('id') id: string, @Body() updateEvolutionDto: UpdateEvolutionDto) {
    return this.evolutionService.update(+id, updateEvolutionDto);
  }

  @Delete(':id')
  @Roles(Role.admin)
  remove(@Param('id') id: string) {
    return this.evolutionService.remove(+id);
  }

  @Get('test/:name')
  @Roles(Role.admin)
  testConnection(@Param('name') name: string) {
    return this.evolutionService.testConnection(name);
  }
}
