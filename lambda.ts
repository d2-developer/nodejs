import 'reflect-metadata'
import awsServerlessExpress from 'aws-serverless-express'
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'
import { createExpressServer, useContainer, Action } from 'routing-controllers'
import { container } from './inversify.config'
import { DI } from '@infrastructure'
import { OrganisationSdkController } from '@api/organisation/sdk'
import { DocumentationController } from '@api/documentation/express'
import { SdkUserController } from '@api/user/sdk/SdkUserController'
import { SdkApiType } from '@infrastructure/middleware/ApiType'
import { HashService, LoggingService } from '@application/services'
import { OrganisationRepository } from '@domain/entity/organisation/OrganisationRepository'
import { OrganisationAccessKeyRepository } from '@domain/entity/organisationAccessKey/OrganisationAccessKeyRepository'
import { ApiKeyService } from '@infrastructure/ApiKeyService'
import { UUID } from '@domain/shared/UUID'


export async function handler(event: APIGatewayProxyEvent, ctx: Context): Promise<APIGatewayProxyResult> {
    useContainer(container)
    const app = createExpressServer({
        routePrefix: container.get(DI.RoutePrefix),
        authorizationChecker: async (action: Action) => {
            const _logger = container.get<LoggingService>(DI.LoggingService)
            const _orgRepo = container.get<OrganisationRepository>(DI.OrganisationRepository)
            const _hashService = container.get<HashService>(DI.HashService)
            const _orgAccessKeyRepo = container.get<OrganisationAccessKeyRepository>(DI.OrganisationAccessKeyRepository)
            const _apiKeyService = container.get(ApiKeyService)
            const key = action.request.get('x-api-key')
            let extracted
            try {
                extracted = _apiKeyService.extractKeyData(key)
            } catch (error) {
                _logger.log(error)
                return action.response.status(401).json({ message: 'Unauthorized' })
            }

            const { organisationId: organisationIdKey, secret } = extracted
            const organisationId = new UUID(organisationIdKey)
            const organisation = await _orgRepo.findById(organisationId)

            if (!organisation) {
                return action.response.status(401).json({ message: 'Unauthorized' })
            }

            const organisationAccessKey = await _orgAccessKeyRepo.findByOrganisationId(organisationId)

            if (!organisationAccessKey) {
                return action.response.status(401).json({ message: 'Unauthorized' })
            }
            const verified = await _hashService.verify(secret, {
                hash: organisationAccessKey.props.hash.toDTO(),
                salt: organisationAccessKey.props.salt.toDTO(),
                iterations: organisationAccessKey.props.iterations.toDTO(),
            })

            if (!verified) {
                _logger.log('Bad API key')
                return action.response.status(401).json({ message: 'Unauthorized' })
            }

            const apiType = new SdkApiType()
            const apiSpecifier = action.response.get('x-api-specifier') || 'sdk'

            if (!apiType.isPermittedToUse(apiSpecifier.toLowerCase())) {
                _logger.log('Not permitted')

                return action.response
                    .status(403)
                    .json({
                        message:
                        `The organisation is not permitted to use this endpoint. Please use ${apiType.url} instead.`,
                    })
            }

            if (process.env.STAGE === 'local') {
                return action.next
            }

            try {
                const [ipAddress] = (action.request.get('x-forwarded-for') || '').split(', ')
                const isWhitelisted = (
                    organisationAccessKey.props.whitelist !== undefined &&
                    _apiKeyService.contains(organisationAccessKey.props.whitelist.toDTO(), ipAddress)
                )

                if (isWhitelisted) {
                    return action.next
                }
            } catch (error) {
                _logger.log(error)
            }

            return action.response.status(403).json({ message: 'IP address does not satisfy whitelist' })
        },
        controllers: [
            OrganisationSdkController,
            DocumentationController,
            SdkUserController,
        ],
        defaultErrorHandler: false,
    })
    const server = awsServerlessExpress.createServer(app)
    return awsServerlessExpress.proxy(server, event, ctx, 'PROMISE').promise
}
