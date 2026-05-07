import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): Record<string, string> {
    return {
      status: 'ok',
      service: 'ai-bot-salesman-api'
    };
  }
}
