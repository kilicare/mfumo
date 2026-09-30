import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export enum NotificationType {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  IN_APP = 'IN_APP',
}

export enum NotificationEventType {
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  INVOICE_CREATED = 'INVOICE_CREATED',
  PAYMENT_DUE = 'PAYMENT_DUE',
  LOW_STOCK = 'LOW_STOCK',
  PURCHASE_ORDER_APPROVED = 'PURCHASE_ORDER_APPROVED',
  SALES_INVOICE_ISSUED = 'SALES_INVOICE_ISSUED',
  EXPENSE_APPROVED = 'EXPENSE_APPROVED',
  REPORT_GENERATED = 'REPORT_GENERATED',
}

export class NotificationRecipientDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsPhoneNumber()
  phoneNumber?: string;

  @IsString()
  @MaxLength(160)
  name: string;
}

export class CreateNotificationDto {
  @IsEnum(NotificationType)
  type: NotificationType;

  @IsEnum(NotificationEventType)
  eventType: NotificationEventType;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => NotificationRecipientDto)
  recipients?: NotificationRecipientDto[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subject?: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  referenceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  referenceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;
}

export class CreateNotificationTemplateDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsEnum(NotificationEventType)
  eventType: NotificationEventType;

  @IsString()
  @MaxLength(300)
  subject: string;

  @IsString()
  @MaxLength(10000)
  body: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  variables?: string[];
}

export class UpdateNotificationTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  variables?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class NotificationListQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'SENDING', 'SENT', 'PARTIALLY_SENT', 'FAILED'])
  status?: string;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsEnum(NotificationEventType)
  eventType?: NotificationEventType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class NotificationTemplateQueryDto {
  @IsOptional()
  @IsEnum(NotificationEventType)
  eventType?: NotificationEventType;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;
}

export class InboxQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  unreadOnly = false;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class EmailConfigDto {
  @IsIn(['SMTP', 'SENDGRID'])
  provider: 'SMTP' | 'SENDGRID';

  @IsEmail()
  fromEmail: string;

  @IsString()
  @MaxLength(160)
  fromName: string;

  @IsOptional()
  @IsString()
  smtpHost?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort?: number;

  @IsOptional()
  @IsString()
  smtpUsername?: string;

  @IsOptional()
  @IsString()
  smtpPassword?: string;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  secure?: boolean;

  @IsOptional()
  @IsString()
  apiKey?: string;
}

export class SMSConfigDto {
  @IsIn(['TWILIO', 'AFRICAS_TALKING'])
  provider: 'TWILIO' | 'AFRICAS_TALKING';

  @IsNotEmpty()
  @IsString()
  @MaxLength(80)
  @ValidateIf((dto: SMSConfigDto) => dto.provider === 'TWILIO')
  @IsPhoneNumber()
  fromNumber: string;

  @IsOptional()
  @IsString()
  accountSid?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  apiSecret?: string;
}

export class RetryNotificationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
