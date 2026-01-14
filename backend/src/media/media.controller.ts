import {
  Controller,
  Post,
  Get,
  Param,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as path from 'path';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MediaService } from './media.service';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) { }

  /**
   * Upload de mídia (operador enviando)
   */
  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadMedia(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Arquivo é obrigatório');
    }

    // Validar tipo de arquivo - lista ampla de tipos permitidos
    const allowedMimes = [
      // Imagens
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/tiff',
      'image/svg+xml',
      'image/heic',
      'image/heif',
      // Vídeos
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'video/x-msvideo',
      'video/x-ms-wmv',
      'video/webm',
      'video/3gpp',
      'video/x-flv',
      'video/x-matroska',
      // Áudios
      'audio/mpeg',
      'audio/ogg',
      'audio/mp4',
      'audio/wav',
      'audio/x-wav',
      'audio/webm',
      'audio/aac',
      'audio/flac',
      'audio/x-m4a',
      // Documentos
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/rtf',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.oasis.opendocument.presentation',
      // Texto
      'text/plain',
      'text/csv',
      'text/html',
      'text/xml',
      'application/json',
      // Compactados
      'application/zip',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
      'application/gzip',
      'application/x-tar',
      // Outros
      'application/octet-stream', // Genérico para tipos não reconhecidos
    ];

    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('Tipo de arquivo não permitido');
    }

    // Retornar URL do arquivo
    const mediaUrl = `/media/${file.filename}`;

    return {
      success: true,
      mediaUrl,
      fileName: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  /**
   * Download/visualização de mídia (sem autenticação para permitir <img> e <audio>)
   */
  @Get(':filename')
  async getMedia(@Param('filename') filename: string, @Res() res: Response) {
    try {
      // Verificar se arquivo existe
      await this.mediaService.getFilePath(filename);

      // Enviar arquivo - usar apenas o filename, root já aponta para process.cwd()
      // O caminho será: process.cwd() + './uploads/' + filename
      const filePath = path.join('uploads', filename);
      return res.sendFile(filePath, { root: process.cwd() });
    } catch (error) {
      console.error(`❌ Erro ao servir mídia ${filename}:`, error.message);
      throw new BadRequestException('Arquivo não encontrado');
    }
  }
}

