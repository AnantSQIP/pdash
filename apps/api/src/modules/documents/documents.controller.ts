import {
  Body, Controller, Delete, Get, Param, Post, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { DocumentsService, MAX_FILE_BYTES, isInlineSafe, type UploadedFileLike } from './documents.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /**
   * Multipart upload (field: "file"). Optional projectId/taskId link the file
   * immediately (project "Files" tab). Composer attachments upload without a
   * context and are linked when the message/comment is created.
   */
  @Post('documents')
  @RequirePermission('document.create')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  upload(
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body() body: { projectId?: string; taskId?: string },
  ) {
    return this.documents.upload(file, { projectId: body?.projectId, taskId: body?.taskId });
  }

  /**
   * Stream the file bytes. Whitelisted image/pdf types render inline (chat
   * thumbnails, previews); everything else downloads as an opaque attachment so
   * uploaded HTML/SVG can never execute in the app origin.
   */
  @Get('documents/:id/content')
  async content(@Param('id') id: string, @Res() res: Response) {
    const { doc, data } = await this.documents.getContent(id);
    const inline = isInlineSafe(doc.mimeType);
    res.setHeader('Content-Type', inline ? (doc.mimeType as string) : 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(Buffer.from(data));
  }

  /** All files belonging to a project — direct uploads + task/discussion attachments. */
  @Get('projects/:projectId/documents')
  @RequirePermission('document.view')
  listForProject(@Param('projectId') projectId: string) {
    return this.documents.listForProject(projectId);
  }

  // Authorization (uploader-or-document.delete) is enforced in the service.
  @Delete('documents/:id')
  remove(@Param('id') id: string) {
    return this.documents.softDelete(id);
  }
}
