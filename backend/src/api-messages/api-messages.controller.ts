import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ApiMessagesService } from './api-messages.service';
import { MassiveCpcDto, SendTemplateExternalDto } from './dto/massive-cpc.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@ApiTags('api-messages')
@ApiBearerAuth('JWT-auth')
@Controller('api/messages')
export class ApiMessagesController {
  constructor(private readonly apiMessagesService: ApiMessagesService) {}

  /**
   * Disparo massivo CPC (suporta texto e templates)
   * API Key removida temporariamente para testes
   */
  @Post('massivocpc')
  async sendMassiveCpc(@Body() dto: MassiveCpcDto, @Req() req: any) {
    const ipAddress = req.ip || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.apiMessagesService.sendMassiveCpc(dto, ipAddress, userAgent);
  }

  /**
   * Envio de template 1x1 via API externa
   */
  @Post('template')
  @UseGuards(ApiKeyGuard)
  async sendTemplate(@Body() dto: SendTemplateExternalDto, @Req() req: any) {
    const ipAddress = req.ip || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.apiMessagesService.sendTemplateExternal(dto, ipAddress, userAgent);
  }
}

