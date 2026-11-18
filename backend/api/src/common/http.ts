import {
  ArgumentsHost,
  CallHandler,
  Catch,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
  NestMiddleware,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Observable, map } from 'rxjs';
import { AppError, type ErrorCode } from '@bizgo/shared';

export const REQUEST_ID_HEADER = 'x-request-id';

export interface RequestWithId extends Request {
  requestId: string;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(REQUEST_ID_HEADER);
    const id = incoming && /^[A-Za-z0-9._-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    (req as RequestWithId).requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
  }
}

/** Marks a handler whose return value must NOT be wrapped in the {data, meta} envelope. */
export const RAW_RESPONSE = 'bizgo:raw-response';
export const RawResponse = () => SetMetadata(RAW_RESPONSE, true);

/** Services return Paginated for list endpoints so the envelope can carry page meta. */
export class Paginated<T> {
  constructor(
    readonly items: T[],
    readonly page: number,
    readonly limit: number,
    readonly total: number,
  ) {}
}

@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (raw) return next.handle();
    const req = ctx.switchToHttp().getRequest<RequestWithId>();
    return next.handle().pipe(
      map((value) => {
        if (value instanceof Paginated) {
          return {
            data: value.items,
            meta: {
              requestId: req.requestId,
              page: value.page,
              limit: value.limit,
              total: value.total,
            },
          };
        }
        return { data: value ?? null, meta: { requestId: req.requestId } };
      }),
    );
  }
}

interface ErrorBody {
  code: ErrorCode;
  message: string;
  details: ReadonlyArray<Record<string, unknown>>;
  requestId: string;
}

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED',
};

const DEFAULT_MESSAGES: Partial<Record<ErrorCode, string>> = {
  VALIDATION_ERROR: 'Dữ liệu gửi lên không hợp lệ.',
  UNAUTHENTICATED: 'Bạn cần đăng nhập để tiếp tục.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  NOT_FOUND: 'Không tìm thấy nội dung yêu cầu.',
  RATE_LIMITED: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.',
  INTERNAL_ERROR: 'Đã có lỗi hệ thống. Vui lòng thử lại sau.',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<RequestWithId>();
    const requestId = req.requestId ?? 'unknown';

    let status = 500;
    let body: ErrorBody = {
      code: 'INTERNAL_ERROR',
      message: DEFAULT_MESSAGES.INTERNAL_ERROR as string,
      details: [],
      requestId,
    };

    if (exception instanceof AppError) {
      status = exception.status;
      body = {
        code: exception.code,
        message: exception.message,
        details: exception.details,
        requestId,
      };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const code =
        STATUS_TO_CODE[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR');
      const response = exception.getResponse();
      const details: Record<string, unknown>[] = [];
      if (typeof response === 'object' && response !== null) {
        const msgs = (response as { message?: unknown }).message;
        if (Array.isArray(msgs)) for (const m of msgs) details.push({ message: String(m) });
      }
      body = {
        code,
        message: DEFAULT_MESSAGES[code] ?? 'Yêu cầu không hợp lệ.',
        details,
        requestId,
      };
    } else {
      this.logger.error(
        `Unhandled error requestId=${requestId}: ${exception instanceof Error ? (exception.stack ?? exception.message) : String(exception)}`,
      );
    }

    if (body.code === 'RATE_LIMITED') {
      const retry = (body.details[0]?.retryAfterSec as number | undefined) ?? 60;
      res.setHeader('Retry-After', String(retry));
    }
    res.status(status).json(body);
  }
}
