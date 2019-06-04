const Base = require('./')

const DEFAULT_OPTIONS = {
	push_queue_size: 10000,
}

module.exports = class BlockEngine extends Base {
	constructor(redisOptions, options) {
		super(redisOptions, Object.assign({}, DEFAULT_OPTIONS, options))

		this.client = this.createClient()
	}

	pop(queue, onProcess, onError = () => {}) {
		const bclient = this.createClient()
		const circle = () => {
			if (!bclient || bclient.closing) {
				return
			}
			if (!bclient.connected) {
				bclient.once('connect', circle)
				return
			}
			bclient.blpopAsync(queue, 0)
				.then(([, reply]) => {
					process.nextTick(() => {
						onProcess(reply)
					})
				})
				.catch(onError)
				.finally(circle)
		}

		circle()
	}

	push(queue, message) {
		return this.client
			.multi()
			.rpush(queue, message)
			.lrange(queue, 0, -this.options.push_queue_size - 1)
			.ltrim(queue, -this.options.push_queue_size, -1)
			.execAsync()
			.then(([, overflowMessages]) => {
				if (this.options.push_queue_size && overflowMessages && overflowMessages.length) {
					overflowMessages.forEach(this.emit.bind(this, 'overflow'))
				}
			})
	}
}
