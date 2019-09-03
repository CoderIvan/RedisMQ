const Base = require('./')

const DEFAULT_OPTIONS = {
	replyTo_key: 'replyTo',
	correlationId_key: 'correlationId',
	data_key: 'data',
}

module.exports = class Server extends Base {
	constructor(engine, options) {
		super(engine, { ...DEFAULT_OPTIONS, ...options })
	}

	process(queue, handle, errorHandle) {
		this.engine.pop(this.getNames(queue), (message) => {
			const json = Base.parse(message)
			const result = handle({
				[this.options.data_key]: json[this.options.data_key],
				timestamp: json.timestamp,
			})

			const replyTo = json[this.options.replyTo_key]
			const correlationId = json[this.options.correlationId_key]
			if (replyTo && correlationId) {
				Promise.resolve(result).then((data) => {
					this.engine.push(replyTo, Base.stringify({
						[this.options.correlationId_key]: correlationId,
						[this.options.data_key]: data,
					}))
				})
			}
		}, errorHandle)
	}
}
