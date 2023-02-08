import { Knex } from 'knex'
import { Email } from '@domain/shared/Email'
import { injectable } from 'inversify'
import { BaseKnex } from '@infrastructure/persistence/knex'
import { userMapper } from '@infrastructure/persistence/knex/user/userMapper'
import { InvitationTableTypes } from '@infrastructure/persistence/knex/invitation/invitationMapper'
import { userCustomFieldMapper } from '@infrastructure/persistence/knex/user/userCustomFieldMapper'
import { userHealthConditionMapper } from '@infrastructure/persistence/knex/user/userHealthConditionMapper'
import { UserRepository } from '@domain/entity/user/UserRepository'
import { UUID } from '@domain/shared/UUID'
import { User } from '@domain/entity/user/User'
import { DTO } from '@kernel/ddd/DTO'
import { UserFactory } from '@domain/entity/user/UserFactory'
import { UserCustomField } from '@domain/entity/user/models/UserCustomField'
import { MembershipId } from '@domain/shared/MembershipId'
import { installationMapper, InstallationTableTypes } from '@infrastructure/persistence/knex/user/installationMapper'

interface UserCustomFieldDB {
    custom_field_id: string
    profile_id: string
    value: string
}

@injectable()
export class UserRepositoryKnex extends BaseKnex implements UserRepository {
    private readonly _mapper = userMapper
    private readonly _installationMapper = installationMapper
    private readonly _customFieldMapper = userCustomFieldMapper
    private readonly _healthConditionMapper = userHealthConditionMapper

    findById(id: UUID) {
        const columnsMapping = this._mapper.getColumnsMapping()
        return this.createPromiseFailable<User | null, User>(
            this._findOne(queryBuilder => queryBuilder.where(columnsMapping.id, id.toDTO())),
            `There is no user with id ${id.toDTO()}`,
        )
    }

    findByEmail(email: Email) {
        const columnsMapping = this._mapper.getColumnsMapping()
        return this.createPromiseFailable<User | null, User>(
            this._findOne(queryBuilder => queryBuilder.where(columnsMapping.email, email.toDTO())),
            `There is no user with email ${email.toDTO()}`,
        )
    }

    findByOrganisationIdAndMembershipId(organisationId: UUID, membershipId: MembershipId) {
        const columnsMapping = this._mapper.getColumnsMapping()

        return this.createPromiseFailable<User | null, User>(
            this._findOne(
                queryBuilder => queryBuilder
                    .where(columnsMapping.membershipId, membershipId.toDTO())
                    .andWhere(columnsMapping.organisationId, organisationId.toDTO()),
            ),
            `There is no user with membership id ${membershipId.toDTO()}`,
        )
    }

    async findByEmailAndOrganisationId(email: Email, organisationId: UUID): Promise<User | null> {
        const columnsMapping = this._mapper.getColumnsMapping()

        return this._findOne(queryBuilder =>
            queryBuilder
                .where(columnsMapping.email, email.toDTO())
                .andWhere(columnsMapping.organisationId, organisationId.toDTO()),
        )
    }

    async findByIdAndOrganisationId(userId: UUID, organisationId: UUID): Promise<User | null> {
        const columnsMapping = this._mapper.getColumnsMapping()

        return this._findOne(queryBuilder =>
            queryBuilder
                .where(columnsMapping.id, userId.toDTO())
                .andWhere(columnsMapping.organisationId, organisationId.toDTO()),
        )
    }

    private async _findOne(
        where: Knex.QueryCallback<InvitationTableTypes, InvitationTableTypes>,
    ): Promise<User | null> {
        const db = await this._knex.getSession()
        const columnsMapping = this._mapper.getColumnsMapping()
        const data = await db
            .from<DTO<User>>(this._mapper.getSelectAlias())
            .first(columnsMapping)
            .where(where)

        if (!data) {
            return null
        }

        const [healthConditions, customFields, isPushEnabled] = await Promise.all([
            this._findHealthConditions(data.id),
            this._findCustomFields(data.id),
            this._findIsPushEnabled(data.id),
        ])

        return UserFactory.fromDTO({
            ...data,
            settings: {
                isPushEnabled,
                unitSystem: data.unitSystem,
                isMarketingConsentEnabled: data.isMarketingConsentEnabled,
            },
            name: data.firstName && data.lastName
                ? {
                    first: data.firstName,
                    last: data.lastName,
                }
                : undefined,
            betaBlockers: false,
            healthConditions,
            customFields,
        })
    }

    private async _findHealthConditions(userId: string): Promise<string[]> {
        const db = await this._knex.getSession()
        const columnsMapper = this._healthConditionMapper.getColumnsMapping()
        const data = await db
            .from(this._healthConditionMapper.getSelectAlias())
            .select<{ id: string }[], { id: string }[]>({ id: columnsMapper.conditionId })
            .where(columnsMapper.profileId, userId)
        return data ? data.map(row => row.id) : []
    }

    private async _findIsPushEnabled(userId: string): Promise<boolean> {
        const db = await this._knex.getSession()
        const columnsMapper = this._installationMapper.getColumnsMapping()
        const data = await db
            .from(this._installationMapper.getSelectAlias())
            .select<InstallationTableTypes[]>({ pushPreference: columnsMapper.pushPreference })
            .where(columnsMapper.userId, userId)
            .first()

        return !data ? false : data.pushPreference
    }

