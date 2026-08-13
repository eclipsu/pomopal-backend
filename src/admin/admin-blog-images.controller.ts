import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdminGuard } from '../auth/guards/admin/admin.guard';
import { AdminBlogImagesService } from './admin-blog-images.service';

const imageUpload = FileInterceptor('image', {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

@Controller('admin/blog-images')
@UseGuards(AdminGuard)
export class AdminBlogImagesController {
  constructor(private readonly blogImages: AdminBlogImagesService) {}

  @Get()
  list() {
    return this.blogImages.list();
  }

  @Post('upload')
  @UseInterceptors(imageUpload)
  upload(
    @UploadedFile() image?: Express.Multer.File,
    @Body('name') name?: string,
  ) {
    if (!image) {
      throw new BadRequestException('Image file is required');
    }
    return this.blogImages.upload(image, name);
  }

  @Delete()
  remove(@Query('key') key?: string) {
    if (!key) {
      throw new BadRequestException('key query param is required');
    }
    return this.blogImages.remove(key);
  }
}
