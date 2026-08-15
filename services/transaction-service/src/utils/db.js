const { Pool } = require("pg");
const logger = require("./logger");
const pool = new Pool({
  connectionString: process.env.DB_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});
pool.on("error", (err) => logger.error({ message: "DB pool error", error: err.message }));
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    logger.debug({ message: "query", duration: Date.now() - start, rows: res.rowCount });
    return res;
  } catch (err) {
    logger.error({ message: "query failed", error: err.message });
    throw err;
  }
};
module.exports = { query, pool };
