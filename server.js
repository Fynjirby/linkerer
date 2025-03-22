const express = require("express");
const { rateLimit } = require("express-rate-limit");
const sqlite3 = require("sqlite3").verbose();
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const { randomBytes } = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = "https://linkerer.glitch.me";

app.use(express.json());

app.set("trust proxy", 4);
app.use(express.static("public"));

const dbPath = path.join(__dirname, ".data", "database.db");

const db = new sqlite3.Database(dbPath, (err) => {
	console.log("Database connected successfully!");

	if (err) {
		console.error("Error connecting to the database:", err.message);
	}
});

db.run(`CREATE TABLE IF NOT EXISTS urls (
    id TEXT PRIMARY KEY,
    original_url TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

app.get("/get-iplog", (req, res) => {
	const token = req.query.token;

	if (!token || token !== process.env.ADMIN_TOKEN) {
		res.status(401).send("Unauthorized");
		return;
	}

	res.sendFile(__dirname + "/.data/iplog.txt");
});

app.get("/get-db", (req, res) => {
	const token = req.query.token;

	if (!token || token !== process.env.ADMIN_TOKEN) {
		res.status(401).send("Unauthorized");
		return;
	}

	res.sendFile(__dirname + "/.data/database.db");
});

app.post(
	"/shorten",
	rateLimit({
		windowMs: 60 * 1000,
		limit: 5,
	}),
	async (req, res) => {
		let { url, token } = req.body;

		if (!url) return res.status(400).json({ error: "URL is required" });
		if (!token) return res.status(400).json({ error: `Token is required` });

		const cfOutcome = await (
			await fetch(
				"https://challenges.cloudflare.com/turnstile/v0/siteverify",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						secret: process.env.TURNSTILE_SECRET,
						response: token,
						remoteip: req.ip,
					}),
				}
			)
		).json();

		if (!cfOutcome.success) {
			console.error("Invalid token", {
				body: req.body,
				outcome: cfOutcome,
			});
			return res
				.status(400)
				.json({ error: `Invalid token. Please refresh and try again` });
		}

		let normalizedUrl = url.trim();
		if (!/^https?:\/\//i.test(normalizedUrl)) {
			normalizedUrl = "https://" + normalizedUrl;
		} else if (normalizedUrl.startsWith("http://")) {
			normalizedUrl = "https://" + normalizedUrl.slice(7);
		}

		if (!normalizedUrl.endsWith("/")) {
			normalizedUrl += "/";
		}

		try {
			const parsedUrl = new URL(normalizedUrl);

			if (
				!parsedUrl.hostname.includes(".") ||
				parsedUrl.hostname.endsWith(".")
			) {
				return res.status(400).json({ error: "Invalid URL" });
			}
		} catch {
			return res.status(400).json({ error: "Invalid URL" });
		}

		db.get(
			"SELECT id FROM urls WHERE original_url = ?",
			[normalizedUrl],
			(err, row) => {
				if (err) return res.status(500).json({ error: err.message });

				if (row) {
					const shortUrl = `${BASE_URL}/${row.id}`;
					return res.json({ shortUrl });
				}

				const id = randomBytes(6).toString("base64url").slice(0, 6);
				const shortUrl = `${BASE_URL}/${id}`;

				db.run(
					"INSERT INTO urls (id, original_url, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
					[id, normalizedUrl],
					(err) => {
						if (err)
							return res.status(500).json({ error: err.message });
						res.json({ shortUrl });
					}
				);
			}
		);
	}
);

app.get("/:id", (req, res) => {
	const { id } = req.params;

	db.get("SELECT original_url FROM urls WHERE id = ?", [id], (err, row) => {
		if (err) return res.status(500).send("Database error");
		if (!row) return res.status(404).send("Not found");

		res.redirect(row.original_url);
	});
});

app.listen(PORT, () =>
	console.log(`Server running on http://localhost:${PORT}/`)
);
