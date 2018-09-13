const Bluebird = require('bluebird')
const _ = require('lodash')
const Base = require('./')

const DEFAULT_OPTIONS = {
	replyTo_key: 'replyTo',
	correlationId_key: 'correlationId',
	data_key: 'data',

	timeout: 100,
}

module.exports = class Client extends Base {
	constructor(engine, options) {
		super(engine, _.extend({}, DEFAULT_OPTIONS, options))
	}

	send(queue, data) {
		return this.engine.push(this.getNames(queue), Base.stringify({
			[this.options.data_key]: data,
			timestamp: Date.now(),
		}))
	}

	invoke(queue, data) {
		if (!this.pullQueue) {
			this.pullQueue = this.getNames(this.options.queueName || Base.getUUID())

			this.engine.pop(this.pullQueue, (message) => {
				const json = Base.parse(message)
				this.emit(json[this.options.correlationId_key], json[this.options.data_key])
			})

			this.engine.on('overflow', (message) => {
				const json = Base.parse(message)
				this.emit(`overflow:${json[this.options.correlationId_key]}`)
			})
		}

		const correlationId = Base.getUUID()
		const response = (new Bluebird((resolve, reject) => {
			this.once(correlationId, resolve)
			this.once(`overflow:${correlationId}`, () => reject(new Error('overflow')))
		})).timeout(this.options.timeout).finally(() => {
			this.removeAllListeners(correlationId)
			this.removeAllListeners(`overflow:${correlationId}`)
		})

		return this.engine.push(this.getNames(queue), Base.stringify({
			[this.options.data_key]: data,
			[this.options.replyTo_key]: this.pullQueue,
			[this.options.correlationId_key]: correlationId,
			timestamp: Date.now(),
		})).then(() => response)
	}
}
