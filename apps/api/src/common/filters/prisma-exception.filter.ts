import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/**
 * Global exception filter. Without it, raw Prisma errors (P2002 unique clash,
 * P2025 record-not-found, P2003 FK violation) and any non-HttpException bubbled
 * up as an opaque HTTP 500 with a leaked stack. This maps the common ones to the
 * right status so duplicates return 409, missing rows 404, etc.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    // Pass through anything already modelled as an HTTP error.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return res.status(status).json(this.body(status, exception.getResponse()));
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const { status, message } = this.mapPrisma(exception);
      return res.status(status).json(this.body(status, message));
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return res.status(HttpStatus.BAD_REQUEST).json(this.body(HttpStatus.BAD_REQUEST, 'Invalid request data.'));
    }

    // Unknown/unexpected — log the detail server-side, return a generic 500.
    this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(this.body(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error.'));
  }

  private mapPrisma(e: Prisma.PrismaClientKnownRequestError): { status: number; message: string } {
    switch (e.code) {
      case 'P2002': {
        const target = (e.meta?.target as string[] | string | undefined);
        const fields = Array.isArray(target) ? target.join(', ') : target;
        return { status: HttpStatus.CONFLICT, message: fields ? `A record with this ${fields} already exists.` : 'This record already exists.' };
      }
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, message: 'The requested record was not found.' };
      case 'P2003':
        return { status: HttpStatus.BAD_REQUEST, message: 'Related record does not exist (foreign key constraint).' };
      case 'P2000':
        return { status: HttpStatus.BAD_REQUEST, message: 'A provided value is too long for its field.' };
      default:
        this.logger.warn(`Unmapped Prisma error ${e.code}: ${e.message}`);
        return { status: HttpStatus.BAD_REQUEST, message: 'The request could not be processed.' };
    }
  }

  private body(status: number, message: unknown) {
    const msg = typeof message === 'string' ? message : (message as { message?: unknown })?.message ?? message;
    return { statusCode: status, message: msg, timestamp: new Date().toISOString() };
  }
}
