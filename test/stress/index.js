/* eslint-disable no-console */
const cluster = require('cluster')
const numCPUs = require('os').cpus().length

// eslint-disable-next-line import/no-extraneous-dependencies
const { argv } = require('yargs')

const redisOptions = require('../../testing/config')
const { BlockClient, BlockServer } = require('../..')

const queueName = 'test'

if (cluster.isMaster) {
	(async () => {
		const workers = Array.from({ length: numCPUs }).map(() => cluster.fork())
		await Promise.all(workers.map((worker) => new Promise((resolve) => {
			worker.once('message', (message) => {
				if (message === 'finish') {
					resolve()
				}
			})
		})))

		console.log(`Master ${process.pid} is running`)
		const client = new BlockClient(redisOptions, { timeout: 10 * 1000 })
		const loopTimes = argv.l || 20
		const concurrenceTimes = argv.c || 10000
		for (let i = loopTimes; i > 0; i -= 1) {
			const now = Date.now()
			await Promise.all(Array.from({ length: concurrenceTimes }).map(() => client.invoke(queueName, 'Hello World'))) // eslint-disable-line no-await-in-loop
			const totalTime = Date.now() - now
			const costTime = totalTime / concurrenceTimes
			const qps = Math.floor((1 / costTime) * 1000)
			console.log('(%d/%d) Times = %d >> Total Time = %dms >> Cost Time = %dms >> QPS = %d',
				(loopTimes - i) + 1, loopTimes, concurrenceTimes, totalTime, costTime, qps)
		}
		client.close()
		workers.forEach((worker) => {
			worker.send('end')
		})
	})()
} else {
	const server = new BlockServer(redisOptions)
	console.log(`Worker ${process.pid} is running`)
	server.process(queueName, async ({ data }) => data, console.error)

	process.once('message', (message) => {
		if (message === 'end') {
			server.close()
			process.exit(0)
		}
	})
	process.send('finish')
}
