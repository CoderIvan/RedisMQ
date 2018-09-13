const Server = require('../../../../lib/base/server')
const BlockEngine = require('../../../../lib/engine/block')

module.exports = class BlockServer extends Server {
	constructor(redisOptions, serverOptions, engineOptions) {
		super(new BlockEngine(redisOptions, engineOptions), serverOptions)
	}
}
