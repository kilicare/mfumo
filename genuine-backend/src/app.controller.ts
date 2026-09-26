import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AllowAnonymous } from './common/decorators';

@ApiTags('health')
@Controller('health')
export class AppController {
  @AllowAnonymous()
  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Server is running' })
  getHealth() {
    return {
      status: 'ok',
      message: 'Genuine Liquor Store API is running',
      timestamp: new Date().toISOString(),
    };
  }
}
