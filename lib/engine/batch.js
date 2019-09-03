const Base = require('./')

const DEFAULT_OPTIONS = {
	push_interval: 10,
	push_threshold: 6000,
	push_queue_size: 10000,
	push_expire_seconds: 5 * 60,

	pull_interval: 10,
	pull_threshold: 6000,
}

module.exports = class BatchEngine extends Base {
	constructor(redisOptions, options) {
		super(redisOptions, { ...DEFAULT_OPTIONS, ...options })

		this.client = this.createClient()

		this.queues = new Map()

		const circle = () => {
			if (!this.client || this.client.closing) {
				return
			}
			if (!this.client.connected) {
				this.client.once('connect', circle)
				return
			}
			const intervalFunc = () => {
				setTimeout(circle, this.options.push_interval)
			}
			this.batchPush().then(intervalFunc).catch(intervalFunc)
		}

		circle()
	}

	pop(queue, onProcess, onError = () => {}) {
		const circle = () => {
			if (!this.client || this.client.closing) {
				return
			}
			if (!this.client.connected) {
				this.client.once('connect', circle)
				return
			}

			this.client.multi()
				.lrange(queue, 0, this.options.pull_threshold - 1)
				.ltrim(queue, this.options.pull_threshold, -1)
				.execAsync()
				.then(([messages]) => {
					process.nextTick(() => {
						messages.forEach(onProcess)
					})
				})
				.catch(onError)
				.finally(() => {
					setTimeout(circle, this.options.pull_interval)
				})
		}

		circle()
	}

	async push(queue, message) {
		if (!this.queues.has(queue)) {
			this.queues.set(queue, [])
		}
		this.queues.get(queue).push(message)

		if (this.queues.get(queue).size > this.options.push_threshold) {
			await this.batchPush()
		}
	}

	async batchPush() {
		if (this.queues.size === 0) {
			return
		}

		// 如果指定push_queue_size，则限制队列的长度
		// 限制队列的情况下，如果队列达到push_queue_size值，应该提出警告，方便调用者监控与处理
		const promiseList = []
		this.queues.forEach((messages, replyTo) => {
			const multi = this.client.multi()
			multi.rpush(replyTo, messages)
			if (this.options.push_queue_size) {
				multi
					.lrange(replyTo, 0, -this.options.push_queue_size - 1)
					.ltrim(replyTo, -this.options.push_queue_size, -1)
			}
			if (this.options.push_expire_seconds && this.options.push_expire_seconds > 0) {
				multi.expire(replyTo, this.options.push_expire_seconds)
			}
			const result = multi.execAsync().then(([, overflowMessages]) => {
				// 被Ltrim的部分由于无法被consumer处理，所以需要通知调用者 (例如：缓存)
				if (this.options.push_queue_size && overflowMessages && overflowMessages.length) {
					overflowMessages.forEach(this.emit.bind(this, 'overflow'))
				}
			})
			promiseList.push(result)
		})
		this.queues.clear()

		await Promise.all(promiseList)
	}
}
