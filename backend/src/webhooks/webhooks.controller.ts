import { Controller, Post, Body } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('evolution')
  async handleEvolutionWebhook(@Body() data: any) {
    return this.webhooksService.handleEvolutionMessage(data);
  }
}
