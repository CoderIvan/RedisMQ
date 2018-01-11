const events = require('events')
const uuidV4 = require('uuid/v4')
const _ = require('lodash')

const DEFAULT_OPTIONS = {
	namespace: 'rpc',
}

module.exports = class Base extends events.EventEmitter {

	constructor(engine, options) {
		super()
		this.engine = engine
		this.options = _.extend({}, DEFAULT_OPTIONS, options)
		engine.on('error', this.emit.bind(this, 'error'))
	}

	getUUID() { // eslint-disable-line class-methods-use-this
		return uuidV4().replace(/-/g, '')
	}

	parse(string) { // eslint-disable-line class-methods-use-this
		return JSON.parse(string)
	}

	stringify(object) { // eslint-disable-line class-methods-use-this
		return JSON.stringify(object)
	}

	getNames(...args) {
		return [this.options.namespace, ...args].filter(param => !!param).join(':')
	}

	close() {
		return this.engine.close()
	}

}
