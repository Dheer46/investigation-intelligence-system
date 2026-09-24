import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { CasesService } from './cases.service';
import { CreateCaseDto } from './dto/create-case.dto';

@UseGuards(JwtAuthGuard)
@Controller('cases')
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  @UseGuards(RolesGuard)
  @Roles(Role.INVESTIGATOR, Role.SUPERVISOR, Role.ADMINISTRATOR)
  @Post()
  create(@Body() dto: CreateCaseDto, @CurrentUser() user: CurrentUserPayload) {
    return this.casesService.create(dto, user.userId, user.role);
  }

  @Get()
  findAll() {
    return this.casesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.casesService.findOne(id);
  }
}
