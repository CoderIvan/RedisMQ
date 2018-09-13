const Server = require('../../../../lib/base/server')
const BatchEngine = require('../../../../lib/engine/batch')

module.exports = class BlockServer extends Server {
	constructor(redisOptions, serverOptions, engineOptions) {
		super(new BatchEngine(redisOptions, engineOptions), serverOptions)
	}
}
