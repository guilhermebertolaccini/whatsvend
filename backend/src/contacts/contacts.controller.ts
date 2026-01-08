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
import { ContactsService } from "./contacts.service";
import { CreateContactDto } from "./dto/create-contact.dto";
import { UpdateContactDto } from "./dto/update-contact.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "@prisma/client";

@Controller("contacts")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  create(@Body() createContactDto: CreateContactDto) {
    return this.contactsService.create(createContactDto);
  }

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  findAll(
    @Query("search") search?: string,
    @Query("segment") segment?: string
  ) {
    return this.contactsService.findAll(
      search,
      segment ? parseInt(segment) : undefined
    );
  }

  @Get("by-phone/:phone")
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  findByPhone(@Param("phone") phone: string) {
    return this.contactsService.findByPhone(phone);
  }

  @Get(":id")
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  findOne(@Param("id") id: string) {
    return this.contactsService.findOne(+id);
  }

  @Patch("by-phone/:phone")
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  updateByPhone(
    @Param("phone") phone: string,
    @Body() updateContactDto: UpdateContactDto
  ) {
    return this.contactsService.updateByPhone(phone, updateContactDto);
  }

  @Patch(":id")
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  update(@Param("id") id: string, @Body() updateContactDto: UpdateContactDto) {
    return this.contactsService.update(+id, updateContactDto);
  }

  @Delete(":id")
  @Roles(Role.admin, Role.supervisor)
  remove(@Param("id") id: string) {
    return this.contactsService.remove(+id);
  }
}
