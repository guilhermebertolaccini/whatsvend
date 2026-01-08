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
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "@prisma/client";
import { FileInterceptor } from "@nestjs/platform-express";

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(Role.admin)
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.digital)
  findAll(@Query() filters: any) {
    return this.usersService.findAll(filters);
  }

  @Get("online-operators")
  @Roles(Role.admin)
  getOnlineOperators(@Query("segment") segment?: string) {
    return this.usersService.getOnlineOperators(
      segment ? parseInt(segment) : undefined
    );
  }

  @Get(":id")
  @Roles(Role.admin, Role.supervisor)
  findOne(@Param("id") id: string) {
    return this.usersService.findOne(+id);
  }

  @Patch(":id")
  @Roles(Role.admin)
  async update(@Param("id") id: string, @Body() updateUserDto: UpdateUserDto) {
    console.log(
      "📝 Dados recebidos para atualizar usuário ID",
      id,
      ":",
      JSON.stringify(updateUserDto, null, 2)
    );
    console.log("📝 Tipos dos campos:", {
      line: typeof updateUserDto.line,
      segment: typeof updateUserDto.segment,
      password: typeof updateUserDto.password,
      oneToOneActive: typeof updateUserDto.oneToOneActive,
      oneToOneActiveValue: updateUserDto.oneToOneActive,
    });

    try {
      const result = await this.usersService.update(+id, updateUserDto);
      console.log("✅ Usuário atualizado com sucesso");
      return result;
    } catch (error) {
      console.error("❌ Erro ao atualizar usuário:", {
        message: error.message,
        response: error.response,
        stack: error.stack,
      });
      throw error;
    }
  }

  @Delete(":id")
  @Roles(Role.admin)
  remove(@Param("id") id: string) {
    return this.usersService.remove(+id);
  }

  @Post("upload-csv")
  @Roles(Role.admin)
  @UseInterceptors(FileInterceptor("file"))
  async uploadCSV(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new Error("Arquivo CSV não fornecido");
    }

    const result = await this.usersService.importFromCSV(file);
    return {
      message: `Importação concluída: ${result.success} usuário(s) criado(s)`,
      success: result.success,
      errors: result.errors,
    };
  }
}
