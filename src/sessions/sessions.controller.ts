import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Patch,
  ParseIntPipe,
} from '@nestjs/common';
import { CreateSessionDto } from './dto/createSessions.dto';
import { HeadersDto } from './dto/headers.dto';
import { RequestHeader } from './pipes/requests-header';
import { SessionsService } from './sessions.service';

@Controller('sessions')
export class SessionsController {
  constructor(private sessionsService: SessionsService) {}

  @Get()
  findAll() {
    return this.sessionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.sessionsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateSessionDto) {
    return this.sessionsService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: CreateSessionDto,
    @RequestHeader(HeadersDto) headers: HeadersDto,
  ) {
    console.log(headers);
    return 'Update session';
  }
}
