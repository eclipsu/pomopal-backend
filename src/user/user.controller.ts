/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Patch,
  HttpCode,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ValidationPipe, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth/jwt-auth.guard';
import { Req } from '@nestjs/common';
import type { AuthRequest } from './interface/auth-request';
import { TimezoneDto } from './dto/update-timezone.dto';
import { UpdateUserSettingsDto } from './dto/update-settings.dto';
import { UpdateUsernameDto } from './dto/update-username.dto';

const avatarUpload = FileInterceptor('image', {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

@Controller('user')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  @Get('check-email')
  async checkEmail(@Query('email') email?: string) {
    if (!email?.trim()) {
      throw new BadRequestException('email is required');
    }
    return {
      available: await this.userService.isEmailAvailable(email),
    };
  }

  @Get('check-username')
  async checkUsername(@Query('username') username?: string) {
    if (!username?.trim()) {
      throw new BadRequestException('username is required');
    }
    return {
      available: await this.userService.isUsernameAvailable(username),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Req() req: AuthRequest) {
    return this.userService.findOne(String(req.user.sub));
  }

  @UseGuards(JwtAuthGuard)
  @Post('avatar')
  @UseInterceptors(avatarUpload)
  async uploadAvatar(
    @Req() req: AuthRequest,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Image file is required');
    return this.userService.updateAvatar(String(req.user.sub), file);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll() {
    return this.userService.findAll();
  }

  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  @Patch('timezone')
  updateTimezone(@Req() req: any, @Body() dto: TimezoneDto) {
    return this.userService.updateTimezone(String(req.user.sub), dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('username')
  updateUsername(@Req() req: AuthRequest, @Body() dto: UpdateUsernameDto) {
    return this.userService.updateUsername(String(req.user.sub), dto.username);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('settings')
  updatePreferences(@Req() req: any, @Body() dto: UpdateUserSettingsDto) {
    return this.userService.updatePreferences(String(req.user.sub), dto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userService.remove(+id);
  }
}
