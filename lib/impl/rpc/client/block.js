const Client = require('../../../../lib/base/client')
const BlockEngine = require('../../../../lib/engine/block')

module.exports = class BlockClient extends Client {
	constructor(redisOptions, clientOptions, engineOptions) {
		super(new BlockEngine(redisOptions, engineOptions), clientOptions)
	}
}
