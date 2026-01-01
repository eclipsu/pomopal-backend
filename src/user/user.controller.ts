/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Patch,
  HttpCode,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ValidationPipe, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth/jwt-auth.guard';
import { Req } from '@nestjs/common';
import type { AuthRequest } from './interface/auth-request';
import { TimezoneDto } from './dto/update-timezone.dto';
// import { UpdateUserDto } from './dto/update-user.dto';
@UseGuards(JwtAuthGuard)
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

  @Get('profile')
  getProfile(@Req() req: AuthRequest) {
    console.log('HELLo', req.user);
    return this.userService.findOne(String(req.user.sub));
  }

  @Get()
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @HttpCode(201)
  @Patch('timezone')
  updateTimezone(@Req() req: any, @Body() dto: TimezoneDto) {
    return this.userService.updateTimezone(String(req.user.sub), dto);
  }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
  //   return this.userService.update(+id, updateUserDto);
  // }
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userService.remove(+id);
  }
}
