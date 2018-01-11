const events = require('events')
const redis = require('redis')
const Bluebird = require('bluebird')
const _ = require('lodash')

Bluebird.promisifyAll([redis.RedisClient, redis.Multi])

module.exports = class Base extends events.EventEmitter {

	constructor(redisOptions, options) {
		super()
		this.redisOptions = redisOptions
		this.options = _.extend({}, options)
		this.pool = []
	}

	createClient() {
		// 需要指定db，避免错误的输入，导致使用默认的db
		if (!this.redisOptions) {
			throw Error('redisOptions can not be null')
		}
		const { db } = this.redisOptions
		if (!(typeof db === 'number' && db >= 0 && db < 16)) {
			throw Error('redisOptions.db must between 0 and 15')
		}
		const client = redis.createClient(this.redisOptions)
		client.on('error', this.emit.bind(this, 'error'))
		this.pool.push(client)
		return client
	}

	close() {
		this.pool.forEach((client) => {
			client.end(false)
		})
		this.pool.length = 0
	}

}
