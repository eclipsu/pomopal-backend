import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdminGuard } from '../auth/guards/admin/admin.guard';
import { AdminNotificationTemplatesService } from './admin-notification-templates.service';
import {
  CreateNotificationTemplateDto,
  UpdateNotificationTemplateDto,
} from './dto/notification-template.dto';
import { RenameImageDto } from './dto/rename-image.dto';
import type { AuthJwtPayload } from '../auth/types/auth-jwtPayload';
import type { NotificationType } from '../entities/notification.entity';

const imageUpload = FileInterceptor('image', {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

@Controller('admin/notification-templates')
@UseGuards(AdminGuard)
export class AdminNotificationTemplatesController {
  constructor(private readonly templates: AdminNotificationTemplatesService) {}

  @Get()
  list(@Query('type') type?: NotificationType) {
    return this.templates.findAll(type);
  }

  @Get('images')
  listImages() {
    return this.templates.listImages();
  }

  @Post('upload-image')
  @UseInterceptors(imageUpload)
  uploadImage(
    @UploadedFile() image?: Express.Multer.File,
    @Body('name') name?: string,
    @Req() req?: { user?: AuthJwtPayload },
  ) {
    if (!image) {
      throw new BadRequestException('Image file is required');
    }
    return this.templates.uploadImage(image, req?.user?.sub, name);
  }

  @Patch('images/rename')
  renameImage(@Body() dto: RenameImageDto) {
    return this.templates.renameImage(dto.key, dto.name);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.templates.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateNotificationTemplateDto,
    @Req() req: { user?: AuthJwtPayload },
  ) {
    return this.templates.create(dto, req.user?.sub);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNotificationTemplateDto) {
    return this.templates.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.templates.remove(id);
  }
}
