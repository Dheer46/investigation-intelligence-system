import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

@UseGuards(JwtAuthGuard)
@Controller('cases/:caseId/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @UseGuards(RolesGuard)
  @Roles(Role.INVESTIGATOR, Role.SUPERVISOR, Role.ADMINISTRATOR)
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('caseId') caseId: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.documentsService.upload(caseId, dto.sourceType, file, user.userId, user.role, dto.metadata);
  }

  @Get()
  findByCase(@Param('caseId') caseId: string) {
    return this.documentsService.findByCase(caseId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentsService.findOne(id);
  }

  @Get(':id/download-url')
  async getDownloadUrl(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const url = await this.documentsService.getDownloadUrl(id, user.userId, user.role);
    return { url };
  }

  @UseGuards(RolesGuard)
  @Roles(Role.INVESTIGATOR, Role.SUPERVISOR, Role.ADMINISTRATOR)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.documentsService.remove(id, user.userId, user.role);
  }
}
