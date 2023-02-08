import { ExpressErrorMiddlewareInterface, HttpError, Middleware } from 'routing-controllers'
import { inject, injectable } from 'inversify'
import { DI } from '@infrastructure'
import { NextFunction, Request, Response } from 'express'
import { LoggingService } from '@application/services'
import {
    DomainError,
    ErrorCode,
    ForbiddenError,
    NotFoundError,
    NotImplementedError,
    UnauthorizedError,
    ValidationError,
} from '@domain/error'
import { ValidationError as ClassValidatorValidationError } from 'class-validator'

@injectable()
@Middleware({ type: 'after' })
export class CustomErrorHandlerMiddleware implements ExpressErrorMiddlewareInterface {
    @inject(DI.LoggingService)
    private readonly _logger!: LoggingService

    private serializeErrorMessage(error: HttpError & { errors?: ClassValidatorValidationError[] }) {
        if (error.errors && error.errors[0] instanceof ClassValidatorValidationError) {
            return error.errors.map(({ property, constraints }) => ({
                property,
                errors: constraints ? Object.values(constraints) : [],
            }))
        }

        return error.message
    }

    private getDomainErrorPayload(error: DomainError) {
        return {
            message: error.params.message,
            code: error.params.code,
            payload: error.params.payload,
        }
    }

    private createHttpErrorFactory(response: Response) {
        return (httpCode: number, params: {
            message?: string | unknown,
            code?: string,
            payload?: unknown,
        }) => {
            return response.status(httpCode).json(params)
        }
    }

    async error(
        error: unknown | Error | HttpError | DomainError,
        request: Request,
        response: Response,
        next: NextFunction,
    ) {
        this._logger.error(error)

        const createHttpError = this.createHttpErrorFactory(response)

        /**
         * class-validator error detection
         * It is better to implicitly set some error instead hard-coding that
         */
        if (error instanceof HttpError) {
            return next(createHttpError(400, {
                message: this.serializeErrorMessage(error),
                code: ErrorCode.validation,
            }))
        }

        if (error instanceof ValidationError || error instanceof NotImplementedError) {
            return next(createHttpError(400, this.getDomainErrorPayload(error)))
        }

        if (error instanceof UnauthorizedError) {
            return next(createHttpError(401, this.getDomainErrorPayload(error)))
        }

        if (error instanceof ForbiddenError) {
            return next(createHttpError(403, this.getDomainErrorPayload(error)))
        }

        if (error instanceof NotFoundError) {
            return next(createHttpError(404, this.getDomainErrorPayload(error)))
        }

        return next(createHttpError(500, {
            code: 'unhandled',
        }))
    }
}
