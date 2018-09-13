/* eslint-disable no-unused-expressions */
const { expect } = require('chai')
const redis = require('redis')
const Bluebird = require('bluebird')
const _ = require('lodash')

const redisOptions = require('../../testing/config')
const { BlockClient, BlockServer, BatchClient, BatchServer } = require('../..')

Bluebird.promisifyAll([redis.RedisClient, redis.Multi])

describe('RPC', () => {
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
			describe('Client', () => {
				it('Invoke && Timeout', async () => {
					const client = new Client(redisOptions)
					await client.invoke('req', { content: 'Hello World' })
						.catch((err) => {
							expect(err.message).eql('operation timed out')
						})
					client.close()
				})

				it('Invoke && OverFlow', async () => {
					const client = new Client(redisOptions, {}, { push_queue_size: 5 })
					const promiseList = []
					for (let i = 0; i < 10; i += 1) {
						promiseList.push(client.invoke('req', { content: 'Hello World' })
							.catch((err) => {
								expect(err.message).eql(i < 5 ? 'overflow' : 'operation timed out')
							}))
					}
					await Promise.all(promiseList)
					client.close()
				})

				it('Invoke && Check data structure in Redis', async () => {
					const client = new Client(redisOptions)
					const blockRedisClient = redisClient.duplicate()

					const request = { content: 'Hello World' }

					const blpop = blockRedisClient.blpopAsync('rpc:req', 0)

					await client.invoke('req', request)
						.catch((err) => {
							expect(err.message).eql('operation timed out')
						})

					const [channel, originMessage] = await blpop
					expect(channel).to.eql('rpc:req')
					expect(originMessage).to.not.be.null
					expect(() => JSON.parse(originMessage)).to.not.throw(Error)
					const message = JSON.parse(originMessage)
					expect(message).to.have.property('replyTo')
					expect(/^rpc:([0-9a-f]){32}$/.test(message.replyTo)).to.be.true
					expect(message).to.have.property('correlationId').have.lengthOf(32)
					expect(message).to.have.property('data').and.eql(request)
					expect(message).to.have.property('timestamp').and.closeTo(Date.now(), 200)

					client.close()
					blockRedisClient.end(false)
				})

				it('Invoke && Rename data structure && Check data structure in Redis', async () => {
					const client = new Client(redisOptions, {
						replyTo_key: 'res_queue_name',
						correlationId_key: 'datagrams_id',
						data_key: 'datagrams',

						queueName: 'req:test',
					})
					const blockRedisClient = redisClient.duplicate()

					const request = { content: 'Hello World' }

					const blpop = blockRedisClient.blpopAsync('rpc:req', 0)

					await client.invoke('req', request)
						.catch((err) => {
							expect(err.message).eql('operation timed out')
						})

					const [channel, originMessage] = await blpop
					expect(channel).to.eql('rpc:req')
					expect(originMessage).to.not.be.null // eslint-disable-line no-unused-expressions
					expect(() => JSON.parse(originMessage)).to.not.throw(Error)
					const message = JSON.parse(originMessage)
					expect(message).to.have.property('res_queue_name').and.eql('rpc:req:test')
					expect(message).to.have.property('datagrams_id').have.lengthOf(32)
					expect(message).to.have.property('datagrams').and.eql(request)
					expect(message).to.have.property('timestamp').and.closeTo(Date.now(), 200)

					client.close()
					blockRedisClient.end(false)
				})

				it('Invoke && Response', async () => {
					const client = new Client(redisOptions)
					const blockRedisClient = redisClient.duplicate()

					const request = { content: 'Hello World' }
					const reponse = { content: 'Get It' }

					blockRedisClient.blpopAsync('rpc:req', 0).then(([, originMessage]) => {
						const message = JSON.parse(originMessage)
						blockRedisClient.lpushAsync(message.replyTo, JSON.stringify({
							correlationId: message.correlationId,
							data: reponse,
						}))
					})

					const result = await client.invoke('req', request)
					expect(result).eql(reponse)

					client.close()
					blockRedisClient.end(false)
				})
			})

			describe('Server', () => {
				it('Process', () => async () => {
					const server = new Server(redisOptions)

					const replyTo = ['rpc', 'res', Server.getUUID()].join(':')
					const correlationId = Server.getUUID()
					const requestContent = { content: 'Hello World' }
					const responseContent = { content: 'Get it' }

					server.process('req', async (request) => {
						expect(request).to.have.property('timestamp').and.closeTo(Date.now(), 200)
						expect(request).to.have.property('data').and.eql(requestContent)
						return responseContent
					})


					const blockRedisClient = redisClient.duplicate()
					const blpop = blockRedisClient.blpopAsync(replyTo, 0)

					await redisClient.rpushAsync('rpc:req', JSON.stringify({
						replyTo,
						correlationId,
						data: requestContent,
						timestamp: Date.now(),
					}))

					const [channel, stringResult] = await blpop
					expect(channel).eql(replyTo)
					expect(() => JSON.parse(stringResult)).to.not.throw(Error)
					const result = JSON.parse(stringResult)
					expect(result).to.have.property('correlationId').have.lengthOf(32)
					expect(result).to.have.property('data').and.eql(responseContent)

					server.close()
					blockRedisClient.end(false)
				})

				it('Process && Rename', async () => {
					const server = new Server(redisOptions, {
						replyTo_key: 'res_queue_name',
						correlationId_key: 'datagrams_id',
						data_key: 'datagrams',
					})

					const replyTo = ['rpc', 'res', Server.getUUID()].join(':')
					const correlationId = Server.getUUID()
					const requestContent = { content: 'Hello World' }
					const responseContent = { content: 'Get it' }

					server.process('req', async (request) => {
						expect(request).to.have.property('timestamp').and.closeTo(Date.now(), 200)
						expect(request).to.have.property('datagrams').and.eql(requestContent)
						return responseContent
					})


					const blockRedisClient = redisClient.duplicate()
					const blpop = blockRedisClient.blpopAsync(replyTo, 0)

					await redisClient.rpushAsync('rpc:req', JSON.stringify({
						res_queue_name: replyTo,
						datagrams_id: correlationId,
						datagrams: requestContent,
						timestamp: Date.now(),
					}))

					const [channel, stringResult] = await blpop
					expect(/^rpc:res:([0-9a-f]){32}$/.test(channel)).to.be.true
					expect(() => JSON.parse(stringResult)).to.not.throw(Error)
					const result = JSON.parse(stringResult)
					expect(result).to.have.property('datagrams_id').have.lengthOf(32)
					expect(result).to.have.property('datagrams').and.eql(responseContent)

					server.close()
					blockRedisClient.end(false)
				})
			})

			describe('Joint', () => {
				it('Base', async () => {
					const server = new Server(redisOptions)
					const client = new Client(redisOptions)

					const requestContent = { content: 'Hello World' }
					const responseContent = { content: 'Get it' }

					server.process('req', async (request) => {
						expect(request).to.have.property('timestamp').and.closeTo(Date.now(), 200)
						expect(request).to.have.property('data').and.eql(requestContent)
						return responseContent
					})

					const result = await client.invoke('req', requestContent)
					expect(result).eql(responseContent)

					server.close()
					client.close()
				})

				it('Rename', async () => {
					const server = new Server(redisOptions, {
						replyTo_key: 'res_queue_name',
						correlationId_key: 'datagrams_id',
						data_key: 'datagrams',
					})
					const client = new Client(redisOptions, {
						replyTo_key: 'res_queue_name',
						correlationId_key: 'datagrams_id',
						data_key: 'datagrams',
					})

					const requestContent = { content: 'Hello World' }
					const responseContent = { content: 'Get it' }

					server.process('req', async (request) => {
						expect(request).to.have.property('timestamp').and.closeTo(Date.now(), 200)
						expect(request).to.have.property('datagrams').and.eql(requestContent)
						return responseContent
					})

					const result = await client.invoke('req', requestContent)
					expect(result).eql(responseContent)

					server.close()
					client.close()
				})
			})
		})
	})
})
