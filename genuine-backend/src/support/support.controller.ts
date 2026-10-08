import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Business } from '../common/decorators/business.decorator';
import { UserId } from '../common/decorators/auth.decorator';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { CreateFeedbackDto, CreateFeedbackMessageDto, UpdateFeedbackStatusDto } from './dto';
import { SupportService } from './support.service';

@ApiTags('Support')
@ApiBearerAuth()
@Controller('support/feedback')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Business() businessId: string, @UserId() userId: string, @Body() dto: CreateFeedbackDto) {
    return this.support.createFeedback(businessId, userId, dto);
  }

  @Get('mine')
  listMine(@Business() businessId: string, @UserId() userId: string) {
    return this.support.listMyFeedback(businessId, userId);
  }

  @Get()
  @RequirePermission('settings.edit')
  listInbox(@Business() businessId: string) {
    return this.support.listInbox(businessId);
  }

  @Get(':id/messages')
  listMessages(@Business() businessId: string, @UserId() userId: string, @Param('id') id: string) {
    return this.support.listMessages(businessId, userId, id);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  addMessage(
    @Business() businessId: string,
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() dto: CreateFeedbackMessageDto,
  ) {
    return this.support.addMessage(businessId, userId, id, dto.body);
  }

  @Patch(':id/status')
  @RequirePermission('settings.edit')
  updateStatus(
    @Business() businessId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFeedbackStatusDto,
  ) {
    return this.support.updateStatus(businessId, id, dto);
  }
}
