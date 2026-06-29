import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminGuard } from '../auth/guards/admin/admin.guard';
import { AdminNotificationTemplatesService } from './admin-notification-templates.service';
import {
  CreateNotificationTemplateDto,
  UpdateNotificationTemplateDto,
} from './dto/notification-template.dto';

@Controller('admin/notification-templates')
@UseGuards(AdminGuard)
export class AdminNotificationTemplatesController {
  constructor(private readonly templates: AdminNotificationTemplatesService) {}

  @Get()
  list() {
    return this.templates.findAll();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.templates.findOne(id);
  }

  @Post()
  @UseInterceptors(FileInterceptor('image'))
  create(
    @Body() dto: CreateNotificationTemplateDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.templates.create(dto, image);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('image'))
  update(
    @Param('id') id: string,
    @Body() dto: UpdateNotificationTemplateDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.templates.update(id, dto, image);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.templates.remove(id);
  }
}
