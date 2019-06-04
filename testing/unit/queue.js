/* eslint-env mocha */
// eslint-disable-next-line import/no-extraneous-dependencies
const { expect } = require('chai')
const redis = require('redis')
const Bluebird = require('bluebird')
const _ = require('lodash')

const redisOptions = require('../../testing/config')
const { BlockClient, BlockServer, BatchClient, BatchServer } = require('../../')

Bluebird.promisifyAll([redis.RedisClient, redis.Multi])

describe('Queue', () => {
	let redisClient

	async function checkEmpty() {
		const keys = await redisClient.keysAsync('*')
		if (keys && keys.length > 0) {
			throw new Error('db in redis is not empty')
		}
	}

	before(async () => {
		if (!redisClient) {
			redisClient = redis.createClient(redisOptions)
		}
		await checkEmpty()
	})

	beforeEach(() => redisClient.flushdbAsync())

	afterEach(() => redisClient.flushdbAsync())

	after(async () => {
		await checkEmpty()
		if (redisClient) {
			redisClient.end(false)
		}
	})

	_.forEach([
		{ mode: 'Block', Client: BlockClient, Server: BlockServer },
		{ mode: 'Batch', Client: BatchClient, Server: BatchServer },
	], ({ mode, Client, Server }) => {
		describe(`${mode}`, () => {
			it('Base', async () => {
				const client = new Client(redisOptions)
				const server = new Server(redisOptions)
				expect(client).to.not.be.null // eslint-disable-line no-unused-expressions
				expect(server).to.not.be.null // eslint-disable-line no-unused-expressions

				const queueName = 'test'
				const content = { content: 'Hello World' }

				const p = new Promise((resolve, reject) => {
					server.process(queueName, resolve, reject)
				})
				await client.send(queueName, content)
				const message = await p
				expect(message).to.not.be.null // eslint-disable-line no-unused-expressions
				expect(message).to.have.property('data').and.eql(content)
				expect(message).to.have.property('timestamp').and.closeTo(Date.now(), 100)

				client.close()
				server.close()
			})
		})
	})
})
