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
import { BlocklistService } from "./blocklist.service";
import { CreateBlocklistDto } from "./dto/create-blocklist.dto";
import { UpdateBlocklistDto } from "./dto/update-blocklist.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "@prisma/client";

@Controller("blocklist")
@UseGuards(JwtAuthGuard, RolesGuard)
export class BlocklistController {
  constructor(private readonly blocklistService: BlocklistService) {}

  @Post()
  @Roles(Role.admin, Role.supervisor, Role.digital)
  create(@Body() createBlocklistDto: CreateBlocklistDto) {
    return this.blocklistService.create(createBlocklistDto);
  }

  @Get()
  findAll(@Query("search") search?: string) {
    return this.blocklistService.findAll(search);
  }

  @Get("check")
  async check(@Query("phone") phone?: string, @Query("cpf") cpf?: string) {
    const isBlocked = await this.blocklistService.isBlocked(phone, cpf);
    return { blocked: isBlocked };
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.blocklistService.findOne(+id);
  }

  @Patch(":id")
  @Roles(Role.admin, Role.supervisor, Role.digital)
  update(
    @Param("id") id: string,
    @Body() updateBlocklistDto: UpdateBlocklistDto
  ) {
    return this.blocklistService.update(+id, updateBlocklistDto);
  }

  @Delete(":id")
  @Roles(Role.admin, Role.supervisor, Role.digital)
  remove(@Param("id") id: string) {
    return this.blocklistService.remove(+id);
  }
}
