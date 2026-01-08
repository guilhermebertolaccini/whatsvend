import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ScheduleModule } from '@nestjs/schedule';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MulterModule.register({
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
        },
      }),
      limits: {
        fileSize: 16 * 1024 * 1024, // 16MB (limite WhatsApp)
      },
    }),
  ],
  controllers: [MediaController],
  providers: [MediaService, PrismaService],
  exports: [MediaService],
})
export class MediaModule {}

