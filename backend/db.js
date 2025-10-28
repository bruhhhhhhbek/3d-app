import { Pool } from "pg"

const pool = new Pool( {
	user: process.env.PG_USER,
	host: process.env.PG_HOST,
	database: process.env.PG_DATABASE,
	password: process.env.PG_PASSWORD,
	port: process.env.PG_PORT,
	max: 20,
	idleTimeoutMillis: 30_000,
	connectionTimeoutMillis: 2_000,
} )

let client = null

export async function query( sql, ...data ) {

	try {

		client = await pool.connect()

		const result = await client.query( sql, data )

		return result.rows
	}
	finally {

		client.release()
	}
}
