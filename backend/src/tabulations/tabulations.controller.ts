import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from "@nestjs/common";
import { TabulationsService } from "./tabulations.service";
import { CreateTabulationDto } from "./dto/create-tabulation.dto";
import { UpdateTabulationDto } from "./dto/update-tabulation.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "@prisma/client";

@Controller("tabulations")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TabulationsController {
  constructor(private readonly tabulationsService: TabulationsService) {}

  @Post()
  @Roles(Role.admin, Role.supervisor, Role.digital)
  create(@Body() createTabulationDto: CreateTabulationDto) {
    return this.tabulationsService.create(createTabulationDto);
  }

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  findAll(@Query("search") search?: string) {
    return this.tabulationsService.findAll(search);
  }

  @Get(":id")
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  findOne(@Param("id") id: string) {
    return this.tabulationsService.findOne(+id);
  }

  @Patch(":id")
  @Roles(Role.admin, Role.supervisor, Role.digital)
  update(
    @Param("id") id: string,
    @Body() updateTabulationDto: UpdateTabulationDto
  ) {
    return this.tabulationsService.update(+id, updateTabulationDto);
  }

  @Delete(":id")
  @Roles(Role.admin, Role.supervisor, Role.digital)
  remove(@Param("id") id: string) {
    return this.tabulationsService.remove(+id);
  }
}
