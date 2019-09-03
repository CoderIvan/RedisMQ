const events = require('events')
const uuidV4 = require('uuid/v4')

const DEFAULT_OPTIONS = {
	namespace: 'rpc',
}

module.exports = class Base extends events.EventEmitter {
	constructor(engine, options) {
		super()
		this.engine = engine
		this.options = { ...DEFAULT_OPTIONS, ...options }
		engine.on('error', this.emit.bind(this, 'error'))
	}

	static getUUID() {
		return uuidV4().replace(/-/g, '')
	}

	static parse(string) {
		return JSON.parse(string)
	}

	static stringify(object) {
		return JSON.stringify(object)
	}

	getNames(...args) {
		return [this.options.namespace, ...args].filter((param) => !!param).join(':')
	}

	close() {
		return this.engine.close()
	}
}
