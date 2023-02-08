import 'mocha'
import type { Knex } from 'knex'
import * as chai from 'chai'
import chaiUuid from 'chai-uuid'
import { getDatabaseConnection } from '@test/util/getDatabaseConnection'
import { initializeUser } from '@test/util/requests/initializeUser'
import { createStandardOrganisation } from '@test/util/requests/createStandardOrganisation'
import { cleanAndRefillDatabase } from '@test/util/database/cleanAndRefillDatabase'
import { getUserRequest } from '@test/util/requests/getUser'
import { createCustomFields, createCustomFieldTranslations } from '@test/util/database/createCustomFields'
import { createOrganisationGroup } from '@test/util/database/createOrganisationGroup'
import { updateUserRequest } from '@test/util/requests/updateUser'
import { createHealthConditions } from '@test/util/database/addHealthConditions'
import { addUserHealthCondition } from '@test/util/database/addUserHealthConditions'

chai.use(chaiUuid)
const expect = chai.expect

describe('@legacy/handlers/thirdparty/v2/user/{userId} [GET]', function() {
    let connection: Knex

    beforeEach(async () => {
        connection = getDatabaseConnection()

        await cleanAndRefillDatabase(connection)
    })

    afterEach(async () => {
        await connection.destroy()
    })

    it('Should not access without correct access key', async () => {
        return await getUserRequest('', '2045f64a-8363-4752-9121-1021772bd952')
            .then(response => {
                expect(response.status).to.be.equal(401)
                expect(response.body).to.deep.equal({ message: 'Unauthorized' })
            })
    })

    it('Should validate user input', async () => {
        const { accessKey, organisationId } = await createStandardOrganisation()
        const { accessKey: accessKey2, organisationId: organisationId2 } = await createStandardOrganisation()
        await initializeUser(connection, accessKey, organisationId)
        const { userId: userId2 } = await initializeUser(connection, accessKey2, organisationId2)

        const response7 = await getUserRequest(accessKey, '')
        const response8 = await getUserRequest(accessKey, 'sadas')
        const response9 = await getUserRequest(accessKey, '2045f64a-8363-4752-9121-1021772bd952')
        const response10 = await getUserRequest(accessKey, userId2)

        expect(response7.body).to.deep.equal({})
        expect(response7.status).to.be.equal(404)
        expect(response8.body).to.deep.equal({
            message: 'Invalid UserId, must be a UUID',
            code: 'validation',
        })
        expect(response8.status).to.be.equal(400)
        expect(response9.body).to.deep.equal({
            'message': 'There is no user',
            'code': 'not_found',
        })
        expect(response9.status).to.be.equal(404)
        expect(response10.body).to.deep.equal({
            'message': 'There is no user in specified organisation',
            'code': 'unauthorized',
        })
        expect(response10.status).to.be.equal(401)

        return true
    })

    it('Should validate custom fields', async () => {
        const { accessKey, organisationId } = await createStandardOrganisation()
        const { userId, email } = await initializeUser(connection, accessKey, organisationId)
        const organisationGroupId = await createOrganisationGroup(connection, organisationId)

        await createHealthConditions(connection)
        await createCustomFields(connection, organisationId)
        await createCustomFieldTranslations(connection)

        const response1 = await getUserRequest(accessKey, userId)

        expect(response1.body).to.deep.equal({
            'betaBlockers': false,
            'customFields': [],
            'email': email,
            'firstName': 'TestFirstName',
            'healthConditions': [],
            'lastName': 'TestLastName',
        })
        expect(response1.status).to.be.equal(200)

        const response2 = await updateUserRequest(accessKey, userId, {
            'firstName': 'Firr',
            'lastName': 'Lastttt',
            'userGroup': organisationGroupId,
            'membershipId': 'iieiueui',
            'gender': 'FEMALE',
            'customFields': [
                {
                    'name': 'alpha',
                    'value': '1221nn',
                },
                {
                    'name': 'num',
                    'value': '12',
                },
                {
                    'name': 'date',
                    'value': '2019-02-10',
                },
                {
                    'name': 'mail',
                    'value': 'dasd@gmail.com',
                },
            ],
        })

        expect(response2.body).to.be.empty
        expect(response2.status).to.be.equal(204)

        const profile2 = await getUserRequest(accessKey, userId)

        expect(profile2.body).to.be.deep.equal({
            'betaBlockers': false,
            'customFields': [
                {
                    'name': 'alpha',
                    'value': '1221nn',
                },
                {
                    'name': 'num',
                    'value': '12',
                },
                {
                    'name': 'date',
                    'value': '2019-02-10',
                },
                {
                    'name': 'mail',
                    'value': 'dasd@gmail.com',
                },
            ],
            'email': email,
            'firstName': 'Firr',
            'healthConditions': [],
            'lastName': 'Lastttt',
            'membershipId': 'iieiueui',
            'userGroup': organisationGroupId,
        })

        await addUserHealthCondition(connection, userId, '60a9983e-8662-4387-bc2c-87a0604b4049')
        await addUserHealthCondition(connection, userId, '9a90e361-758e-428e-9bc3-ee089cf47fe5')
        await addUserHealthCondition(connection, userId, '8602442c-b47d-4133-abb3-a3e2e47c0668')

        const profile3 = await getUserRequest(accessKey, userId)

        expect(profile3.body).to.be.deep.equal({
            'betaBlockers': false,
            'customFields': [
                {
                    'name': 'alpha',
                    'value': '1221nn',
                },
                {
                    'name': 'num',
                    'value': '12',
                },
                {
                    'name': 'date',
                    'value': '2019-02-10',
                },
                {
                    'name': 'mail',
                    'value': 'dasd@gmail.com',
                },
            ],
            'email': email,
            'firstName': 'Firr',
            'healthConditions': [
                '60a9983e-8662-4387-bc2c-87a0604b4049',
                '9a90e361-758e-428e-9bc3-ee089cf47fe5',
                '8602442c-b47d-4133-abb3-a3e2e47c0668',
            ],
            'lastName': 'Lastttt',
            'membershipId': 'iieiueui',
            'userGroup': organisationGroupId,
        })

        return true
    })
})
