const Client = require('../../../../lib/base/client')
const BatchEngine = require('../../../../lib/engine/batch')

module.exports = class BlockClient extends Client {

	constructor(redisOptions, clientOptions, engineOptions) {
		super(new BatchEngine(redisOptions, engineOptions), clientOptions)
	}

}