    private async _findCustomFields(userId: string): Promise<DTO<UserCustomField>[]> {
        const db = await this._knex.getSession()
        const columnsMapper = this._customFieldMapper.getColumnsMapping()
        const data = await db
            .from<DTO<UserCustomField>, DTO<UserCustomField>[]>(this._customFieldMapper.getSelectAlias())
            .innerJoin<DTO<UserCustomField>>({ cf: 'custom_field' }, 'cf.id', columnsMapper.customFieldId)
            .select({
                id: columnsMapper.customFieldId,
                name: 'cf.name',
                type: 'cf.type',
                value: columnsMapper.value,
                organisationId: 'cf.organisation_id',
            })
            .where(columnsMapper.profileId, userId)

        if (data) {
            const promises = data.map(row => db.from({ cft: 'custom_field_translation' })
                .select({ locale: 'cft.locale', name: 'cft.name' })
                .where('cft.custom_field_id', row.id)
                .then(translations => ({ ...row, translations: translations ?? [] })),
            )

            return Promise.all(promises)
        }

        return []
    }

    async save(user: User): Promise<User> {
        const db = await this._knex.startTransaction()
        const data = user.toDTO()
        const columnsMapper = this._mapper.getColumnsMapping('')

        try {
            await db
                .into(this._mapper.getTableName())
                .insert({
                    [columnsMapper.id]: data.id,
                    [columnsMapper.email]: data.email,
                    [columnsMapper.region]: data.region,
                    [columnsMapper.firstName]: data.name?.first,
                    [columnsMapper.lastName]: data.name?.last,
                    [columnsMapper.dateOfBirth]: data.dateOfBirth,
                    [columnsMapper.gender]: data.gender,
                    [columnsMapper.topic]: data.topic,
                    [columnsMapper.organisationGroupId]: data.organisationGroupId,
                    [columnsMapper.organisationId]: data.organisationId,
                    [columnsMapper.invitationCode]: data.invitationCode,
                    [columnsMapper.membershipId]: data.membershipId,
                    [columnsMapper.unitSystem]: data.settings.unitSystem,
                    [columnsMapper.isMarketingConsentEnabled]: data.settings.isMarketingConsentEnabled,
                    [columnsMapper.rewardSchemeId]: data.rewardSchemeId,
                    [columnsMapper.timezone]: data.timezone,
                })
                .onConflict(columnsMapper.id)
                .merge()

            await this._saveUserHealthConditions(db, data)
            await this._saveUserCustomFields(db, data)
        } catch (e) {
            throw e instanceof Error ? e : new Error(e as string)
        }

        return user
    }

    private async _saveUserHealthConditions(trx: Knex.QueryInterface, user: DTO<User>) {
        const columnsMapper = this._healthConditionMapper.getColumnsMapping('')
        const data = user.healthConditions.map(hc => ({
            [columnsMapper.profileId]: user.id,
            [columnsMapper.conditionId]: hc,
        }))

        await this._deleteUserHealthConditions(trx, user)

        if (!data.length) {
            return
        }

        await trx
            .into(this._healthConditionMapper.getTableName())
            .insert(data)
            .onConflict([
                columnsMapper.profileId,
                columnsMapper.conditionId,
            ])
            .merge()
    }

    private async _deleteUserHealthConditions(
        trx: Knex.QueryInterface,
        user: DTO<User>,
    ) {
        const columnsMapper = this._healthConditionMapper.getColumnsMapping('')

        return trx
            .delete()
            .from(this._healthConditionMapper.getTableName())
            .where(columnsMapper.profileId, user.id)
            .whereNotIn(columnsMapper.conditionId, user.healthConditions.map(hc => hc))
    }

    private async _updateUserCustomFields(
        trx: Knex.QueryInterface,
        userCustomFields: Record<string, string>[],
    ): Promise<UserCustomFieldDB[]> {
        if (!userCustomFields.length) {
            return []
        }

        const columnsMapper = this._customFieldMapper.getColumnsMapping('')

        return trx
            .insert(userCustomFields)
            .into(this._customFieldMapper.getTableName())
            .onConflict([columnsMapper.customFieldId, columnsMapper.profileId])
            .merge()
            .returning('*')
    }

    private async _deleteUserCustomFields(
        trx: Knex.QueryInterface,
        userId: string,
        userCustomFieldIds: string[],
    ) {
        const columnsMapper = this._customFieldMapper.getColumnsMapping('')

        return trx
            .delete()
            .from(this._customFieldMapper.getTableName())
            .where(columnsMapper.profileId, userId)
            .whereNotIn(columnsMapper.customFieldId, userCustomFieldIds)
    }

    private async _saveUserCustomFields(trx: Knex.QueryInterface, user: DTO<User>) {
        const columnsMapper = this._customFieldMapper.getColumnsMapping('')
        const customFields = user.customFields.map(cf => ({
            [columnsMapper.customFieldId]: cf.id,
            [columnsMapper.profileId]: user.id,
            [columnsMapper.value]: cf.value,
        }))
        const savedUserCustomFields = await this._updateUserCustomFields(trx, customFields)

        await this._deleteUserCustomFields(trx, user.id, savedUserCustomFields.map(d => d.custom_field_id))
    }

    async delete(id: UUID) {
        // NOTE: we are manually managing the transactions here because deleting a user is a multi-step process. We
        //  need to ensure that the database operation is complete before moving on to the next step. @see the
        //  deleteUser command for more info.

        const tx = await this._knex.startTransaction()
        const columnsMapper = this._mapper.getColumnsMapping('')
        try {
            await tx
                .delete()
                .from(this._mapper.getTableName())
                .where(columnsMapper.id, id.toDTO())
            await this._knex.commitTransaction()
            return true
        } catch (e) {
            await this._knex.rollbackTransaction()
            throw e instanceof Error ? e : new Error(e as string)
        }
    }
}
